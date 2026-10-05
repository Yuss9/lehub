import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { workerState } from "@/db/schema";
import { workerHealth } from "@/lib/operations-health";
export async function GET(request: Request) {
  const expected = process.env.OPERATIONS_HEALTH_TOKEN || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return new Response(null, { status: 401 });
  try {
    const rows = await db.select().from(workerState);
    const required = ["worker", ...(process.env.MONITOR_BACKUPS === "true" ? ["backup"] : []), ...(process.env.BACKUP_REMOTE ? ["backup-offsite"] : [])];
    const healthy = required.every((id) => { const w = rows.find((r) => r.id === id); return w && workerHealth(w) === "ok"; });
    return Response.json({ status: healthy ? "ok" : "unavailable" }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
