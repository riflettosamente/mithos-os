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
  /** Uno slot può contenere più candidati, ad esempio modelli OpenRouter alternativi. */
  asks: (() => Promise<string>)[];
}

const KIND_ENUM = '"divinità" | "titano" | "primordiale" | "eroe" | "creatura" | "luogo" | "oggetto" | "mortale"';

const ORACLE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titolo", "testo", "entita", "relazioni"],
  properties: {
    titolo: { type: "string" },
    testo: { type: "string" },
    entita: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "tipo"],
        properties: {
          nome: { type: "string" },
          tipo: {
            type: "string",
            enum: ["divinità", "titano", "primordiale", "eroe", "creatura", "luogo", "oggetto", "mortale"],
          },
        },
      },
    },
    relazioni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["da", "a", "etichetta"],
        properties: {
          da: { type: "string" },
          a: { type: "string" },
          etichetta: { type: "string" },
        },
      },
    },
  },
} as const;

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

const REDACT_KEY_RE = /(sk-or-v1-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,})/g;

async function errorMessage(res: Response, model?: string): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    const data = JSON.parse(text) as {
      error?: string | { message?: string };
      message?: string;
    };
    const errorField = data.error;
    if (typeof errorField === "string") detail = errorField;
    else if (errorField?.message) detail = errorField.message;
    else if (typeof data.message === "string") detail = data.message;
    else detail = text;
  } catch {
    /* corpo non leggibile */
  }
  const clean = detail
    .replace(REDACT_KEY_RE, "<chiave>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const modelInfo = model ? ` · modello ${model}` : "";
  return clean ? `HTTP ${res.status}${modelInfo}: ${clean}` : `HTTP ${res.status}${modelInfo}`;
}

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
  if (!res.ok) {
    throw new Error(await errorMessage(res, typeof body.model === "string" ? body.model : undefined));
  }
  const data = (await res.json()) as Record<string, unknown>;
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error("risposta priva di contenuto");
  return content;
}

/* ------- selezione dinamica del modello OpenRouter ------- */

interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  supported_parameters?: unknown[];
  architecture?: {
    modality?: unknown;
    input_modalities?: unknown[];
    output_modalities?: unknown[];
  };
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
}

const OPENROUTER_ACCOUNT_DEFAULT = "__account_default__";
const globalForOpenRouter = globalThis as typeof globalThis & {
  __mythosOpenRouterCatalog?: Map<string, Promise<OpenRouterModel[]>>;
};

async function openRouterCatalog(key: string): Promise<OpenRouterModel[]> {
  if (!globalForOpenRouter.__mythosOpenRouterCatalog) {
    globalForOpenRouter.__mythosOpenRouterCatalog = new Map();
  }
  const cacheKey = key.slice(0, 12);
  let pending = globalForOpenRouter.__mythosOpenRouterCatalog.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const data = (await res.json()) as { data?: OpenRouterModel[] };
      return Array.isArray(data.data) ? data.data : [];
    })().catch((error) => {
      globalForOpenRouter.__mythosOpenRouterCatalog?.delete(cacheKey);
      throw error as Error;
    });
    globalForOpenRouter.__mythosOpenRouterCatalog.set(cacheKey, pending);
  }
  return pending;
}

function openRouterModelScore(model: OpenRouterModel): number {
  const id = typeof model.id === "string" ? model.id : "";
  const parameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.map((value) => String(value).toLowerCase())
    : [];
  const promptPrice = Number(model.pricing?.prompt ?? Number.POSITIVE_INFINITY);
  const completionPrice = Number(model.pricing?.completion ?? Number.POSITIVE_INFINITY);
  let score = 0;
  // Fallback automatico prudente: prima i modelli gratuiti.
  if (id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0)) score += 500;
  else score -= Math.min(200, Math.ceil((promptPrice + completionPrice) * 1_000_000));
  if (parameters.includes("response_format")) score += 80;
  if (parameters.includes("structured_outputs") || parameters.includes("json_schema")) score += 60;
  if (parameters.includes("tools")) score += 45;
  if (id.includes("gemini")) score += 40;
  if (id.includes("llama")) score += 28;
  if (id.includes("qwen")) score += 20;
  if (id.includes("gpt-oss")) score += 18;
  if (id.includes("deepseek")) score += 10;
  const context = Number(model.context_length ?? 0);
  score += Math.min(20, Math.floor(context / 100_000));
  return score;
}

async function chooseOpenRouterModel(key: string, configured?: string): Promise<string[]> {
  const preferred = configured?.trim() ?? "";
  // Se non è stato scelto un modello, non inventiamo uno slug: OpenRouter
  // userà il modello predefinito impostato nell'account.
  const candidates: string[] = [preferred || OPENROUTER_ACCOUNT_DEFAULT];

  let catalog: OpenRouterModel[] = [];
  try {
    catalog = await openRouterCatalog(key);
  } catch (error) {
    // Il catalogo è solo un arricchimento: la chat con modello account
    // default/configurato può funzionare comunque.
    console.warn("[oracolo] catalogo OpenRouter non raggiungibile", error);
    return candidates;
  }

  const textModels = catalog.filter((modelItem) => {
    const id = typeof modelItem.id === "string" ? modelItem.id : "";
    const architecture = modelItem.architecture;
    const modality = String(architecture?.modality ?? "").toLowerCase();
    const inputs = (architecture?.input_modalities ?? []).map(String).map((v) => v.toLowerCase());
    const outputs = (architecture?.output_modalities ?? []).map(String).map((v) => v.toLowerCase());
    return !!id && (
      modality.includes("text->text") ||
      (inputs.includes("text") && outputs.includes("text"))
    );
  });

  const availableIds = new Set(textModels.map((item) => String(item.id)));
  if (preferred.endsWith(":online")) {
    const base = preferred.replace(/:online$/, "");
    if (availableIds.has(base)) candidates.push(base);
  }

  candidates.push(
    ...textModels
      .slice()
      .sort((a, b) => openRouterModelScore(b) - openRouterModelScore(a))
      .map((item) => String(item.id))
  );

  return [...new Set(candidates)].slice(0, 6);
}

function httpCategory(statusStart: string, message: string, providerName: string): string {
  if (statusStart === "401" || statusStart === "403") {
    return `${providerName}: chiave non valida, non autorizzata o con accesso negato`;
  }
  if (statusStart === "404") {
    return `${providerName}: modello o endpoint non trovato`;
  }
  if (statusStart === "402" || statusStart === "429") {
    return `${providerName}: quota, rate limit o credito provider raggiunto`;
  }
  if (/\b(408|502|503|504)\b/.test(statusStart)) {
    return `${providerName}: servizio temporaneamente non raggiungibile`;
  }
  return `${providerName}: ${message}`;
}

function buildProvider(kind: LlmKind, msgs: ChatMsg[], key: string, model?: string, url?: string): Provider | null {
  switch (kind) {
    case "perplexity":
      return {
        id: "PERPLEXITY SONAR · RICERCA WEB LIVE",
        asks: [() =>
          postChat(msgs, "https://api.perplexity.ai/chat/completions",
            { Authorization: `Bearer ${key}` },
            { model: model || "sonar-pro", messages: msgs, temperature: 0.7 })],
      };
    case "anthropic":
      return {
        id: "ANTHROPIC CLAUDE + WEB SEARCH",
        asks: [async () => {
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
        }],
      };
    case "openai": {
      const parseResponses = async (res: Response, modelName: string): Promise<string> => {
        if (!res.ok) throw new Error(await errorMessage(res, modelName));
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
      };

      const callResponses = async (modelName: string, useWebSearch: boolean): Promise<string> => {
        const res = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: modelName,
            ...(useWebSearch ? { tools: [{ type: "web_search" }] } : {}),
            input: msgs.map((m) => ({ role: m.role, content: m.content })),
            text: {
              format: {
                type: "json_schema",
                name: "mythos_oracle",
                strict: true,
                schema: ORACLE_JSON_SCHEMA,
              },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT + 30000),
        });
        return parseResponses(res, modelName);
      };

      const preferred = (model || "gpt-4.1").trim();
      const candidates = [...new Set([preferred, "gpt-4.1", "gpt-4o-mini", "gpt-4.1-mini"])]
        .flatMap((modelName) => [
          () => callResponses(modelName, true),
          () => callResponses(modelName, false),
          () => postChat(msgs, "https://api.openai.com/v1/chat/completions",
            { Authorization: `Bearer ${key}` },
            {
              model: modelName,
              messages: msgs,
              temperature: 0.7,
              response_format: { type: "json_object" },
            }),
          () => postChat(msgs, "https://api.openai.com/v1/chat/completions",
            { Authorization: `Bearer ${key}` },
            { model: modelName, messages: msgs, temperature: 0.7 }),
        ]);

      return {
        id: `OPENAI GPT · ${preferred}`,
        asks: candidates,
      };
    }
    case "gemini":
      return {
        id: "GOOGLE GEMINI + GOOGLE SEARCH",
        asks: [async () => {
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
        }],
      };
    case "openrouter": {
      return {
        id: `OPENROUTER · ${(model || "auto").trim()}`,
        asks: [async () => {
          /*
           * Il modello è scelto al primo uso interrogando il catalogo dei
           * modelli compatibili con la chiave. Evita di affidarsi a slug
           * :online o :free che cambiano nel tempo o non sono abilitati.
           */
          const candidates = await chooseOpenRouterModel(key, model);
          const failures: string[] = [];
          const headers = {
            Authorization: `Bearer ${key}`,
            "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "",
            "X-OpenRouter-Title": "MYTHOS-OS",
          };

          for (const candidate of candidates) {
            const label = candidate === OPENROUTER_ACCOUNT_DEFAULT ? "modello predefinito account" : candidate;
            const modelField = candidate === OPENROUTER_ACCOUNT_DEFAULT ? {} : { model: candidate };
            const baseBody = { ...modelField, messages: msgs, temperature: 0.7, max_tokens: 3000 };
            const attempts: Record<string, unknown>[] = [
              {
                ...baseBody,
                response_format: { type: "json_object" },
                plugins: [{ id: "web", enabled: true }],
              },
              { ...baseBody, response_format: { type: "json_object" } },
              baseBody,
            ];

            for (const body of attempts) {
              try {
                return await postChat(msgs, "https://openrouter.ai/api/v1/chat/completions", headers, body);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`${label}: ${message}`);
                console.warn(`[oracolo] OpenRouter · ${label}: ${message}`);
                // Una 401 è riferita alla chiave, non al modello/formato.
                if (/HTTP 401\b/.test(message)) throw new Error(httpCategory("401", message, "OPENROUTER"));
              }
            }
          }
          const first = failures[0] ?? "nessun errore dettagliato";
          const firstStatus = /^.*?HTTP (\d{3})/.exec(first)?.[1] ?? "";
          throw new Error(httpCategory(firstStatus, first, "OPENROUTER"));
        }],
      };
    }
    case "custom": {
      if (!url) return null;
      return {
        id: "LLM ENDPOINT PERSONALIZZATO",
        asks: [() =>
          postChat(msgs, url, { Authorization: `Bearer ${key}` },
            { model: model || "default", messages: msgs, temperature: 0.7 })],
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
  userCfg?: UserLlmConfig | null,
  includeEnvironmentProviders = true
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
      if (p) candidates.push({ id: `${p.id} · CHIAVE UTENTE`, asks: p.asks });
    }
  }
  if (includeEnvironmentProviders) {
    for (const k of LLM_KINDS) {
      if (!envHas(k)) continue;
      const key = ENV_KEYS[k].map(env).find(Boolean)!;
      const p = buildProvider(k, msgs, key, env(ENV_MODEL[k]), env("ORACLE_LLM_URL"));
      if (p) candidates.push(p);
    }
  }

  for (const p of candidates) {
    const slotErrors: string[] = [];
    for (const ask of p.asks) {
      try {
        const raw = await ask();
        const norm = normalize(extractJson(raw));
        return { ...norm, engine: p.id, degraded: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "errore";
        slotErrors.push(msg);
        console.error(`[oracolo] tentativo fallito · ${p.id} · ${msg}`);
      }
    }
    errors.push(`${p.id.split(" ·")[0]}: ${slotErrors.join(" → ")}`);
  }

  const fallback = kernelQuery(action, subject, subject2);
  if (candidates.length) {
    fallback.note = `Provider LLM non raggiungibili (${errors.join(" | ") || "errore"}). Verifica sul provider il modello configurato, la compatibilità della chiave e gli endpoint. Kernel procedurale attivato.`;
  }
  return fallback;
}
