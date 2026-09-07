import { kernelQuery } from "./kernel";
import type { EntityKind, OracleResult, QueryActionKey } from "./types";

/* ================================================================== */
/*  ORACOLO-9000 — motore LLM con ricerca web multilingue in tempo      */
/*  reale. Le chiavi possono arrivare da process.env oppure essere      */
/*  inserite dall'utente (menu File > Configura chiave LLM).            */
/*  Senza chiavi -> kernel procedurale di emergenza (mai muto).         */
/* ================================================================== */

export type LlmKind = "perplexity" | "anthropic" | "openai" | "gemini" | "openrouter" | "custom";

export const LLM_KINDS: LlmKind[] = ["perplexity", "anthropic", "openai", "gemini", "openrouter", "custom"];

export const LLM_KIND_LABEL: Record<LlmKind, string> = {
  perplexity: "Perplexity Sonar · ricerca web live",
  anthropic: "Anthropic Claude · web search",
  openai: "OpenAI GPT · web search",
  gemini: "Google Gemini · google search",
  openrouter: "OpenRouter · modello :online",
  custom: "Endpoint personalizzato OpenAI-compatibile",
};

export interface UserLlmConfig {
  provider: LlmKind | "auto";
  key: string;
  model?: string;
  url?: string;
}

interface ChatMsg {
  role: "system" | "user";
  content: string;
}

interface Provider {
  id: string;
  ask: () => Promise<string>;
}

const KIND_ENUM = '"divinità" | "titano" | "primordiale" | "eroe" | "creatura" | "luogo" | "oggetto" | "mortale"';

const ACTION_SPECS: Record<
  QueryActionKey,
  { words: string; needs: number; describe: (a?: string, b?: string) => string }
> = {
  opening: {
    words: "260-400",
    needs: 0,
    describe: () =>
      `Componi l'OVERTURE: la nascita del cosmo greco dal Caos fino alla caduta dei Titani e all'ascesa di Zeus (origine primordiale, Titanomachia, nuovo ordine olimpico). Deve coinvolgere molte entità per aprire la mappa delle scoperte.`,
  },
  who: {
    words: "150-280",
    needs: 1,
    describe: (a) => `Racconta chi è ${a}: identità, genealogia, attributi, dominio, culto, epiteti e il gesto mitico più celebre che lo riguarda.`,
  },
  anecdote: {
    words: "150-280",
    needs: 1,
    describe: (a) => `Narra un aneddoto mitologico autentico e poco noto su ${a}: una curiosità, un episodio laterale o una variante regionale affascinante attestata dalle fonti.`,
  },
  origin: {
    words: "150-280",
    needs: 1,
    describe: (a) => `Spiega chi ha costruito / forgiato / generato e da dove proviene ${a}: l'artefice, il contesto, il luogo d'origine e il perché della sua creazione secondo le fonti.`,
  },
  episode: {
    words: "260-420",
    needs: 1,
    describe: (a) => `Narra per intero il passo mitologico di ${a}: scegli l'episodio epico più rappresentativo incentrato su questa entità e raccontalo come un rapsode, con inizio, svolgimento ed esito.`,
  },
  relation: {
    words: "170-320",
    needs: 2,
    describe: (a, b) => `Spiega che relazione ha ${a} con ${b}: il legame diretto (sangue, amore, odio, alleanza, conflitto) attestato dalle fonti.`,
  },
  relation_deep: {
    words: "260-420",
    needs: 2,
    describe: (a, b) => `Approfondisci la relazione tra ${a} e ${b}: storia completa dei conflitti, delle alleanze, delle cause remote, delle varianti regionali e delle conseguenze del loro legame.`,
  },
  cause: {
    words: "200-360",
    needs: 2,
    describe: (a, b) => `Ricostruisci il nesso causa/effetto tra ${a} e ${b}: la catena di eventi che le azioni dell'uno hanno scatenato sull'altro, passo dopo passo, fino all'esito.`,
  },
};

function systemPrompt(words: string): string {
  return `Sei ORACOLO-9000, un terminale sapiente dell'INTERA mitologia greca.
Hai accesso tramite ricerca web in tempo reale agli archivi digitali e alle fonti in OGNI lingua: testi classici (Iliade, Odissea, Teogonia di Esiodo, Biblioteca di Apollodoro, tragedie di Eschilo/Sofocle/Euripide, Inni omerici, Pausania), frammenti papiracei (Oxyrhynchus) e studi filologici internazionali in greco antico, inglese, tedesco, francese. Prima di rispondere VERIFICA le fonti, risolvi le contraddizioni scegliendo la versione principale (cita una variante solo tra parentesi, al massimo una).

OUTPUT: devi restituire ESCLUSIVAMENTE un oggetto JSON valido, nient'altro (niente markdown, niente \`\`\`, niente commenti):
{
 "titolo": string,                 // titolo breve ed evocativo in italiano
 "testo": string,                  // ${words} parole, italiano epico-letterario, scorrevole, senza elenchi
 "entita": [{"nome": string, "tipo": ${KIND_ENUM}}],
 "relazioni": [{"da": string, "a": string, "etichetta": string}]
}

REGOLE FERREE sul TESTO:
- Ogni divinità, eroe, creatura, luogo o oggetto menzionato va racchiuso come [[NomeCanonico]] (forma nominale italiana, es. [[Zeus]], [[Odisseo]], [[Vaso di Pandora]]) a OGNI occorrenza delle entità principali e almeno alla prima occorrenza delle secondarie.
- MAI citazioni numeriche tipo [1], MAI url, MAI sezioni "Fonti", MAI testo fuori dal JSON, MAI elenchi puntati: solo prosa epica in un unico campo "testo" (usa \\n\\n tra paragrafi).
- "entita": elenca TUTTE (e sole) le entità nominate con [[]], con il tipo corretto.
- "relazioni": solo tra entità dell'elenco; etichetta di 1-4 parole in italiano (es. "padre di", "ucise", "forgato da", "sposo di", "nemico giurato di"). Massimo 14.`;
}

function buildMessages(action: QueryActionKey, subject?: string, subject2?: string): ChatMsg[] {
  const spec = ACTION_SPECS[action];
  return [
    { role: "system", content: systemPrompt(spec.words) },
    {
      role: "user",
      content: `AZIONE RICHIESTA: ${spec.describe(subject, subject2)}\nRestituisci solo il JSON richiesto.`,
    },
  ];
}

/* ------------------------- parsing tollerante ------------------------- */

function extractJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error("nessun JSON nella risposta");
  s = s.slice(i, j + 1);
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    const repaired = s.replace(/[\r\n\t]+/g, " ");
    return JSON.parse(repaired) as Record<string, unknown>;
  }
}

const KIND_SET = new Set<string>([
  "divinità", "titano", "primordiale", "eroe", "creatura", "luogo", "oggetto", "mortale",
]);

function normalize(parsed: Record<string, unknown>): Omit<OracleResult, "engine" | "degraded"> {
  const title = typeof parsed.titolo === "string" ? parsed.titolo.slice(0, 120) : "Passo senza titolo";
  let text = typeof parsed.testo === "string" ? parsed.testo : "";
  text = text.replace(/\[\d+\]/g, "").replace(/\(\d+\)/g, "").replace(/[ \t]{2,}/g, " ").trim();
  if (!text) throw new Error("testo vuoto");

  const seenE = new Set<string>();
  const entities: { name: string; kind: EntityKind }[] = [];
  const rawEnt = Array.isArray(parsed.entita) ? parsed.entita : [];
  for (const item of rawEnt) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nome = typeof o.nome === "string" ? o.nome.trim() : "";
    if (!nome || seenE.has(nome.toLowerCase())) continue;
    seenE.add(nome.toLowerCase());
    const tipoRaw = typeof o.tipo === "string" ? o.tipo.toLowerCase().trim() : "";
    const kind = (KIND_SET.has(tipoRaw) ? tipoRaw : "mortale") as EntityKind;
    entities.push({ name: nome, kind });
  }
  const tagRe = /\[\[([^\]|]{2,60})\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text)) !== null) {
    const n = m[1].trim();
    if (n && !seenE.has(n.toLowerCase())) {
      seenE.add(n.toLowerCase());
      entities.push({ name: n, kind: "mortale" });
    }
  }

  const seenR = new Set<string>();
  const relazioni: { from: string; to: string; label: string }[] = [];
  const rawRel = Array.isArray(parsed.relazioni) ? parsed.relazioni : [];
  for (const item of rawRel) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const da = typeof o.da === "string" ? o.da.trim() : "";
    const a = typeof o.a === "string" ? o.a.trim() : "";
    const etichetta = typeof o.etichetta === "string" ? o.etichetta.trim().slice(0, 60) : "";
    if (!da || !a || !etichetta || da.toLowerCase() === a.toLowerCase()) continue;
    const key = `${da}|${a}|${etichetta}`.toLowerCase();
    if (seenR.has(key)) continue;
    seenR.add(key);
    relazioni.push({ from: da, to: a, label: etichetta });
  }

  return { title, text, entities: entities.slice(0, 40), relations: relazioni.slice(0, 20) };
}

/* --------------------- factory dei provider --------------------- */

const TIMEOUT = 55_000;
const sysOf = (msgs: ChatMsg[]) => msgs.find((m) => m.role === "system")?.content ?? "";
const usrOf = (msgs: ChatMsg[]) => msgs.find((m) => m.role === "user")?.content ?? "";

async function postChat(
  msgs: ChatMsg[],
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT + 15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error("risposta priva di contenuto");
  return content;
}

function buildProvider(kind: LlmKind, msgs: ChatMsg[], key: string, model?: string, url?: string): Provider | null {
  switch (kind) {
    case "perplexity":
      return {
        id: "PERPLEXITY SONAR · RICERCA WEB LIVE",
        ask: () =>
          postChat(msgs, "https://api.perplexity.ai/chat/completions",
            { Authorization: `Bearer ${key}` },
            { model: model || "sonar-pro", messages: msgs, temperature: 0.7 }),
      };
    case "anthropic":
      return {
        id: "ANTHROPIC CLAUDE + WEB SEARCH",
        ask: async () => {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: model || "claude-sonnet-4-5",
              max_tokens: 4096,
              system: sysOf(msgs),
              tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
              messages: [{ role: "user", content: usrOf(msgs) }],
            }),
            signal: AbortSignal.timeout(TIMEOUT + 25000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { content?: { type: string; text?: string }[] };
          const text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
          if (!text) throw new Error("nessun blocco testo");
          return text;
        },
      };
    case "openai":
      return {
        id: "OPENAI GPT + WEB SEARCH",
        ask: async () => {
          const res = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model: model || "gpt-4.1",
              tools: [{ type: "web_search_preview" }],
              input: msgs.map((m) => ({ role: m.role, content: m.content })),
            }),
            signal: AbortSignal.timeout(TIMEOUT + 30000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as Record<string, unknown>;
          if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
          const out = data.output as { type: string; content?: { type: string; text?: string }[] }[] | undefined;
          const text = (out ?? [])
            .filter((o) => o.type === "message")
            .flatMap((o) => o.content ?? [])
            .filter((c) => c.type === "output_text" && c.text)
            .map((c) => c.text)
            .join("\n");
          if (!text) throw new Error("nessun testo");
          return text;
        },
      };
    case "gemini":
      return {
        id: "GOOGLE GEMINI + GOOGLE SEARCH",
        ask: async () => {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: sysOf(msgs) }] },
                contents: [{ role: "user", parts: [{ text: usrOf(msgs) }] }],
                tools: [{ google_search: {} }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
              }),
              signal: AbortSignal.timeout(TIMEOUT),
            }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
          if (!text) throw new Error("nessun testo");
          return text;
        },
      };
    case "openrouter":
      return {
        id: "OPENROUTER · MODELLO ONLINE",
        ask: () =>
          postChat(msgs, "https://openrouter.ai/api/v1/chat/completions",
            { Authorization: `Bearer ${key}` },
            { model: model || "openai/gpt-4o-mini:online", messages: msgs, temperature: 0.7 }),
      };
    case "custom": {
      if (!url) return null;
      return {
        id: "LLM ENDPOINT PERSONALIZZATO",
        ask: () =>
          postChat(msgs, url, { Authorization: `Bearer ${key}` },
            { model: model || "default", messages: msgs, temperature: 0.7 }),
      };
    }
  }
}

/* ----------------------- rilevamento ambiente ----------------------- */

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
}

const ENV_KEYS: Record<LlmKind, string[]> = {
  perplexity: ["PERPLEXITY_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  custom: ["ORACLE_LLM_KEY"],
};
const ENV_MODEL: Record<LlmKind, string> = {
  perplexity: "PERPLEXITY_MODEL", anthropic: "ANTHROPIC_MODEL", openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL", openrouter: "OPENROUTER_MODEL", custom: "ORACLE_LLM_MODEL",
};

export function envHas(kind: LlmKind): boolean {
  const key = ENV_KEYS[kind].map(env).find(Boolean);
  if (!key) return false;
  if (kind === "custom" && !env("ORACLE_LLM_URL")) return false;
  return true;
}

export function envConfiguredKinds(): LlmKind[] {
  return LLM_KINDS.filter(envHas);
}

/* --------------------------- entry point --------------------------- */

export async function queryOracle(
  action: QueryActionKey,
  subject?: string,
  subject2?: string,
  userCfg?: UserLlmConfig | null
): Promise<OracleResult> {
  const msgs = buildMessages(action, subject, subject2);
  const errors: string[] = [];
  const candidates: Provider[] = [];

  if (userCfg?.key) {
    const kinds: LlmKind[] =
      userCfg.provider === "auto"
        ? LLM_KINDS.filter((k) => k !== "custom" || !!userCfg.url)
        : [userCfg.provider];
    for (const k of kinds) {
      const p = buildProvider(k, msgs, userCfg.key, userCfg.model, userCfg.url);
      if (p) candidates.push({ id: `${p.id} · CHIAVE UTENTE`, ask: p.ask });
    }
  }
  for (const k of LLM_KINDS) {
    if (!envHas(k)) continue;
    const key = ENV_KEYS[k].map(env).find(Boolean)!;
    const p = buildProvider(k, msgs, key, env(ENV_MODEL[k]), env("ORACLE_LLM_URL"));
    if (p) candidates.push(p);
  }

  for (const p of candidates) {
    try {
      const raw = await p.ask();
      const norm = normalize(extractJson(raw));
      return { ...norm, engine: p.id, degraded: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "errore";
      errors.push(`${p.id.split(" ·")[0]}: ${msg}`);
      console.error(`[oracolo] provider fallito`, errors[errors.length - 1]);
    }
  }

  const fallback = kernelQuery(action, subject, subject2);
  if (candidates.length) {
    fallback.note = `Provider LLM non raggiungibili (${errors.join(" | ") || "errore"}). Kernel procedurale attivato.`;
  }
  return fallback;
}
