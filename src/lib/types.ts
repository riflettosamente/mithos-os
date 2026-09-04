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
  anecdote: "ANEDDOTO MITOLOGICO",
  origin: "ORIGINE / PROVENIENZA",
  episode: "PASSO MITOLOGICO",
  relation: "RELAZIONE",
  relation_deep: "RELAZIONE APPROFONDITA",
  cause: "NESSO CAUSA/EFFETTO",
};
