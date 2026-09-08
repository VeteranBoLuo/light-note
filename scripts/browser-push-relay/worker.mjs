// Dedicated encrypted Web Push egress. No database, VAPID private key or notification plaintext.
const answer = (status, value) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
export async function handleRelay(request, env, send = fetch) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.RELAY_TOKEN || ""))
    return answer(503, { error: "NOT_CONFIGURED" });
  if (request.headers.get("authorization") !== `Bearer ${env.RELAY_TOKEN}`)
    return answer(401, { error: "UNAUTHORIZED" });
  if (request.method !== "POST" || new URL(request.url).pathname !== "/push")
    return answer(404, { error: "NOT_FOUND" });
  const reader = request.body?.getReader();
  if (!reader) return answer(400, { error: "INVALID_REQUEST" });
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) {
        await reader.cancel();
        return answer(413, { error: "TOO_LARGE" });
      }
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const input = JSON.parse(new TextDecoder().decode(data));
    const url = new URL(input.endpoint);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "fcm.googleapis.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      url.href.length > 2048
    )
      return answer(400, { error: "INVALID_ENDPOINT" });
    const supplied = new Headers(input.headers);
    const ttl = supplied.get("ttl");
    if (
      !/^\d{1,5}$/.test(ttl || "") ||
      Number(ttl) > 86400 ||
      supplied.get("content-encoding") !== "aes128gcm" ||
      !/^vapid t=/.test(supplied.get("authorization") || "")
    )
      return answer(400, { error: "INVALID_HEADERS" });
    if (
      typeof input.body !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.body)
    )
      return answer(400, { error: "INVALID_BODY" });
    const encrypted = Uint8Array.from(atob(input.body), (char) =>
      char.charCodeAt(0),
    );
    if (encrypted.length > 4096 || encrypted.length < 86)
      return answer(400, { error: "INVALID_BODY" });
    const headers = new Headers({
      authorization: supplied.get("authorization"),
      ttl,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      urgency: "normal",
    });
    try {
      const result = await send(url.href, {
        method: "POST",
        headers,
        body: encrypted,
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
      });
      await result.body?.cancel();
      return answer(200, { upstreamStatus: result.status });
    } catch {
      return answer(502, { error: "UPSTREAM_UNREACHABLE" });
    }
  } catch {
    return answer(400, { error: "INVALID_REQUEST" });
  }
}
export default { fetch: (request, env) => handleRelay(request, env) };
