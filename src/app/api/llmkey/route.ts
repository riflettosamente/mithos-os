import { db } from "@/db";
import { databaseErrorMessage, ensureMythosSchema } from "@/db/ensure-schema";
import { mythSessions } from "@/db/schema";
import { envConfiguredKinds, LLM_KINDS } from "@/lib/llm";
import type { LlmKind } from "@/lib/llm";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sidFrom(req: Request): string | null {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid");
  return sid && /^[\w-]{8,64}$/.test(sid) ? sid : null;
}

function mask(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-3)}`;
}

export async function GET(req: Request) {
  const sid = sidFrom(req);
  if (!sid) return Response.json({ error: "sid mancante" }, { status: 400 });
  try {
    await ensureMythosSchema();
    const [row] = await db.select().from(mythSessions).where(eq(mythSessions.id, sid)).limit(1);
    return Response.json({
      env: envConfiguredKinds(),
      session: row?.llmKey && row.llmProvider
        ? {
            provider: row.llmProvider as LlmKind,
            keyMask: mask(row.llmKey),
            model: row.llmModel ?? "",
            url: row.llmUrl ?? "",
          }
        : null,
    });
  } catch (err) {
    console.error("[llmkey] GET fallita", err);
    return Response.json(
      { env: envConfiguredKinds(), session: null, error: databaseErrorMessage(err) },
      { status: 503 }
    );
  }
}

interface PostBody {
  provider?: unknown;
  key?: unknown;
  model?: unknown;
  url?: unknown;
}

export async function POST(req: Request) {
  const sid = sidFrom(req);
  if (!sid) return Response.json({ error: "sid mancante" }, { status: 400 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return Response.json({ error: "payload non valido" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 300) : "";

  if (!(LLM_KINDS as string[]).includes(provider)) {
    return Response.json({ error: "provider sconosciuto" }, { status: 400 });
  }
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) {
    return Response.json({ error: "chiave non valida (8-300 caratteri, senza spazi)" }, { status: 400 });
  }

  const knownProvider = /^sk-or-/i.test(key)
    ? "openrouter"
    : /^sk-ant-/i.test(key)
      ? "anthropic"
      : /^pplx-/i.test(key)
        ? "perplexity"
        : /^AIza/i.test(key)
          ? "gemini"
          : /^sk-(?:proj-|svcacct-|admin-)/i.test(key)
            ? "openai"
            : null;
  if (knownProvider && provider !== knownProvider) {
    return Response.json(
      { error: `Questa chiave appartiene a ${knownProvider.toUpperCase()}, ma hai selezionato ${provider.toUpperCase()}.` },
      { status: 400 }
    );
  }

  if (provider === "custom" && !/^https:\/\//.test(url)) {
    return Response.json({ error: "per l'endpoint personalizzato serve una URL https valida" }, { status: 400 });
  }

  try {
    await ensureMythosSchema();
    await db
      .insert(mythSessions)
      .values({
        id: sid,
        llmProvider: provider,
        llmKey: key,
        llmModel: model || null,
        llmUrl: url || null,
      })
      .onConflictDoUpdate({
        target: mythSessions.id,
        set: {
          llmProvider: provider,
          llmKey: key,
          llmModel: model || null,
          llmUrl: url || null,
          updatedAt: new Date(),
        },
      });
    return Response.json({ ok: true, keyMask: mask(key) });
  } catch (err) {
    console.error("[llmkey] POST fallita", err);
    return Response.json({ error: databaseErrorMessage(err) }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const sid = sidFrom(req);
  if (!sid) return Response.json({ error: "sid mancante" }, { status: 400 });
  try {
    await ensureMythosSchema();
    await db
      .insert(mythSessions)
      .values({ id: sid })
      .onConflictDoUpdate({
        target: mythSessions.id,
        set: { llmProvider: null, llmKey: null, llmModel: null, llmUrl: null, updatedAt: new Date() },
      });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[llmkey] DELETE fallita", err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
