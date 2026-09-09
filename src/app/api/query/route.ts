import { db } from "@/db";
import { ensureMythosSchema } from "@/db/ensure-schema";
import { mythSessions } from "@/db/schema";
import { queryOracle } from "@/lib/llm";
import type { LlmKind, UserLlmConfig } from "@/lib/llm";
import type { QueryActionKey } from "@/lib/types";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID: QueryActionKey[] = [
  "opening", "who", "etymology", "anecdote", "origin", "episode", "relation", "relation_deep", "cause",
];

const NEEDS_ONE: QueryActionKey[] = ["who", "etymology", "anecdote", "origin", "episode"];
const NEEDS_TWO: QueryActionKey[] = ["relation", "relation_deep", "cause"];

interface Body {
  action?: unknown;
  subject?: unknown;
  subject2?: unknown;
  sid?: unknown;
}

const USER_PROVIDERS: LlmKind[] = ["perplexity", "anthropic", "openai", "gemini", "openrouter", "custom"];

async function loadUserConfig(sid: string | null): Promise<UserLlmConfig | null> {
  if (!sid || !/^[\w-]{8,64}$/.test(sid)) return null;
  try {
    await ensureMythosSchema();
    const [row] = await db.select().from(mythSessions).where(eq(mythSessions.id, sid)).limit(1);
    if (!row?.llmKey || !row.llmProvider) return null;
    const provider = row.llmProvider as LlmKind;
    if (!USER_PROVIDERS.includes(provider)) return null;
    if (provider === "custom" && !row.llmUrl) return null;
    return {
      provider,
      key: row.llmKey,
      model: row.llmModel ?? undefined,
      url: row.llmUrl ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "payload non valido" }, { status: 400 });
  }

  const action = body.action as QueryActionKey;
  if (!VALID.includes(action)) {
    return Response.json({ error: "azione sconosciuta all'Oracolo" }, { status: 400 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 80) : "";
  const subject2 = typeof body.subject2 === "string" ? body.subject2.trim().slice(0, 80) : "";

  if (NEEDS_ONE.includes(action) && !subject) {
    return Response.json({ error: "serve una parola chiave" }, { status: 400 });
  }
  if (NEEDS_TWO.includes(action) && (!subject || !subject2)) {
    return Response.json({ error: "servono due parole chiave" }, { status: 400 });
  }

  try {
    const userCfg = await loadUserConfig(typeof body.sid === "string" ? body.sid : null);
    const result = await queryOracle(action, subject || undefined, subject2 || undefined, userCfg);
    return Response.json(result);
  } catch (err) {
    console.error("[oracolo] fallimento totale", err);
    return Response.json(
      { error: "L'Oracolo è in silenzio: il vortice delle fonti non risponde." },
      { status: 502 }
    );
  }
}
