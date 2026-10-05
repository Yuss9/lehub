export function sameOrigin(request: Request) {
  const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  return request.headers.get("origin") === expected;
}
export async function boundedJson(request: Request, limit = 65536) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Requête vide.");
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Requête trop grande.");
    }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
