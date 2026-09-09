/* ======================================================================
 * BRIDGE VITE — server locale dell'Oracolo (unico file di adattamento)
 *
 * Il progetto originale (Next.js) espone cinque API route:
 *   /api/health, /api/state, /api/llmkey, /api/llmkey/test, /api/query
 * Questo modulo le reimplementa 1:1 nel browser: intercetta le fetch
 * verso /api/* e risponde con la stessa logica (validazioni incluse),
 * persistendo su localStorage al posto di PostgreSQL e invocando
 * queryOracle di "@/lib/llm" (file originale, mai modificato).
 * Tutti gli altri URL passano al fetch nativo invariati.
 * ====================================================================== */

import { envConfiguredKinds, LLM_KINDS, queryOracle } from "@/lib/llm";
import type { LlmKind, UserLlmConfig } from "@/lib/llm";
import type {
  BoardEntity,
  EntityRef,
  MythPage,
  PersistedState,
  QueryActionKey,
  RelationEdge,
} from "@/lib/types";

/* ---------------- process.env tollerante (llm.ts lo legge) ---------- */
const globalForProcess = globalThis as { process?: unknown };
const proc = globalForProcess.process;
if (typeof proc !== "object" || proc === null) {
  globalForProcess.process = { env: {} };
} else if (typeof (proc as { env?: unknown }).env !== "object") {
  (proc as { env?: unknown }).env = {};
}
const processEnv = (globalForProcess.process as { env: Record<string, string> }).env;

/* ---------------- chiave predefinita (nessuna digitazione) -----------
 * Le chiavi dichiarate al build in un file .env (VITE_*) diventano le
 * "chiavi d'ambiente" del bridge: l'Oracolo parte gia attivo senza aprire
 * il dialogo. ATTENZIONE: in una build statica queste chiavi sono leggibili
 * nel bundle; per un sito pubblico usare le variabili d'ambiente di Render
 * (GROQ_API_KEY e simili), che restano solo sul server. */
const VITE_ENV_MAP: Record<string, string> = {
  VITE_GROQ_API_KEY: "GROQ_API_KEY",
  VITE_CLOUDFLARE_API_TOKEN: "CLOUDFLARE_API_TOKEN",
  VITE_CLOUDFLARE_ACCOUNT_ID: "CLOUDFLARE_ACCOUNT_ID",
  VITE_OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
  VITE_GEMINI_API_KEY: "GEMINI_API_KEY",
  VITE_OPENAI_API_KEY: "OPENAI_API_KEY",
  VITE_ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  VITE_PERPLEXITY_API_KEY: "PERPLEXITY_API_KEY",
  VITE_GROQ_MODEL: "GROQ_MODEL",
  VITE_CLOUDFLARE_MODEL: "CLOUDFLARE_MODEL",
};

function applyViteDefaults(): void {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  for (const [viteKey, envKey] of Object.entries(VITE_ENV_MAP)) {
    const value = viteEnv[viteKey];
    if (typeof value === "string" && value.trim() && !processEnv[envKey]) {
      processEnv[envKey] = value.trim();
    }
  }
}

/* ------------------------------ storage ------------------------------ */
const STATE_KEY = (sid: string) => `mythos:state:${sid}`;
const LLM_KEY = (sid: string) => `mythos:llm:${sid}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* --------------------------- validazioni comuni ---------------------- */
const SID_RE = /^[\w-]{8,64}$/;

function sidFrom(url: URL): string | null {
  const sid = url.searchParams.get("sid");
  return sid && SID_RE.test(sid) ? sid : null;
}

function mask(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-3)}`;
}

interface StoredLlm {
  provider: LlmKind;
  key: string;
  model?: string;
  url?: string;
}

function loadLlm(sid: string): StoredLlm | null {
  return readJson<StoredLlm>(LLM_KEY(sid));
}

/* ------------------------- pagine persistite ------------------------- */
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

function toPublic(state: StoredState): PersistedState {
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
  return {
    entities: state.entities,
    relations: state.relations,
    pages,
    idx: Math.max(0, pages.length - 1),
  };
}

/* ------------------------------- /api/* ------------------------------ */
const VALID_ACTIONS: QueryActionKey[] = [
  "opening", "who", "etymology", "anecdote", "origin", "episode", "relation", "relation_deep", "cause",
];
const NEEDS_ONE: QueryActionKey[] = ["who", "etymology", "anecdote", "origin", "episode"];
const NEEDS_TWO: QueryActionKey[] = ["relation", "relation_deep", "cause"];
const USER_PROVIDERS: LlmKind[] = ["perplexity", "anthropic", "openai", "gemini", "openrouter", "groq", "cloudflare", "custom"];

async function loadUserConfig(sid: string | null): Promise<UserLlmConfig | null> {
  if (!sid || !SID_RE.test(sid)) return null;
  try {
    const row = loadLlm(sid);
    if (!row?.key || !row.provider) return null;
    if (!USER_PROVIDERS.includes(row.provider)) return null;
    if (row.provider === "custom" && !row.url) return null;
    return {
      provider: row.provider,
      key: row.key,
      model: row.model || undefined,
      url: row.url || undefined,
    };
  } catch {
    return null;
  }
}

interface BodyLike {
  provider?: unknown;
  key?: unknown;
  model?: unknown;
  url?: unknown;
  action?: unknown;
  subject?: unknown;
  subject2?: unknown;
  sid?: unknown;
  entities?: unknown;
  relations?: unknown;
  pages?: unknown;
}

async function handleHealth(): Promise<Response> {
  return json({ ok: true, database: "localStorage", schema: "ready" });
}

function handleStateGet(url: URL): Response {
  const sid = sidFrom(url);
  if (!sid) return json({ error: "sid mancante" }, 400);
  try {
    const stored = readJson<StoredState>(STATE_KEY(sid));
    if (!stored || !Array.isArray(stored.pages)) return json({ exists: false });
    return json({ exists: true, state: toPublic(stored) });
  } catch {
    return json({ exists: false, error: "storage non disponibile" }, 200);
  }
}

function handleStatePut(url: URL, body: BodyLike): Response {
  const sid = sidFrom(url);
  if (!sid) return json({ error: "sid mancante" }, 400);

  const entities = (Array.isArray(body.entities) ? (body.entities as BoardEntity[]) : []).slice(0, 400);
  const relations = (Array.isArray(body.relations) ? (body.relations as RelationEdge[]) : []).slice(0, 600);
  const pages = (Array.isArray(body.pages) ? (body.pages as MythPage[]) : []).slice(0, 90);

  const stored: StoredState = {
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
  return writeJson(STATE_KEY(sid), stored)
    ? json({ ok: true })
    : json({ ok: false, error: "salvataggio fallito" }, 200);
}

function handleStateDelete(url: URL): Response {
  const sid = sidFrom(url);
  if (!sid) return json({ error: "sid mancante" }, 400);
  /* come la route originale: cancella pergamene/entità/fili ma non la chiave LLM */
  removeKey(STATE_KEY(sid));
  return json({ ok: true });
}

function handleLlmKeyGet(url: URL): Response {
  const sid = sidFrom(url);
  if (!sid) return json({ error: "sid mancante" }, 400);
  try {
    const row = loadLlm(sid);
    return json({
      env: envConfiguredKinds(),
      session: row?.key && row.provider
        ? { provider: row.provider, keyMask: mask(row.key), model: row.model ?? "", url: row.url ?? "" }
        : null,
    });
  } catch (err) {
    console.error("[llmkey] GET fallita", err);
    return json({ env: envConfiguredKinds(), session: null, error: "storage non disponibile" }, 503);
  }
}

function handleLlmKeyPost(url: URL, body: BodyLike): Response {
  const sid = sidFrom(url);
  if (!sid) return json({ error: "sid mancante" }, 400);

  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
  const llmUrl = typeof body.url === "string" ? body.url.trim().slice(0, 300) : "";

  if (!(LLM_KINDS as string[]).includes(provider)) {
    return json({ error: "provider sconosciuto" }, 400);
  }
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) {
    return json({ error: "chiave non valida (8-300 caratteri, senza spazi)" }, 400);
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
      {
        error: `Questa chiave appartiene a ${knownProvider.toUpperCase()}, ma hai selezionato ${provider.toUpperCase()}.`,
      },
      400,
    );
  }

  if (provider === "custom" && !/^https:\/\//.test(llmUrl)) {
    return json({ error: "per l'endpoint personalizzato serve una URL https valida" }, 400);
  }

  const stored: StoredLlm = {
    provider: provider as LlmKind,
    key,
    model: model || undefined,
    url: llmUrl || undefined,
  };
  if (!writeJson(LLM_KEY(sid), stored)) {
    return json({ error: "storage non disponibile" }, 503);
  }
  return json({ ok: true, keyMask: mask(key) });
}

function handleLlmKeyDelete(url: URL): Response {
  const sid = sidFrom(url);
  if (!sid) return json({ error: "sid mancante" }, 400);
  removeKey(LLM_KEY(sid));
  return json({ ok: true });
}

async function handleLlmKeyTest(url: URL, body: BodyLike): Promise<Response> {
  const sid = sidFrom(url);

  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
  const llmUrl = typeof body.url === "string" ? body.url.trim().slice(0, 300) : "";

  const report: Record<string, unknown> = {
    env: envConfiguredKinds(),
    test: null as null | Record<string, unknown>,
  };

  let cfg: UserLlmConfig | null = null;

  if (provider && key) {
    if (!USER_PROVIDERS.includes(provider as LlmKind)) {
      return json({ error: "Provider sconosciuto" }, 400);
    }
    cfg = {
      provider: provider as LlmKind,
      key,
      model: model || undefined,
      url: llmUrl || undefined,
    };
    report.source = "form";
  } else if (sid) {
    try {
      const row = loadLlm(sid);
      if (row?.key && row.provider) {
        cfg = {
          provider: row.provider,
          key: row.key,
          model: row.model || undefined,
          url: row.url || undefined,
        };
        report.source = "database";
        report.saved = { provider: row.provider, model: row.model ?? "" };
      } else {
        report.source = "nessuna chiave salvata";
      }
    } catch (error) {
      report.source = "database non disponibile";
      console.error("[llmtest] caricamento configurazione fallito", error);
    }
  } else {
    report.source = "nessun sid";
  }

  if (!cfg?.key) {
    return json({
      ...report,
      test: {
        ok: false,
        reason: "Nessuna API key disponibile dal form, dalla sessione o dalle variabili d'ambiente.",
      },
    });
  }

  /* Domanda minima: evita testi lunghi e diagnostica i problemi prima della produzione. */
  const result = await queryOracle("anecdote", "Atena", undefined, cfg, false);
  return json({
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
}

async function handleQuery(body: BodyLike): Promise<Response> {
  const action = body.action as QueryActionKey;
  if (!VALID_ACTIONS.includes(action)) {
    return json({ error: "azione sconosciuta all'Oracolo" }, 400);
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 80) : "";
  const subject2 = typeof body.subject2 === "string" ? body.subject2.trim().slice(0, 80) : "";

  if (NEEDS_ONE.includes(action) && !subject) {
    return json({ error: "serve una parola chiave" }, 400);
  }
  if (NEEDS_TWO.includes(action) && (!subject || !subject2)) {
    return json({ error: "servono due parole chiave" }, 400);
  }

  try {
    const userCfg = await loadUserConfig(typeof body.sid === "string" ? body.sid : null);
    const result = await queryOracle(action, subject || undefined, subject2 || undefined, userCfg);
    return json(result);
  } catch (err) {
    console.error("[oracolo] fallimento totale", err);
    return json(
      { error: "L'Oracolo è in silenzio: il vortice delle fonti non risponde." },
      502,
    );
  }
}

/* --------- chiamate dirette ai provider LLM dal browser ---------------
 * In Next.js queste fetch partivano dal server (niente CORS). Nel
 * browser intervengono due limiti:
 *  1. api.anthropic.com esige l'header ufficiale
 *     "anthropic-dangerous-direct-browser-access" per consentire CORS;
 *  2. i provider senza CORS (o un ambiente con CSP restrittiva) fanno
 *     fallire la fetch con un criptico "TypeError: Failed to fetch".
 * Qui iniettiamo l'header Anthropic e riscriviamo l'errore in chiaro,
 * così la nota dell'Oracolo spiega la causa reale all'utente.
 * --------------------------------------------------------------------- */
const LLM_HOST_LABEL: Record<string, string> = {
  "api.openai.com": "OPENAI",
  "api.anthropic.com": "ANTHROPIC",
  "generativelanguage.googleapis.com": "GEMINI",
  "api.perplexity.ai": "PERPLEXITY",
  "openrouter.ai": "OPENROUTER",
  "api.groq.com": "GROQ",
  "api.cloudflare.com": "CLOUDFLARE",
};

/* --------- relay CORS opzionale (mai attivo di default) ---------------
 * Se l'utente aggiunge ?relay=1 all'URL, le chiamate ai provider che il
 * browser blocca (TypeError = CORS/CSP) vengono ritentate tramite un
 * proxy pubblico. La chiave API transita da un servizio terzo: pensato
 * solo per test in anteprima. ?relay=0 lo disattiva. Se fallisce anche
 * il relay, il blocco è totale (CSP dell'ambiente): serve uscire
 * dall'anteprima.
 * --------------------------------------------------------------------- */
const RELAY_BASE = "https://corsproxy.io/?url=";
const RELAY_FLAG = "mythos.relay";

/* Marcatura versione: visibile in console (F12) per verificare che la
 * pagina carichi DAVVERO l'ultima build e non una copia in cache. */
const MYTHOS_BRIDGE_BUILD = "2026-09-06 · normalizzazione modelli OpenRouter+Gemini";

/* Gemini: llm.ts usa "gemini-2.0-flash" come predefinito, ma dal 2026
 * il piano gratuito copre solo Flash 2.5+ (2.0 → 404). Lo stesso vale
 * per "auto" o slug non-gemini lasciati nel campo Modello. */
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

function normalizeGeminiModel(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.hostname !== "generativelanguage.googleapis.com") return rawUrl;
    const parts = u.pathname.split("/");
    const idx = parts.indexOf("models");
    if (idx < 0 || idx + 1 >= parts.length) return rawUrl;
    const seg = parts[idx + 1];
    const action = seg.includes(":") ? `:${seg.split(":").slice(1).join(":")}` : "";
    const model = seg.split(":")[0].trim().toLowerCase();
    const isGemini = model.startsWith("gemini-");
    const isOutdated =
      model.startsWith("gemini-2.0") ||
      model.startsWith("gemini-1.5") ||
      model.startsWith("gemini-1.0");
    if (isGemini && !isOutdated) return rawUrl;
    parts[idx + 1] = `${GEMINI_FALLBACK_MODEL}${action || ":generateContent"}`;
    return `${u.origin}${parts.join("/")}${u.search}`;
  } catch {
    return rawUrl;
  }
}

function relayEnabled(): boolean {
  try {
    return window.localStorage.getItem(RELAY_FLAG) === "1";
  } catch {
    return false;
  }
}

function setupRelayFlag(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("relay");
    if (flag === "1") window.localStorage.setItem(RELAY_FLAG, "1");
    else if (flag === "0") window.localStorage.removeItem(RELAY_FLAG);
  } catch {
    /* noop */
  }
  if (relayEnabled()) {
    console.info(
      "[mythos] RELAY CORS ATTIVO — le chiamate ai provider LLM transitano via " +
        "corsproxy.io (la chiave passa da un servizio terzo: solo per test). " +
        "Disattiva aggiungendo ?relay=0 all'URL.",
    );
  }
}

async function passthroughFetch(
  url: URL,
  rawUrl: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  nativeFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<Response> {
  let finalInit = init;

  if (url.hostname === "api.anthropic.com") {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("anthropic-dangerous-direct-browser-access")) {
      headers.set("anthropic-dangerous-direct-browser-access", "true");
    }
    finalInit = { ...init, headers };
  }

  /* Il catalogo OpenRouter ora viene filtrato e ordinato correttamente
   * da llm.ts (escludendo utility come bodybuilder ed eliminando il bug
   * del pricing negativo). Non serve alcuna sostituzione manuale qui. */

  /* Gemini: normalizza modello obsoleto ("gemini-2.0-flash" predefinito
   * in llm.ts, o slug lasciati nel campo Modello) verso il free attuale. */
  const geminiNormalized = normalizeGeminiModel(String(typeof input === "string" || input instanceof URL ? input : input.url));
  let finalInput: RequestInfo | URL = input;
  if (geminiNormalized !== String(typeof input === "string" || input instanceof URL ? input : input.url)) {
    finalInput = geminiNormalized;
  }

  try {
    return await nativeFetch(finalInput as RequestInfo, finalInit);
  } catch (err) {
    const label = LLM_HOST_LABEL[url.hostname];
    if (!(err instanceof TypeError) || !label) throw err;

    if (relayEnabled()) {
      try {
        return await nativeFetch(`${RELAY_BASE}${encodeURIComponent(rawUrl)}`, finalInit);
      } catch (relayErr) {
        if (relayErr instanceof TypeError) {
          throw new Error(
            `${label}: blocco totale dell'ambiente di anteprima (CSP) — alla pagina è vietata QUALSIASI connessione esterna. Esegui MYTHOS·OS fuori dall'anteprima (npm run dev o hosting statico) per usare i provider LLM`,
          );
        }
        throw relayErr;
      }
    }

    throw new Error(
      `${label}: chiamata bloccata dal browser (CORS) — il provider non accetta richieste dirette dalla pagina. Aggiungi ?relay=1 all'URL per tentare il bypass tramite relay pubblico (la chiave transita da un servizio terzo: solo per test)`,
    );
  }
}

/* --------------------------- intercettore fetch ---------------------- */
async function routeApi(url: URL, method: string, body: BodyLike): Promise<Response> {
  const path = url.pathname;
  try {
    if (path === "/api/health" && method === "GET") return await handleHealth();

    if (path === "/api/state") {
      if (method === "GET") return handleStateGet(url);
      if (method === "PUT") return handleStatePut(url, body);
      if (method === "DELETE") return handleStateDelete(url);
    }
    if (path === "/api/llmkey") {
      if (method === "GET") return handleLlmKeyGet(url);
      if (method === "POST") return handleLlmKeyPost(url, body);
      if (method === "DELETE") return handleLlmKeyDelete(url);
    }
    if (path === "/api/llmkey/test" && method === "POST") return await handleLlmKeyTest(url, body);

    if (path === "/api/query" && method === "POST") return await handleQuery(body);

    return json({ error: "endpoint sconosciuto" }, 404);
  } catch (err) {
    console.error(`[bridge] ${method} ${path} fallita`, err);
    return json({ error: "errore interno dell'oracolo locale" }, 500);
  }
}

function installFetchBridge(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const remoteWindow = window as Window & { __MYTHOS_REMOTE_API__?: boolean };
  /* Su Render il server Node (server/index.ts) inietta questo flag e
   * gestisce /api/* in modo nativo (chiamate LLM server-side, niente
   * CORS): in quel caso il bridge client NON deve intercettare nulla. */
  if (remoteWindow.__MYTHOS_REMOTE_API__) return;
  const flaggedWindow = window as Window & { __mythosBridgeInstalled?: boolean };
  if (flaggedWindow.__mythosBridgeInstalled) return;
  flaggedWindow.__mythosBridgeInstalled = true;

  console.info(`[mythos] bridge locale ATTIVO · build: ${MYTHOS_BRIDGE_BUILD}`);

  applyViteDefaults();

  setupRelayFlag();

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL | null = null;
    try {
      const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      url = new URL(rawUrl, window.location.origin);

      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

        let body: BodyLike = {};
        const rawBody = init?.body;
        if (typeof rawBody === "string" && rawBody.trim()) {
          try {
            body = JSON.parse(rawBody) as BodyLike;
          } catch {
            return json({ error: "payload non valido" }, 400);
          }
        } else if (input instanceof Request && !init?.body) {
          const text = await input.text().catch(() => "");
          if (text.trim()) {
            try {
              body = JSON.parse(text) as BodyLike;
            } catch {
              return json({ error: "payload non valido" }, 400);
            }
          }
        }

        return await routeApi(url, method, body);
      }
    } catch (err) {
      console.error("[bridge] instradamento fallito", err);
    }
    if (url) return passthroughFetch(url, String(typeof input === "string" || input instanceof URL ? input : input.url), input, init, nativeFetch);
    return nativeFetch(input as RequestInfo, init);
  };
}

installFetchBridge();
