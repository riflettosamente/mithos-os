import { db } from "@/db";
import { ensureMythosSchema } from "@/db/ensure-schema";
import { mythSessions } from "@/db/schema";
import { queryOracle, envConfiguredKinds } from "@/lib/llm";
import type { LlmKind, UserLlmConfig } from "@/lib/llm";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function sidFrom(req: Request): string | null {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid");
  return sid && /^[\w-]{8,64}$/.test(sid) ? sid : null;
}

interface Body {
  provider?: unknown;
  key?: unknown;
  model?: unknown;
  url?: unknown;
}

const PROVIDERS: LlmKind[] = ["perplexity", "anthropic", "openai", "gemini", "openrouter", "custom"];

/**
 * Diagnostica sicura: prova la configurazione senza salvarla.
 * Restituisce solo esito/esempio ripulito; mai la chiave.
 */
export async function POST(req: Request) {
  const sid = sidFrom(req);

  let body: Body;
  try { body = (await req.json()) as Body; } catch { body = {}; }
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 300) : "";

  const report: Record<string, unknown> = {
    env: envConfiguredKinds(),
    test: null as null | Record<string, unknown>,
  };

  let cfg: UserLlmConfig | null = null;

  if (provider && key) {
    if (!PROVIDERS.includes(provider as LlmKind)) {
      return Response.json({ error: "Provider sconosciuto" }, { status: 400 });
    }
    cfg = {
      provider: provider as LlmKind,
      key,
      model: model || undefined,
      url: url || undefined,
    };
    report.source = "form";
  } else if (sid) {
    try {
      await ensureMythosSchema();
      const [row] = await db.select().from(mythSessions).where(eq(mythSessions.id, sid)).limit(1);
      if (row?.llmKey && row.llmProvider) {
        cfg = {
          provider: row.llmProvider as LlmKind,
          key: row.llmKey,
          model: row.llmModel ?? undefined,
          url: row.llmUrl ?? undefined,
        };
        report.source = "database";
        report.saved = { provider: row.llmProvider, model: row.llmModel ?? "" };
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
    return Response.json({
      ...report,
      test: {
        ok: false,
        reason: "Nessuna API key disponibile dal form, dalla sessione o dalle variabili d'ambiente.",
      },
    });
  }

  // Domanda minima: evita testi lunghi e diagnose i problemi prima della produzione.
  const result = await queryOracle("anecdote", "Atena", undefined, cfg, false);
  return Response.json({
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
