import net from "node:net";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_REQUEST_BYTES = 1024;

function helperError(code, message) {
  return Object.assign(new Error(message), { code });
}

function normalizeResponse(source) {
  let payload;
  try {
    payload = JSON.parse(source || "{}");
  } catch {
    throw helperError(
      "HOST_HELPER_RESPONSE_INVALID",
      "Privileged helper returned invalid JSON",
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Number.isInteger(payload.exitCode) ||
    typeof payload.stdout !== "string" ||
    typeof payload.stderr !== "string"
  ) {
    throw helperError(
      "HOST_HELPER_RESPONSE_INVALID",
      "Privileged helper returned an invalid response",
    );
  }
  return {
    exitCode: payload.exitCode,
    stdout: payload.stdout,
    stderr: payload.stderr,
  };
}

export function requestPrivilegedHelper(
  socketPath,
  action,
  targetId,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  } = {},
) {
  const request = JSON.stringify({
    action,
    ...(targetId === undefined ? {} : { targetId }),
  });
  if (Buffer.byteLength(request) > MAX_REQUEST_BYTES) {
    return Promise.reject(
      helperError(
        "HOST_HELPER_REQUEST_TOO_LARGE",
        "Helper request is too large",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    const chunks = [];
    let bytes = 0;
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => socket.end(`${request}\n`));
    socket.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        finish(() =>
          reject(
            helperError(
              "HOST_HELPER_RESPONSE_TOO_LARGE",
              "Privileged helper response is too large",
            ),
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    socket.once("timeout", () =>
      finish(() =>
        reject(
          helperError("HOST_HELPER_TIMEOUT", "Privileged helper timed out"),
        ),
      ),
    );
    socket.once("error", () =>
      finish(() =>
        reject(
          helperError(
            "HOST_HELPER_UNAVAILABLE",
            "Privileged helper is unavailable",
          ),
        ),
      ),
    );
    socket.once("end", () =>
      finish(() => {
        try {
          resolve(normalizeResponse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      }),
    );
  });
}

async function runCli() {
  const [action, targetId, extra] = process.argv.slice(2);
  if (!action || extra !== undefined) process.exitCode = 64;
  else {
    try {
      const result = await requestPrivilegedHelper(
        process.env.HOST_AGENT_PRIVILEGED_HELPER_SOCKET ||
          "/run/lightnote-host-helper.sock",
        action,
        targetId,
      );
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exitCode = result.exitCode;
    } catch (error) {
      process.stderr.write(`${error?.code || "HOST_HELPER_UNAVAILABLE"}\n`);
      process.exitCode = 1;
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runCli();
}
