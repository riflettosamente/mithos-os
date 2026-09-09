/* ======================================================================
 * ΜΥΘΟΣ·OS — server Node per Render (e per qualsiasi hosting Node).
 *
 * Serve la build statica di "dist/" (prodotta da `npm run build`, cioè
 * vite build) e implementa in Node le cinque route /api/* che nel
 * progetto Next.js originale erano server-side:
 *   /api/health, /api/state, /api/llmkey, /api/llmkey/test, /api/query
 *
 * Le chiamate ai provider LLM partono DA QUI (server), quindi nessun
 * CORS: funzionano tutti i provider (Perplexity inclusa), esattamente
 * come nell'architettura originale. Riusa il motore "ORACOLO-9000"
 * (src/lib/llm.ts) senza alcuna modifica.
 *
 * Persistenza: file JSON in MYTHOS_DATA_DIR (default ./data). Zero
 * dipendenze esterne oltre a quelle già presenti. La chiave LLM della
 * sessione resta salvata lato server, come nel DB originale.
 *
 * Build:  npx esbuild server/index.ts --bundle --platform=node \
 *           --format=esm --alias:@=./src --outfile=dist/server.mjs
 * Avvio:  node dist/server.mjs
 * ====================================================================== */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs, createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { queryOracle, envConfiguredKinds, LLM_KINDS } from "../src/lib/llm";
import type { LlmKind, UserLlmConfig } from "../src/lib/llm";

/* ---------------------------------------------------------------------- */
/*  Wrappiamo la fetch globale PRIMA di qualsiasi chiamata LLM: applica    */
/*  le stesse normalizzazioni del bridge browser anche alle chiamate        */
/*  server-side (llm.ts è verbatim e usa fetch diretto).                    */
/* ---------------------------------------------------------------------- */
const GEMINI_FALLBACK = "gemini-2.5-flash";

function normalizeGemini(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.hostname !== "generativelanguage.googleapis.com") return rawUrl;
    const parts = u.pathname.split("/");
    const idx = parts.indexOf("models");
    if (idx < 0 || idx + 1 >= parts.length) return rawUrl;
    const seg = parts[idx + 1];
    const action = seg.includes(":") ? `:${seg.split(":").slice(1).join(":")}` : "";
    const model = seg.split(":")[0].trim().toLowerCase();
    const outdated =
      !model.startsWith("gemini-") ||
      model.startsWith("gemini-2.0") ||
      model.startsWith("gemini-1.5") ||
      model.startsWith("gemini-1.0");
    if (!outdated) return rawUrl;
    parts[idx + 1] = `${GEMINI_FALLBACK}${action || ":generateContent"}`;
    return `${u.origin}${parts.join("/")}${u.search}`;
  } catch {
    return rawUrl;
  }
}

const __nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  let finalInput: RequestInfo | URL = input;
  try {
    /* OpenRouter viene gestito nativamente da llm.ts tramite catalogo */
    const normalized = normalizeGemini(raw);
    if (normalized !== raw) finalInput = normalized;
  } catch { /* fallthrough */ }
  return __nativeFetch(finalInput as RequestInfo, init);
};
import type {
  BoardEntity,
  EntityRef,
  MythPage,
  PersistedState,
  QueryActionKey,
  RelationEdge,
} from "../src/lib/types";

/* ------------------------------ costanti ----------------------------- */
const PORT = Number.parseInt(process.env.PORT ?? "", 10) || 8000;
const DIST_DIR = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : resolve(process.cwd(), "dist");
const DATA_DIR = process.env.MYTHOS_DATA_DIR ? resolve(process.env.MYTHOS_DATA_DIR) : resolve(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "mythos.json");

const SID_RE = /^[\w-]{8,64}$/;
const VALID_ACTIONS: QueryActionKey[] = [
  "opening", "who", "etymology", "anecdote", "origin", "episode", "relation", "relation_deep", "cause",
];
const NEEDS_ONE: QueryActionKey[] = ["who", "etymology", "anecdote", "origin", "episode"];
const NEEDS_TWO: QueryActionKey[] = ["relation", "relation_deep", "cause"];
const USER_PROVIDERS: LlmKind[] = ["perplexity", "anthropic", "openai", "gemini", "openrouter", "groq", "cloudflare", "custom"];

/* ----------------------------- persistenza --------------------------- */
interface LlmRecord {
  provider: LlmKind;
  key: string;
  model?: string;
  url?: string;
}
interface StoredPage {
  action: QueryActionKey;
  subject: string | null;
  subject2: string | null;
  title: string;
  body: string;
  engine: string;
  at: number;
  entities: EntityRef[];
  relations: RelationEdge[];
}
interface StoredState {
  entities: BoardEntity[];
  relations: RelationEdge[];
  pages: StoredPage[];
}
interface Store {
  states: Record<string, StoredState>;
  llm: Record<string, LlmRecord>;
}

let store: Store = { states: {}, llm: {} };
let writeLock: Promise<void> = Promise.resolve();

async function loadStore(): Promise<void> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    store = { states: parsed.states ?? {}, llm: parsed.llm ?? {} };
    console.log(`[mythos] registro caricato (${Object.keys(store.states).length} stati, ${Object.keys(store.llm).length} chiavi)`);
  } catch {
    store = { states: {}, llm: {} };
    console.log("[mythos] registro nuovo (nessuna persistenza trovata)");
  }
}

function persist(): void {
  writeLock = writeLock
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DATA_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(store));
      await fs.rename(tmp, DATA_FILE);
    })
    .catch((err) => console.error("[mythos] persistenza fallita", err));
}

/* ------------------------------ utilità ------------------------------ */
function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data ?? null);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sidFrom(url: URL): string | null {
  const sid = url.searchParams.get("sid");
  return sid && SID_RE.test(sid) ? sid : null;
}

function mask(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-3)}`;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

function toPublicState(state: StoredState): PersistedState {
  const pages: MythPage[] = state.pages.map((p, i) => ({
    id: `p${i}`,
    action: p.action,
    subject: p.subject ?? undefined,
    subject2: p.subject2 ?? undefined,
    title: p.title,
    raw: p.body,
    entities: p.entities,
    relations: p.relations,
    engine: p.engine,
    at: p.at,
  }));
  return { entities: state.entities, relations: state.relations, pages, idx: Math.max(0, pages.length - 1) };
}

function loadUserConfig(sid: string | null): UserLlmConfig | null {
  if (!sid || !SID_RE.test(sid)) return null;
  const row = store.llm[sid];
  if (!row?.key || !row.provider) return null;
  if (!USER_PROVIDERS.includes(row.provider)) return null;
  if (row.provider === "custom" && !row.url) return null;
  return { provider: row.provider, key: row.key, model: row.model || undefined, url: row.url || undefined };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/* ------------------------------ handler ------------------------------ */
function handleHealth(res: ServerResponse): void {
  json(res, { ok: true, database: "file", schema: "ready" });
}

function handleStateGet(res: ServerResponse, url: URL): void {
  const sid = sidFrom(url);
  if (!sid) return json(res, { error: "sid mancante" }, 400);
  const state = store.states[sid];
  if (!state || !Array.isArray(state.pages)) return json(res, { exists: false });
  json(res, { exists: true, state: toPublicState(state) });
}

function handleStatePut(res: ServerResponse, url: URL, body: Record<string, unknown>): void {
  const sid = sidFrom(url);
  if (!sid) return json(res, { error: "sid mancante" }, 400);

  const entities = (Array.isArray(body.entities) ? (body.entities as BoardEntity[]) : []).slice(0, 400);
  const relations = (Array.isArray(body.relations) ? (body.relations as RelationEdge[]) : []).slice(0, 600);
  const pages = (Array.isArray(body.pages) ? (body.pages as MythPage[]) : []).slice(0, 90);

  store.states[sid] = {
    entities,
    relations,
    pages: pages.map((p) => ({
      action: p.action,
      subject: p.subject ?? null,
      subject2: p.subject2 ?? null,
      title: String(p.title ?? "").slice(0, 200),
      body: String(p.raw ?? ""),
      engine: String(p.engine ?? "").slice(0, 80),
      at: Math.floor(p.at ?? 0),
      entities: p.entities ?? [],
      relations: p.relations ?? [],
    })),
  };
  persist();
  json(res, { ok: true });
}

function handleStateDelete(res: ServerResponse, url: URL): void {
  const sid = sidFrom(url);
  if (!sid) return json(res, { error: "sid mancante" }, 400);
  /* come la route originale: cancella pergamene/entità/fili ma non la chiave LLM */
  delete store.states[sid];
  persist();
  json(res, { ok: true });
}

function handleLlmKeyGet(res: ServerResponse, url: URL): void {
  const sid = sidFrom(url);
  if (!sid) return json(res, { error: "sid mancante" }, 400);
  const row = store.llm[sid];
  json(res, {
    env: envConfiguredKinds(),
    session: row?.key && row.provider
      ? { provider: row.provider, keyMask: mask(row.key), model: row.model ?? "", url: row.url ?? "" }
      : null,
  });
}

function handleLlmKeyPost(res: ServerResponse, url: URL, body: Record<string, unknown>): void {
  const sid = sidFrom(url);
  if (!sid) return json(res, { error: "sid mancante" }, 400);

  const provider = str(body.provider).trim();
  const key = str(body.key).trim();
  const model = str(body.model).trim().slice(0, 120);
  const llmUrl = str(body.url).trim().slice(0, 300);

  if (!(LLM_KINDS as string[]).includes(provider)) {
    return json(res, { error: "provider sconosciuto" }, 400);
  }
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) {
    return json(res, { error: "chiave non valida (8-300 caratteri, senza spazi)" }, 400);
  }

  const knownProvider = /^sk-or-/i.test(key)
    ? "openrouter"
    : /^sk-ant-/i.test(key)
      ? "anthropic"
      : /^pplx-/i.test(key)
        ? "perplexity"
        : /^AIza/i.test(key)
          ? "gemini"
          : /^gsk_/i.test(key)
            ? "groq"
            : /^sk-(?:proj-|svcacct-|admin-)/i.test(key)
              ? "openai"
              : null;
  if (knownProvider && provider !== knownProvider) {
    return json(
      res,
      { error: `Questa chiave appartiene a ${knownProvider.toUpperCase()}, ma hai selezionato ${provider.toUpperCase()}.` },
      400,
    );
  }
  if (provider === "custom" && !/^https:\/\//.test(llmUrl)) {
    return json(res, { error: "per l'endpoint personalizzato serve una URL https valida" }, 400);
  }

  store.llm[sid] = { provider: provider as LlmKind, key, model: model || undefined, url: llmUrl || undefined };
  persist();
  json(res, { ok: true, keyMask: mask(key) });
}

function handleLlmKeyDelete(res: ServerResponse, url: URL): void {
  const sid = sidFrom(url);
  if (!sid) return json(res, { error: "sid mancante" }, 400);
  delete store.llm[sid];
  persist();
  json(res, { ok: true });
}

async function handleLlmKeyTest(res: ServerResponse, url: URL, body: Record<string, unknown>): Promise<void> {
  const sid = sidFrom(url);

  const provider = str(body.provider).trim();
  const key = str(body.key).trim();
  const model = str(body.model).trim().slice(0, 120);
  const llmUrl = str(body.url).trim().slice(0, 300);

  const report: Record<string, unknown> = { env: envConfiguredKinds(), test: null };
  let cfg: UserLlmConfig | null = null;

  if (provider && key) {
    if (!USER_PROVIDERS.includes(provider as LlmKind)) {
      return json(res, { error: "Provider sconosciuto" }, 400);
    }
    cfg = { provider: provider as LlmKind, key, model: model || undefined, url: llmUrl || undefined };
    report.source = "form";
  } else if (sid) {
    const row = store.llm[sid];
    if (row?.key && row.provider) {
      cfg = { provider: row.provider, key: row.key, model: row.model || undefined, url: row.url || undefined };
      report.source = "database";
      report.saved = { provider: row.provider, model: row.model ?? "" };
    } else {
      report.source = "nessuna chiave salvata";
    }
  } else {
    report.source = "nessun sid";
  }

  if (!cfg?.key) {
    return json(res, {
      ...report,
      test: {
        ok: false,
        reason: "Nessuna API key disponibile dal form, dalla sessione o dalle variabili d'ambiente.",
      },
    });
  }

  try {
    const result = await queryOracle("anecdote", "Atena", undefined, cfg, false);
    return json(res, {
      ...report,
      test: {
        ok: !result.degraded,
        engine: result.engine,
        degraded: result.degraded,
        note: result.note ?? null,
        title: result.title,
        sample: result.text.slice(0, 180),
        entities: result.entities.slice(0, 6),
        relations: result.relations.slice(0, 4),
      },
    });
  } catch (err) {
    console.error("[llmtest] errore", err);
    return json(res, { ...report, test: { ok: false, reason: "errore durante la prova del provider" } }, 503);
  }
}

async function handleQuery(res: ServerResponse, body: Record<string, unknown>): Promise<void> {
  const action = body.action as QueryActionKey;
  if (!VALID_ACTIONS.includes(action)) {
    return json(res, { error: "azione sconosciuta all'Oracolo" }, 400);
  }
  const subject = str(body.subject).trim().slice(0, 80);
  const subject2 = str(body.subject2).trim().slice(0, 80);

  if (NEEDS_ONE.includes(action) && !subject) {
    return json(res, { error: "serve una parola chiave" }, 400);
  }
  if (NEEDS_TWO.includes(action) && (!subject || !subject2)) {
    return json(res, { error: "servono due parole chiave" }, 400);
  }

  try {
    const userCfg = loadUserConfig(str(body.sid) || null);
    const result = await queryOracle(action, subject || undefined, subject2 || undefined, userCfg);
    return json(res, result);
  } catch (err) {
    console.error("[oracolo] fallimento totale", err);
    return json(res, { error: "L'Oracolo è in silenzio: il vortice delle fonti non risponde." }, 502);
  }
}

/* --------------------------- static + injection ------------------------ */
let cachedIndex: string | null = null;

async function buildIndex(): Promise<string> {
  if (cachedIndex) return cachedIndex;
  const file = join(DIST_DIR, "index.html");
  let html = await fs.readFile(file, "utf8");
  /* Segnala al client che c'è un server reale: il bridge browser smette
   * di intercettare /api/* e lascia che le chiamate vadano al server. */
  html = html.replace("<body>", "<body><script>window.__MYTHOS_REMOTE_API__=true;</script>");
  cachedIndex = html;
  return html;
}

function safePath(rel: string): string | null {
  const resolved = normalize(join(DIST_DIR, rel));
  return resolved.startsWith(DIST_DIR) ? resolved : null;
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  try {
    if (pathname === "/" || pathname === "/index.html") {
      const html = await buildIndex();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }

    if (pathname.startsWith("/img/")) {
      const file = safePath(pathname.slice(1));
      if (file && existsSync(file)) {
        const type = extname(file) === ".png" ? "image/png" : "image/jpeg";
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=86400" });
        createReadStream(file).pipe(res);
        return;
      }
    }
    if (pathname.startsWith("/api/")) {
      return json(res, { error: "endpoint sconosciuto" }, 404);
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  } catch (err) {
    console.error("[mythos] static", err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500");
  }
}

/* -------------------------------- server ------------------------------ */
const server = createServer((req, res) => {
  const method = (req.method ?? "GET").toUpperCase();
  const pathname = decodeURIComponent(new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname);
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  /* route API: gestite in modo asincrono e robusto */
  (async () => {
    if (pathname === "/api/health" && method === "GET") return handleHealth(res);

    if (pathname === "/api/state") {
      if (method === "GET") return handleStateGet(res, url);
      const body = await readBody(req);
      if (!body) return json(res, { error: "payload non valido" }, 400);
      if (method === "PUT") return handleStatePut(res, url, body);
      if (method === "DELETE") return handleStateDelete(res, url);
    }
    if (pathname === "/api/llmkey") {
      if (method === "GET") return handleLlmKeyGet(res, url);
      const body = await readBody(req);
      if (!body) return json(res, { error: "payload non valido" }, 400);
      if (method === "POST") return handleLlmKeyPost(res, url, body);
      if (method === "DELETE") return handleLlmKeyDelete(res, url);
    }
    if (pathname === "/api/llmkey/test" && method === "POST") {
      const body = await readBody(req);
      if (!body) return json(res, { error: "payload non valido" }, 400);
      return await handleLlmKeyTest(res, url, body);
    }
    if (pathname === "/api/query" && method === "POST") {
      const body = await readBody(req);
      if (!body) return json(res, { error: "payload non valido" }, 400);
      return await handleQuery(res, body);
    }

    return await serveStatic(res, pathname);
  })().catch((err) => {
    console.error("[mythos] errore", err);
    if (!res.headersSent) json(res, { error: "errore interno" }, 500);
  });
});

loadStore().then(() => {
  server.listen(PORT, () => {
    console.log(`[mythos] ΜΥΘΟΣ·OS pronto su http://localhost:${PORT}`);
    console.log(`[mythos] statico: ${DIST_DIR} | dati: ${DATA_FILE}`);
  });
});
