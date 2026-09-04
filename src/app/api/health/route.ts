import { db } from "@/db";
import { ensureMythosSchema } from "@/db/ensure-schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureMythosSchema();
    return Response.json({ ok: true, database: "ready", schema: "ready" });
  } catch (error) {
    console.error("[health] database/schema non disponibile", error);
    return Response.json({ ok: false, database: "error", schema: "error" }, { status: 500 });
  }
}
