import { integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

export const mythSessions = pgTable("myth_sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // configurazione opzionale inserita dall'utente via menu File
  llmProvider: text("llm_provider"),
  llmKey: text("llm_key"),
  llmModel: text("llm_model"),
  llmUrl: text("llm_url"),
});

export const mythEntities = pgTable("myth_entities", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => mythSessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
});

export const mythRelations = pgTable("myth_relations", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => mythSessions.id, { onDelete: "cascade" }),
  fromName: text("from_name").notNull(),
  toName: text("to_name").notNull(),
  label: text("label").notNull(),
});

export const mythPages = pgTable("myth_pages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => mythSessions.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  action: text("action").notNull(),
  subject: text("subject"),
  subject2: text("subject2"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  engine: text("engine").notNull().default("?"),
  at: integer("at").notNull().default(0),
  entitiesJson: text("entities_json").notNull().default("[]"),
  relationsJson: text("relations_json").notNull().default("[]"),
});
