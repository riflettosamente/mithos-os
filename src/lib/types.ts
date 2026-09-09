export type EntityKind =
  | "divinità"
  | "titano"
  | "primordiale"
  | "eroe"
  | "creatura"
  | "luogo"
  | "oggetto"
  | "mortale";

export const ENTITY_KINDS: EntityKind[] = [
  "divinità",
  "titano",
  "primordiale",
  "eroe",
  "creatura",
  "luogo",
  "oggetto",
  "mortale",
];

/* Tassonomia canonica di sicurezza. I provider possono omettere un'entità
 * dall'array strutturato o classificarla male; per i nomi mitologici noti
 * questa mappa ha precedenza sulla risposta del modello. Le chiavi includono
 * anche varianti greche/latine e collettivi che compaiono spesso nei testi. */
const CANONICAL_KIND: Record<string, EntityKind> = {
  // primordiali e varianti
  caos: "primordiale", chaos: "primordiale",
  gea: "primordiale", gaia: "primordiale", gaea: "primordiale",
  urano: "primordiale", ouranos: "primordiale",
  erebo: "primordiale", notte: "primordiale", nyx: "primordiale",
  etere: "primordiale", emera: "primordiale", tartaro: "luogo",
  primordiali: "primordiale", divinita_primordiali: "primordiale",

  // titani, titanidi e collettivi
  crono: "titano", cronos: "titano", cronus: "titano", kronos: "titano",
  rea: "titano", rhea: "titano", oceano: "titano", oceanus: "titano",
  teti: "titano", iperione: "titano", giapeto: "titano", mnemosine: "titano",
  temi: "titano", leto: "titano", prometeo: "titano", epimeteo: "titano",
  atlante: "titano", meti: "titano", eos: "titano", selene: "titano",
  ceo: "titano", crio: "titano", febe: "titano", teia: "titano",
  titano: "titano", titani: "titano", titanide: "titano", titanidi: "titano",

  // divinità
  zeus: "divinità", era: "divinità", poseidone: "divinità", ade: "divinità",
  demetra: "divinità", estia: "divinità", atena: "divinità", apollo: "divinità",
  artemide: "divinità", ares: "divinità", afrodite: "divinità", efesto: "divinità",
  ermes: "divinità", hermes: "divinità", dioniso: "divinità", persefone: "divinità",
  ecate: "divinità", hecate: "divinità", pan: "divinità", iride: "divinità",
  nike: "divinità", eris: "divinità", eros: "divinità", amore: "divinità",
  nemesi: "divinità", thanatos: "divinità", hypnos: "divinità",
  morfeo: "divinità", asclepio: "divinità", esperidi: "divinità",
  moire: "divinità", muse: "divinità", cariti: "divinità", grazie: "divinità",
  olimpi: "divinità", dei_olimpici: "divinità", dee_olimpiche: "divinità",

  // creature e collettivi
  tifone: "creatura", echidna: "creatura", cerbero: "creatura",
  idra_di_lerna: "creatura", chimera: "creatura", sfinge: "creatura",
  leone_di_nemea: "creatura", medusa: "creatura", minotauro: "creatura",
  pegaso: "creatura", ciclopi: "creatura", ciclope: "creatura",
  polifemo: "creatura", argo: "creatura", arpie: "creatura", sirene: "creatura",
  scilla: "creatura", cariddi: "creatura", chirone: "creatura",
  centauri: "creatura", centauro: "creatura", gorgoni: "creatura",
  ecatonchiri: "creatura", giganti: "creatura", mostri: "creatura",

  // eroi
  eracle: "eroe", ercole: "eroe", perseo: "eroe", teseo: "eroe",
  giasone: "eroe", achille: "eroe", odisseo: "eroe", ulisse: "eroe",
  ettore: "eroe", paride: "eroe", agamennone: "eroe", menelao: "eroe",
  aiace: "eroe", bellerofonte: "eroe", orfeo: "eroe", atalanta: "eroe",
  cadmo: "eroe", edipo: "eroe", oreste: "eroe", argonauti: "eroe",
  dioscuro: "eroe", dioscuri: "eroe", castore: "eroe", polluce: "eroe",

  // mortali
  elena: "mortale", cassandra: "mortale", clitennestra: "mortale",
  penelope: "mortale", medea: "mortale", andromeda: "mortale",
  arianna: "mortale", icaro: "mortale", dedalo: "mortale", tiresia: "mortale",
  europa: "mortale", io: "mortale", danae: "mortale", leda: "mortale",
  aracne: "mortale", narciso: "mortale", eco: "mortale", mida: "mortale",
  midas: "mortale", niobe: "mortale", sisifo: "mortale", tantalo: "mortale",
  deucalione: "mortale", pirra: "mortale", euridice: "mortale",
  euristeo: "mortale", semele: "mortale", pandora: "mortale",
  minosse: "mortale", priamo: "mortale", ecuba: "mortale",

  // luoghi
  olimpo: "luogo", elisio: "luogo", eliseo: "luogo", stige: "luogo",
  lete: "luogo", delfi: "luogo", delo: "luogo", creta: "luogo",
  troia: "luogo", ilio: "luogo", micene: "luogo", tebe: "luogo",
  atene: "luogo", itaca: "luogo", colchide: "luogo",
  labirinto_di_cnosso: "luogo", oltretomba: "luogo", erebo_luogo: "luogo",

  // oggetti
  fulmine_di_zeus: "oggetto", tridente_di_poseidone: "oggetto", egida: "oggetto",
  elmo_di_ade: "oggetto", sandali_alati: "oggetto", falce_adamantina: "oggetto",
  vaso_di_pandora: "oggetto", vello_d_oro: "oggetto", velo_d_oro: "oggetto",
  pomo_della_discordia: "oggetto", filo_di_arianna: "oggetto",
  cavallo_di_troia: "oggetto", lira_di_orfeo: "oggetto",
};

function entityKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[’']/g, "_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function inferEntityKind(name: string, claimed?: EntityKind): EntityKind {
  return CANONICAL_KIND[entityKey(name)] ?? claimed ?? "mortale";
}

export interface EntityRef {
  name: string;
  kind: EntityKind;
}

export interface RelationEdge {
  from: string;
  to: string;
  label: string;
}

export type QueryActionKey =
  | "opening"
  | "who"
  | "etymology"
  | "anecdote"
  | "origin"
  | "episode"
  | "relation"
  | "relation_deep"
  | "cause";

export interface OracleResult {
  title: string;
  text: string;
  entities: EntityRef[];
  relations: RelationEdge[];
  engine: string;
  degraded: boolean;
  note?: string;
}

export interface MythPage {
  id: string;
  action: QueryActionKey;
  subject?: string;
  subject2?: string;
  title: string;
  raw: string;
  entities: EntityRef[];
  relations: RelationEdge[];
  engine: string;
  at: number;
}

export interface BoardEntity extends EntityRef {
  x: number; // percent
  y: number; // percent
}

export interface PersistedState {
  entities: BoardEntity[];
  relations: RelationEdge[];
  pages: MythPage[];
  idx: number;
}

export const KIND_META: Record<
  EntityKind,
  { color: string; label: string }
> = {
  "divinità": { color: "#ffb400", label: "DIVINITÀ" },
  titano: { color: "#9d7bff", label: "TITANO" },
  primordiale: { color: "#ff6ee5", label: "PRIMORDIALE" },
  eroe: { color: "#53d8ff", label: "EROE" },
  creatura: { color: "#ff5d4f", label: "CREATURA" },
  luogo: { color: "#59e07a", label: "LUOGO" },
  oggetto: { color: "#f2a154", label: "OGGETTO" },
  mortale: { color: "#d6d3c8", label: "MORTALE" },
};

export const ACTION_LABEL: Record<QueryActionKey, string> = {
  opening: "OVERTURE MITOLOGICA",
  who: "RACCONTA CHI È",
  etymology: "ETIMOLOGIA",
  anecdote: "ANEDDOTO MITOLOGICO",
  origin: "ORIGINE / PROVENIENZA",
  episode: "PASSO MITOLOGICO",
  relation: "RELAZIONE",
  relation_deep: "RELAZIONE APPROFONDITA",
  cause: "NESSO CAUSA/EFFETTO",
};
