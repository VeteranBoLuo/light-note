import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requestPrivilegedHelper } from "./helperClient.js";

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function createHelperServer(response) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lightnote-helper-"));
  const socketPath = path.join(directory, "helper.sock");
  const requests = [];
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      socket.end(JSON.stringify(response));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  cleanups.push(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { socketPath, requests };
}

describe("requestPrivilegedHelper", () => {
  it("只向 Unix Socket 发送固定 action 与 targetId 并校验返回结构", async () => {
    const fixture = await createHelperServer({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    await expect(
      requestPrivilegedHelper(
        fixture.socketPath,
        "pm2-restart",
        "lightnote-document-worker",
      ),
    ).resolves.toEqual({ exitCode: 0, stdout: "ok", stderr: "" });
    expect(fixture.requests).toEqual([
      {
        action: "pm2-restart",
        targetId: "lightnote-document-worker",
      },
    ]);
  });

  it("helper 不可用或响应结构异常时失败关闭", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lightnote-helper-"));
    cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
    await expect(
      requestPrivilegedHelper(
        path.join(directory, "missing.sock"),
        "capabilities",
      ),
    ).rejects.toMatchObject({ code: "HOST_HELPER_UNAVAILABLE" });

    const fixture = await createHelperServer({ ok: true });
    await expect(
      requestPrivilegedHelper(fixture.socketPath, "capabilities"),
    ).rejects.toMatchObject({ code: "HOST_HELPER_RESPONSE_INVALID" });
  });
});
