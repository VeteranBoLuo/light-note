import { spawn } from "node:child_process";
import path from "node:path";

export class CommandExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CommandExecutionError";
    this.code = code;
    Object.assign(this, details);
  }
}

export function safeCommandEnvironment(overrides = {}) {
  return {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    ...overrides,
  };
}

export function runCommand(
  file,
  args = [],
  {
    timeoutMs = 5000,
    maxOutputBytes = 128 * 1024,
    env = safeCommandEnvironment(),
  } = {},
) {
  if (
    !path.isAbsolute(file) ||
    !Array.isArray(args) ||
    args.some((arg) => typeof arg !== "string")
  ) {
    return Promise.reject(
      new CommandExecutionError(
        "HOST_AGENT_COMMAND_INVALID",
        "Command definition is invalid",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let outputBytes = 0;
    const stdout = [];
    const stderr = [];
    const child = spawn(file, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    const finish = (handler) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler();
    };
    const collect = (bucket, chunk) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(() =>
          reject(
            new CommandExecutionError(
              "HOST_AGENT_OUTPUT_LIMIT",
              "Command output exceeded the configured limit",
            ),
          ),
        );
        return;
      }
      bucket.push(chunk);
    };
    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", (error) =>
      finish(() =>
        reject(
          new CommandExecutionError(
            "HOST_AGENT_COMMAND_UNAVAILABLE",
            "Command could not be started",
            {
              causeCode: String(error?.code || "UNKNOWN"),
            },
          ),
        ),
      ),
    );
    child.on("close", (exitCode, signal) =>
      finish(() =>
        resolve({
          exitCode: Number.isInteger(exitCode) ? exitCode : null,
          signal: signal || null,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      ),
    );
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(
          new CommandExecutionError(
            "HOST_AGENT_COMMAND_TIMEOUT",
            "Command timed out",
          ),
        ),
      );
    }, timeoutMs);
    timer.unref?.();
  });
}
