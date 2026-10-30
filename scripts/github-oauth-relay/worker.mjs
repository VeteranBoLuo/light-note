// Dedicated GitHub OAuth egress. No storage, cookies, arbitrary destinations or automatic retries.
const answer = (status, data) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

async function limitedText(stream, limit) {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(bytes);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handleGitHubRelay(request, env, send = fetch) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.RELAY_TOKEN || ""))
    return answer(503, { error: "NOT_CONFIGURED" });
  if (request.headers.get("authorization") !== `Bearer ${env.RELAY_TOKEN}`)
    return answer(401, { error: "UNAUTHORIZED" });
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/github" || url.search)
    return answer(404, { error: "NOT_FOUND" });
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    return answer(400, { error: "INVALID_REQUEST" });
  }

  let input;
  try {
    input = JSON.parse(await limitedText(request.body, 16 * 1024));
  } catch {
    return answer(400, { error: "INVALID_REQUEST" });
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return answer(400, { error: "INVALID_REQUEST" });

  const headers = {
    Accept: "application/json",
    "User-Agent": "light-note-oauth-relay",
  };
  const init = {
    method: "POST",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(7000),
  };
  let target = "https://github.com/login/oauth/access_token";
  if (input.operation === "probe") {
    if (Object.keys(input).length !== 1)
      return answer(400, { error: "INVALID_REQUEST" });
    init.body = "client_id=light-note-connectivity-check";
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (input.operation === "token") {
    if (
      Object.keys(input).some((key) => !["operation", "body"].includes(key)) ||
      typeof input.body !== "string" ||
      !input.body ||
      input.body.length > 12 * 1024
    ) {
      return answer(400, { error: "INVALID_REQUEST" });
    }
    const params = new URLSearchParams(input.body);
    const allowed = [
      "client_id",
      "client_secret",
      "code",
      "redirect_uri",
      "code_verifier",
    ];
    if (
      [...params.keys()].some((key) => !allowed.includes(key)) ||
      allowed.some((key) => params.getAll(key).length !== 1 || !params.get(key))
    ) {
      return answer(400, { error: "INVALID_REQUEST" });
    }
    init.body = input.body;
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (input.operation === "user" || input.operation === "emails") {
    if (
      Object.keys(input).some(
        (key) => !["operation", "accessToken"].includes(key),
      ) ||
      typeof input.accessToken !== "string" ||
      !/^[A-Za-z0-9_.-]{1,4096}$/.test(input.accessToken)
    ) {
      return answer(400, { error: "INVALID_REQUEST" });
    }
    target = `https://api.github.com${input.operation === "user" ? "/user" : "/user/emails"}`;
    init.method = "GET";
    headers.Authorization = `Bearer ${input.accessToken}`;
    headers.Accept = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
  } else return answer(400, { error: "INVALID_REQUEST" });

  try {
    const response = await send(target, init);
    const body = await limitedText(response.body, 64 * 1024);
    const forwarded = {};
    for (const key of ["retry-after", "x-ratelimit-remaining"]) {
      const value = response.headers.get(key);
      if (value && /^\d{1,12}$/.test(value)) forwarded[key] = value;
    }
    return answer(200, { status: response.status, headers: forwarded, body });
  } catch {
    // A token POST may have reached GitHub. The caller must start a new authorization, never replay it.
    return answer(502, { error: "UPSTREAM_UNREACHABLE" });
  }
}

export default { fetch: (request, env) => handleGitHubRelay(request, env) };
