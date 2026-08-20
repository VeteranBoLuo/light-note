import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentJobStore } from "./jobStore.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("PersistentJobStore", () => {
  it("并发和进程内重试只执行一次，并把权威回执落到受限目录", async () => {
    const stateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lightnote-host-jobs-"),
    );
    temporaryDirectories.push(stateDir);
    const store = new PersistentJobStore({ stateDir, ttlMs: 60_000 });
    await store.init();
    const handler = vi.fn(async () => ({
      state: "succeeded",
      completedAt: new Date().toISOString(),
    }));

    const [first, second] = await Promise.all([
      store.execute("0123456789abcdef", handler),
      store.execute("0123456789abcdef", handler),
    ]);
    const replay = await store.execute("0123456789abcdef", handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.receipt).toEqual(second.receipt);
    expect(replay.replayed).toBe(true);
    expect((await fs.stat(stateDir)).mode & 0o777).toBe(0o700);
  });

  it("执行结果不确定时保留占位回执，新进程不会重复执行", async () => {
    const stateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lightnote-host-jobs-"),
    );
    temporaryDirectories.push(stateDir);
    const firstStore = new PersistentJobStore({ stateDir, ttlMs: 60_000 });
    await firstStore.init();
    const uncertainHandler = vi.fn(async () => {
      throw Object.assign(new Error("connection lost after spawn"), {
        code: "HOST_AGENT_COMMAND_TIMEOUT",
      });
    });

    await expect(
      firstStore.execute("fedcba9876543210", uncertainHandler, {
        action: "service.restart",
        targetId: "lightnote-document-worker",
      }),
    ).rejects.toMatchObject({ code: "HOST_AGENT_COMMAND_TIMEOUT" });

    const restartedStore = new PersistentJobStore({ stateDir, ttlMs: 60_000 });
    await restartedStore.init();
    const retryHandler = vi.fn(async () => ({ state: "succeeded" }));
    const replay = await restartedStore.execute(
      "fedcba9876543210",
      retryHandler,
    );

    expect(retryHandler).not.toHaveBeenCalled();
    expect(replay).toMatchObject({
      replayed: true,
      receipt: { state: "unknown" },
    });
    expect(
      (await fs.stat(path.join(stateDir, "fedcba9876543210.json"))).mode &
        0o777,
    ).toBe(0o600);
  });

  it("无法解析的回执失败关闭，启动清理不会删除后重放", async () => {
    const stateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lightnote-host-jobs-"),
    );
    temporaryDirectories.push(stateDir);
    const jobId = "badreceipt123456";
    const receiptPath = path.join(stateDir, `${jobId}.json`);
    await fs.writeFile(receiptPath, "{incomplete", { mode: 0o600 });
    const store = new PersistentJobStore({ stateDir, ttlMs: 60_000 });
    await store.init();
    const handler = vi.fn(async () => ({ state: "succeeded" }));

    await expect(store.execute(jobId, handler)).rejects.toBeInstanceOf(
      SyntaxError,
    );
    expect(handler).not.toHaveBeenCalled();
    await expect(fs.stat(receiptPath)).resolves.toBeTruthy();
  });
});
