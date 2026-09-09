import { kernelQuery } from "./kernel";
import { inferEntityKind } from "./types";
import type { EntityKind, OracleResult, QueryActionKey } from "./types";

/* ================================================================== */
/*  ORACOLO-9000 — motore LLM con ricerca web multilingue in tempo      */
/*  reale. Le chiavi possono arrivare da process.env oppure essere      */
/*  inserite dall'utente (menu File > Configura chiave LLM).            */
/*  Senza chiavi -> kernel procedurale di emergenza (mai muto).         */
/* ================================================================== */

export type LlmKind =
  | "perplexity"
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "groq"
  | "cloudflare"
  | "custom";

export const LLM_KINDS: LlmKind[] = [
  "perplexity", "anthropic", "openai", "gemini", "openrouter", "groq", "cloudflare", "custom",
];

export const LLM_KIND_LABEL: Record<LlmKind, string> = {
  perplexity: "Perplexity Sonar · ricerca web live",
  anthropic: "Anthropic Claude · web search",
  openai: "OpenAI GPT · web search",
  gemini: "Google Gemini · google search",
  openrouter: "OpenRouter · modello :online",
  groq: "Groq · inferenza velocissima, free tier",
  cloudflare: "Cloudflare Workers AI · fallback giornaliero gratuito",
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
  etymology: {
    words: "140-240",
    needs: 1,
    describe: (a) => `Spiega l'etimologia di ${a}: forma italiana, nome in greco antico con grafia e traslitterazione, radice linguistica, significato letterale, eventuali interpretazioni antiche e moderne e rapporto prudente tra il nome e il mito. Distingui chiaramente le etimologie documentate da quelle controverse o popolari, senza inventare certezze.`,
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

/* I modelli gratuiti tagliano spesso la risposta a metà JSON (limite di
 * token di completamento). Invece di gettare TUTTO via — titolo e testo
 * sono i primi campi e restano integri — chiudiamo strutturalmente la
 * parte sana e salviamo il salvabile. */
function closeStructuralJson(chunk: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = chunk.replace(/,\s*$/, "");
  if (inString) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}

function salvageTruncatedJson(src: string): Record<string, unknown> | null {
  const start = src.indexOf("{");
  if (start < 0) return null;
  const body = src.slice(start);

  /* posizioni "sicure" di taglio: dopo } o ] che chiudono qualcosa, e
   * prima delle virgole (così da buttare l'ultimo elemento incompleto) */
  const cuts: number[] = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length > 0) cuts.push(i + 1);
    } else if (ch === ",") {
      cuts.push(i);
    }
  }

  const candidates = [body.length, ...cuts].sort((a, b) => b - a);
  const seen = new Set<number>();
  for (const n of candidates) {
    if (n <= start + 2 || seen.has(n)) continue;
    seen.add(n);
    try {
      const v = JSON.parse(closeStructuralJson(body.slice(0, n)));
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* ancora troncato male: si scende a un taglio più corto */
    }
  }
  return null;
}

function extractJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0) throw new Error("nessun JSON nella risposta");
  const core = j > i ? s.slice(i, j + 1) : s.slice(i);
  try {
    return JSON.parse(core) as Record<string, unknown>;
  } catch {
    /* primo tentativo fallito */
  }
  try {
    const repaired = core.replace(/[\r\n\t]+/g, " ");
    return JSON.parse(repaired) as Record<string, unknown>;
  } catch {
    const salvaged = salvageTruncatedJson(core);
    if (salvaged) return salvaged;
    throw new Error("JSON malformato nella risposta");
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
    const claimed = (KIND_SET.has(tipoRaw) ? tipoRaw : undefined) as EntityKind | undefined;
    const kind = inferEntityKind(nome, claimed);
    entities.push({ name: nome, kind });
  }
  const tagRe = /\[\[([^\]|]{2,60})\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text)) !== null) {
    const n = m[1].trim();
    if (n && !seenE.has(n.toLowerCase())) {
      seenE.add(n.toLowerCase());
      entities.push({ name: n, kind: inferEntityKind(n) });
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
  _msgs: ChatMsg[],
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

/* Flag runtime: diventa true al primo "Insufficient credits" del provider,
 * così le query successive saltano il tentativo con plugin web (a pagamento)
 * e non bruciano una richiesta della quota gratuita. */
const globalForOpenRouterFlags = globalThis as typeof globalThis & {
  __mythosOrNoCredits?: boolean;
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
  if (!id) return -999999;

  // La famiglia openrouter/* sono router e strumenti interni (bodybuilder,
  // fusion, auto, free...), non modelli chat chiamabili da noi: i free
  // veri li classifichiamo noi per punteggio.
  if (id.startsWith("openrouter/")) return -999999;

  const promptPrice = Number(model.pricing?.prompt ?? Number.POSITIVE_INFINITY);
  const completionPrice = Number(model.pricing?.completion ?? Number.POSITIVE_INFINITY);

  // Prezzi negativi (-1) indicano router o strumenti speciali OpenRouter: escludili
  if (promptPrice < 0 || completionPrice < 0) return -999999;

  let score = 0;
  const isFree = id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0);
  if (isFree) {
    score += 10000;
  } else {
    score -= Math.max(0, Math.ceil((promptPrice + completionPrice) * 1_000_000));
  }

  const parameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.map((value) => String(value).toLowerCase())
    : [];
  if (parameters.includes("response_format")) score += 80;
  if (parameters.includes("structured_outputs") || parameters.includes("json_schema")) score += 60;
  if (parameters.includes("tools")) score += 45;
  if (id.includes("gemma")) score += 50;
  if (id.includes("nemotron")) score += 40;
  if (id.includes("gemini")) score += 40;
  if (id.includes("llama")) score += 30;
  if (id.includes("qwen")) score += 20;
  if (id.includes("gpt-oss")) score += 18;
  if (id.includes("deepseek")) score += 10;
  // I modelli "reasoning" di nuova generazione consumano i token di risposta
  // nel ragionamento e lasciano il contenuto vuoto: penalizzali. I "preview"
  // sono distribuzioni instabili che svaniscono da un giorno all'altro.
  if (id.includes("reasoning")) score -= 150;
  if (id.includes("preview")) score -= 100;
  const context = Number(model.context_length ?? 0);
  score += Math.min(20, Math.floor(context / 100_000));
  return score;
}

async function chooseOpenRouterModel(key: string, configured?: string): Promise<string[]> {
  const rawPreferred = configured?.trim() ?? "";
  const isExplicit =
    rawPreferred &&
    rawPreferred.toLowerCase() !== "auto" &&
    rawPreferred !== OPENROUTER_ACCOUNT_DEFAULT;

  let catalog: OpenRouterModel[] = [];
  try {
    catalog = await openRouterCatalog(key);
  } catch (error) {
    console.warn("[oracolo] catalogo OpenRouter non raggiungibile", error);
    return isExplicit ? [rawPreferred] : [];
  }

  const textModels = catalog.filter((modelItem) => {
    const id = typeof modelItem.id === "string" ? modelItem.id : "";
    const architecture = modelItem.architecture;
    const modality = String(architecture?.modality ?? "").toLowerCase();
    const inputs = (architecture?.input_modalities ?? []).map(String).map((v) => v.toLowerCase());
    const outputs = (architecture?.output_modalities ?? []).map(String).map((v) => v.toLowerCase());
    return (
      !!id &&
      (modality.includes("text->text") ||
        (inputs.includes("text") && outputs.includes("text")))
    );
  });

  const availableIds = new Set(textModels.map((item) => String(item.id)));
  const ranked = textModels
    .filter((m) => openRouterModelScore(m) > 0)
    .sort((a, b) => openRouterModelScore(b) - openRouterModelScore(a))
    .map((item) => String(item.id));
  const freeRanked = ranked.filter((id) => id.endsWith(":free"));

  const candidates: string[] = [];
  if (isExplicit) {
    candidates.push(rawPreferred);
    if (rawPreferred.endsWith(":online")) {
      const base = rawPreferred.replace(/:online$/, "");
      if (availableIds.has(base)) candidates.push(base);
    }
    /* Spalla d'emergenza: se il modello scelto è giù/quota finita, prova
       gli altri free (mai il "default account", che può essere rotto). */
    candidates.push(...freeRanked);
  } else {
    /* Auto: solo il catalogo rankato, con i free in testa. */
    candidates.push(...ranked);
  }
  return [...new Set(candidates)].slice(0, 6);
}

/* ----------------------- selezione dinamica Groq ----------------------- */

interface GroqCatalogModel {
  id?: unknown;
  active?: unknown;
  context_window?: unknown;
}

const globalForGroq = globalThis as typeof globalThis & {
  __mythosGroqCatalog?: Map<string, Promise<GroqCatalogModel[]>>;
};

async function groqCatalog(key: string): Promise<GroqCatalogModel[]> {
  if (!globalForGroq.__mythosGroqCatalog) {
    globalForGroq.__mythosGroqCatalog = new Map();
  }
  const cacheKey = key.slice(0, 12);
  let pending = globalForGroq.__mythosGroqCatalog.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const data = (await res.json()) as { data?: GroqCatalogModel[] };
      return Array.isArray(data.data) ? data.data : [];
    })().catch((error) => {
      globalForGroq.__mythosGroqCatalog?.delete(cacheKey);
      throw error as Error;
    });
    globalForGroq.__mythosGroqCatalog.set(cacheKey, pending);
  }
  return pending;
}

function groqModelScore(id: string, contextWindow: number): number {
  const l = id.toLowerCase();
  // Non modelli chat: audio, moderazione, sistemi agentici con formato proprio
  if (l.includes("whisper") || l.includes("tts") || l.includes("safeguard") || l.includes("guard")) return -100;
  if (l.startsWith("groq/compound")) return -50;
  let s = 50;
  /* Priorita alla capacita free (token/minuto): l Oracolo chiede ~1500 token
     a risposta;.i modelli con tetto piccolo (preview qwen3.6, 1000 OTPM)
     vanno in tilt anche se piu "intelligenti". */
  if (l.includes("llama-4-scout")) s += 85;      // free ~30K TPM
  if (l.includes("llama-4-maverick")) s += 75;
  if (l.includes("gpt-oss-120b")) s += 80;        // free ~8K TPM
  if (l.includes("llama-3.3-70b")) s += 70;       // free ~12K TPM (se ancora vivo)
  if (l.includes("kimi")) s += 55;
  if (l.includes("gpt-oss-20b")) s += 40;
  if (l.includes("gemma")) s += 35;
  if (l.includes("qwen")) s += 25;
  if (l.includes("qwen3.6")) s -= 50;             // preview con tetto free irrisorio per testi lunghi
  if (/7\d?0b/.test(l) || l.includes("32b")) s += 10;
  s += Math.min(15, Math.floor(contextWindow / 60_000));
  return s;
}

async function chooseGroqModel(key: string, configured?: string): Promise<string[]> {
  const explicit = (configured ?? "").trim();
  const out: string[] = explicit ? [explicit] : [];
  try {
    const catalog = await groqCatalog(key);
    const ranked = catalog
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        active: item.active !== false,
        ctx: Number(item.context_window ?? 0),
      }))
      .filter((item) => !!item.id && item.active)
      .map((item) => ({ ...item, score: groqModelScore(item.id, item.ctx) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.id);
    out.push(...ranked);
  } catch (error) {
    console.warn("[oracolo] catalogo Groq non raggiungibile", error);
    /* catalogo irraggiungibile: spie con i modelli della produzione nota */
    out.push(
      "openai/gpt-oss-120b",
      "llama-3.3-70b-versatile",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "qwen/qwen3-32b",
    );
  }
  return [...new Set(out)].slice(0, 5);
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
    case "groq":
      return {
        id: `GROQ LPU · ${(model || "auto").trim()}`,
        asks: [async () => {
          /* Groq ritira spesso i modelli (vedi deprecazioni Llama del 2026):
             invece di nomi scritti nel codice, interroghiamo il catalogo live
             con la chiave dell'utente e scegliamo i migliori attivi. */
          const candidates = await chooseGroqModel(key, model);
          const headers = { Authorization: `Bearer ${key}` };
          const failures: string[] = [];
          const url = "https://api.groq.com/openai/v1/chat/completions";
          /* 2000 token bastano al JSON epico (testo ~700 + entità/relazioni)
             e passano più in fretta i tetti free di token al minuto. */
          const baseBody = { messages: msgs, temperature: 0.7, max_completion_tokens: 2000 };
          let retryUsed = false;

          for (const candidateModel of candidates) {
            /* include_reasoning:false impedisce ai modelli gpt-oss di bruciare
               i token di completamento nel ragionamento interno. */
            const attempts: Record<string, unknown>[] = [
              { ...baseBody, model: candidateModel, include_reasoning: false, response_format: { type: "json_object" } },
              { ...baseBody, model: candidateModel, include_reasoning: false },
              { ...baseBody, model: candidateModel },
            ];
            for (const body of attempts) {
              try {
                return await postChat(msgs, url, headers, body);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`${candidateModel}: ${message}`);
                console.warn(`[oracolo] Groq · ${candidateModel}: ${message}`);
                if (/HTTP 401\b/.test(message)) throw new Error(httpCategory("401", message, "GROQ"));
                /* 429 transitorio di minuto ("riprova tra N secondi"): se la
                   pausa e breve la onoriamo UNA volta, attenuando l'attesa
                   massima sotto accettabile (lo spinner retro copre bene). */
                const waitMatch = /try again in (\d+(?:\.\d+)?)s/i.exec(message);
                if (!retryUsed && waitMatch) {
                  const waitMs = Math.ceil(Number(waitMatch[1]) * 1000) + 600;
                  if (waitMs <= 32_000) {
                    retryUsed = true;
                    console.warn(`[oracolo] Groq · riprovo tra ${Number(waitMatch[1]).toFixed(1)}s (limite al minuto)`);
                    await new Promise((resolve) => setTimeout(resolve, waitMs));
                    try {
                      return await postChat(msgs, url, headers, body);
                    } catch (retryError) {
                      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
                      failures.push(`${candidateModel} (dopo attesa): ${retryMessage}`);
                      console.warn(`[oracolo] Groq · retry ${candidateModel}: ${retryMessage}`);
                      if (/HTTP 401\b/.test(retryMessage)) throw new Error(httpCategory("401", retryMessage, "GROQ"));
                      /* Se pure dopo l'attesa il modello resta saturo, il ciclo
                         prosegue con gli altri candidati (i limiti al minuto
                         sono per singolo modello, non per l'account intero). */
                    }
                  }
                }
              }
            }
          }
          const first = failures[0] ?? "nessun errore dettagliato";
          const firstStatus = /^.*?HTTP (\d{3})/.exec(first)?.[1] ?? "";
          throw new Error(httpCategory(firstStatus, first, "GROQ"));
        }],
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
            /* reasoning:exclude evita che i modelli "a ragionamento" brucino i token
               nel pensiero interno e lascino il contenuto della risposta vuoto. */
            const baseBody = { ...modelField, messages: msgs, temperature: 0.7, max_tokens: 3000, reasoning: { exclude: true } };
            /* Plugin web = a pagamento: account che ha gia risposto
               "Insufficient credits" lo salta (fa risparmiare 1 richiesta
               a query, decisivo con quota free ~50/giorno). */
            const noCredit = globalForOpenRouterFlags.__mythosOrNoCredits === true;
            const attempts: Record<string, unknown>[] = [
              ...(noCredit ? [] : [{
                ...baseBody,
                response_format: { type: "json_object" },
                plugins: [{ id: "web", enabled: true }],
              }]),
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
                // Account senza crediti: dal prossimo tentativo salta il plugin web.
                if (/never purchased credits|insufficient credits/i.test(message)) {
                  globalForOpenRouterFlags.__mythosOrNoCredits = true;
                }
                // La quota free giornaliera e un limite DI ACCOUNT: identico
                // su ogni modello free. Stop immediato con guida: inutile e
                // controproducente insistere sugli altri ~17 tentativi.
                if (/free-models-per-day/i.test(message)) {
                  throw new Error(
                    "OPENROUTER: quota gratuita giornaliera esaurita. Si ripristina da sola a mezzanotte UTC. Per sbloccarla subito: aggiungi 10 crediti su openrouter.ai/settings/credits, oppure nel frattempo usa il provider GEMINI (chiave gratuita su aistudio.google.com, 1500 richieste al giorno)",
                  );
                }
              }
            }
          }
          const first = failures[0] ?? "nessun errore dettagliato";
          const firstStatus = /^.*?HTTP (\d{3})/.exec(first)?.[1] ?? "";
          throw new Error(httpCategory(firstStatus, first, "OPENROUTER"));
        }],
      };
    }
    case "cloudflare": {
      /* Workers AI: endpoint OpenAI-compatibile per account.
       * L'ID account arriva dall'ambiente (server) o dal campo URL del
       * dialogo. Fallback gratuito con 10.000 Neurons al giorno. */
      const account =
        (url && !/^https?:\/\//i.test(url) ? url.trim() : "") ||
        env("CLOUDFLARE_ACCOUNT_ID") ||
        "";
      if (!account) return null;
      return {
        id: `CLOUDFLARE WORKERS AI · ${(model || "auto").trim()}`,
        asks: [async () => {
          const base = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`;
          const headers = { Authorization: `Bearer ${key}` };
          const failures: string[] = [];
          const candidates = await chooseCloudflareModel(base, headers, model);

          for (const candidateModel of candidates) {
            const attempts: Record<string, unknown>[] = [
              { model: candidateModel, messages: msgs, temperature: 0.7, max_tokens: 2000, response_format: { type: "json_object" } },
              { model: candidateModel, messages: msgs, temperature: 0.7, max_tokens: 2000 },
            ];
            for (const body of attempts) {
              try {
                return await postChat(msgs, `${base}/chat/completions`, headers, body);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`${candidateModel}: ${message}`);
                console.warn(`[oracolo] Cloudflare · ${candidateModel}: ${message}`);
                if (/HTTP 401\b|HTTP 403\b/.test(message)) {
                  throw new Error(httpCategory("401", message, "CLOUDFLARE"));
                }
                /* 429 con i Neurons esauriti: cambia modello, a volte il
                   limite è per modello e non per account. */
              }
            }
          }
          const first = failures[0] ?? "nessun errore dettagliato";
          const firstStatus = /^.*?HTTP (\d{3})/.exec(first)?.[1] ?? "";
          throw new Error(httpCategory(firstStatus, first, "CLOUDFLARE"));
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

/* -------------------- selezione dinamica Cloudflare -------------------- */

const CLOUDFLARE_FALLBACK_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
];

function cloudflareModelScore(id: string): number {
  const l = id.toLowerCase();
  if (l.includes("embed") || l.includes("rerank") || l.includes("whisper") || l.includes("flux")) return -100;
  if (l.includes("resnet") || l.includes("bge") || l.includes("m2m100")) return -100;
  let s = 50;
  if (l.includes("llama-3.3-70b")) s += 80;
  if (l.includes("llama-3.1-8b")) s += 45;
  if (l.includes("qwen")) s += 40;
  if (l.includes("mistral")) s += 35;
  if (l.includes("gpt-oss")) s += 30;
  if (l.includes("70b")) s += 15;
  if (l.includes("preview") || l.includes("beta")) s -= 20;
  return s;
}

async function chooseCloudflareModel(
  base: string,
  headers: Record<string, string>,
  configured?: string,
): Promise<string[]> {
  const explicit = (configured ?? "").trim();
  const out: string[] = explicit ? [explicit] : [];
  try {
    const res = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id?: unknown }[] };
    const ranked = (Array.isArray(data.data) ? data.data : [])
      .map((item) => (typeof item.id === "string" ? item.id : ""))
      .filter(Boolean)
      .map((id) => ({ id, score: cloudflareModelScore(id) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.id);
    out.push(...ranked);
  } catch (error) {
    console.warn("[oracolo] catalogo Cloudflare non raggiungibile", error);
    out.push(...CLOUDFLARE_FALLBACK_MODELS);
  }
  return [...new Set(out)].slice(0, 4);
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
  groq: ["GROQ_API_KEY"],
  cloudflare: ["CLOUDFLARE_API_TOKEN"],
  custom: ["ORACLE_LLM_KEY"],
};
const ENV_MODEL: Record<LlmKind, string> = {
  perplexity: "PERPLEXITY_MODEL", anthropic: "ANTHROPIC_MODEL", openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL", openrouter: "OPENROUTER_MODEL", groq: "GROQ_MODEL",
  cloudflare: "CLOUDFLARE_MODEL", custom: "ORACLE_LLM_MODEL",
};

export function envHas(kind: LlmKind): boolean {
  const key = ENV_KEYS[kind].map(env).find(Boolean);
  if (!key) return false;
  if (kind === "custom" && !env("ORACLE_LLM_URL")) return false;
  /* Workers AI richiede anche l'ID account per comporre l'endpoint. */
  if (kind === "cloudflare" && !env("CLOUDFLARE_ACCOUNT_ID")) return false;
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
