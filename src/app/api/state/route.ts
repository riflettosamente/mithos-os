import { db } from "@/db";
import { ensureMythosSchema } from "@/db/ensure-schema";
import { mythEntities, mythPages, mythRelations, mythSessions } from "@/db/schema";
import type { BoardEntity, EntityRef, MythPage, PersistedState, QueryActionKey, RelationEdge } from "@/lib/types";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sidFrom(req: Request): string | null {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid");
  return sid && /^[\w-]{8,64}$/.test(sid) ? sid : null;
}

async function loadState(sid: string): Promise<PersistedState | null> {
  await ensureMythosSchema();
  const [session] = await db.select().from(mythSessions).where(eq(mythSessions.id, sid)).limit(1);
  if (!session) return null;
  const ents = await db.select().from(mythEntities).where(eq(mythEntities.sessionId, sid));
  const rels = await db.select().from(mythRelations).where(eq(mythRelations.sessionId, sid));
  const pages = await db.select().from(mythPages).where(eq(mythPages.sessionId, sid)).orderBy(mythPages.idx);

  const entities: BoardEntity[] = ents.map((e) => ({ name: e.name, kind: e.kind as BoardEntity["kind"], x: e.x, y: e.y }));
  const relations: RelationEdge[] = rels.map((r) => ({ from: r.fromName, to: r.toName, label: r.label }));
  const loadedPages: MythPage[] = pages.map((p) => {
    let entities: EntityRef[] = [];
    let relations: RelationEdge[] = [];
    try { entities = JSON.parse(p.entitiesJson) as EntityRef[]; } catch { /* noop */ }
    try { relations = JSON.parse(p.relationsJson) as RelationEdge[]; } catch { /* noop */ }
    return {
      id: `p${p.idx}`,
      action: p.action as QueryActionKey,
      subject: p.subject ?? undefined,
      subject2: p.subject2 ?? undefined,
      title: p.title,
      raw: p.body,
      entities,
      relations,
      engine: p.engine,
      at: p.at,
    };
  });
  return { entities, relations, pages: loadedPages, idx: Math.max(0, loadedPages.length - 1) };
}

export async function GET(req: Request) {
  const sid = sidFrom(req);
  if (!sid) return Response.json({ error: "sid mancante" }, { status: 400 });
  try {
    const state = await loadState(sid);
    if (!state) return Response.json({ exists: false });
    return Response.json({ exists: true, state });
  } catch (err) {
    console.error("[state] GET fallita", err);
    return Response.json({ exists: false, error: "db non disponibile" }, { status: 200 });
  }
}

interface PutBody {
  entities?: BoardEntity[];
  relations?: RelationEdge[];
  pages?: MythPage[];
}

export async function PUT(req: Request) {
  const sid = sidFrom(req);
  if (!sid) return Response.json({ error: "sid mancante" }, { status: 400 });

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return Response.json({ error: "payload non valido" }, { status: 400 });
  }

  const entities = (body.entities ?? []).slice(0, 400);
  const relations = (body.relations ?? []).slice(0, 600);
  const pages = (body.pages ?? []).slice(0, 90);

  try {
    await ensureMythosSchema();
    await db.transaction(async (tx) => {
      await tx
        .insert(mythSessions)
        .values({ id: sid })
        .onConflictDoUpdate({ target: mythSessions.id, set: { updatedAt: new Date() } });
      await tx.delete(mythEntities).where(eq(mythEntities.sessionId, sid));
      await tx.delete(mythRelations).where(eq(mythRelations.sessionId, sid));
      await tx.delete(mythPages).where(eq(mythPages.sessionId, sid));

      if (entities.length) {
        await tx.insert(mythEntities).values(
          entities.map((e) => ({ sessionId: sid, name: e.name, kind: e.kind, x: e.x, y: e.y }))
        );
      }
      if (relations.length) {
        await tx.insert(mythRelations).values(
          relations.map((r) => ({ sessionId: sid, fromName: r.from, toName: r.to, label: r.label }))
        );
      }
      if (pages.length) {
        await tx.insert(mythPages).values(
          pages.map((p, i) => ({
            sessionId: sid,
            idx: i,
            action: p.action,
            subject: p.subject ?? null,
            subject2: p.subject2 ?? null,
            title: p.title.slice(0, 200),
            body: p.raw,
            engine: p.engine.slice(0, 80),
            at: Math.floor(p.at ?? 0),
            entitiesJson: JSON.stringify(p.entities),
            relationsJson: JSON.stringify(p.relations),
          }))
        );
      }
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[state] PUT fallita", err);
    return Response.json({ ok: false, error: "salvataggio fallito" }, { status: 200 });
  }
}

export async function DELETE(req: Request) {
  const sid = sidFrom(req);
  if (!sid) return Response.json({ error: "sid mancante" }, { status: 400 });
  try {
    await ensureMythosSchema();
    // Conserva myth_sessions e quindi la chiave LLM della sessione.
    await db.transaction(async (tx) => {
      await tx.delete(mythEntities).where(eq(mythEntities.sessionId, sid));
      await tx.delete(mythRelations).where(eq(mythRelations.sessionId, sid));
      await tx.delete(mythPages).where(eq(mythPages.sessionId, sid));
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[state] DELETE fallita", err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
