// Shared by Settings and the independent monitor, using the actual persisted schedule.
export function workerHealth(worker: { id: string; intervalSeconds: number; heartbeatAt: Date; completedAt: Date | null; lastError: string }, now = new Date()): "ok" | "error" | "stale" {
  if (worker.lastError) return "error";
  const grace = 1800;
  const interval = Math.max(60, worker.intervalSeconds) * 1000;
  const heartbeatLimit = worker.id.startsWith("backup") ? interval + grace * 1000 : 120000;
  if (now.getTime() - worker.heartbeatAt.getTime() > heartbeatLimit) return "stale";
  if (worker.completedAt && now.getTime() - worker.completedAt.getTime() > interval + grace * 1000) return "stale";
  return "ok";
}
