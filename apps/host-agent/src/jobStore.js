import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const JOB_FILE_PATTERN = /^[a-zA-Z0-9._:-]{16,128}\.json$/u;

export class PersistentJobStore {
  constructor({ stateDir, ttlMs }) {
    this.stateDir = stateDir;
    this.ttlMs = ttlMs;
    this.memory = new Map();
    this.inFlight = new Map();
    this.ready = false;
  }

  async init() {
    await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await fs.chmod(this.stateDir, 0o700);
    this.ready = true;
    await this.cleanup();
  }

  filePath(jobId) {
    return path.join(this.stateDir, `${jobId}.json`);
  }

  async read(jobId) {
    if (!this.ready)
      throw Object.assign(new Error("Job store is unavailable"), {
        code: "HOST_AGENT_JOB_STORE_UNAVAILABLE",
      });
    const cached = this.memory.get(jobId);
    if (
      cached?.state === "unknown" ||
      (cached && Date.parse(cached.expiresAt) > Date.now())
    )
      return cached;
    this.memory.delete(jobId);
    try {
      const value = JSON.parse(await fs.readFile(this.filePath(jobId), "utf8"));
      if (
        value?.jobId === jobId &&
        (value.state === "unknown" || Date.parse(value.expiresAt) > Date.now())
      ) {
        this.memory.set(jobId, value);
        return value;
      }
      if (value?.jobId === jobId && Date.parse(value.expiresAt) <= Date.now()) {
        await fs.unlink(this.filePath(jobId)).catch((error) => {
          if (error?.code !== "ENOENT") throw error;
        });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return null;
  }

  async write(jobId, result) {
    const receipt = {
      jobId,
      ...result,
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
    };
    const target = this.filePath(jobId);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(receipt), {
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(temporary, target);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    this.memory.set(jobId, receipt);
    return receipt;
  }

  async reserve(jobId, pendingResult = {}) {
    const receipt = {
      jobId,
      state: "unknown",
      exitCode: null,
      durationMs: 0,
      summary:
        "Execution result is unknown; manual inspection may be required.",
      startedAt: new Date().toISOString(),
      completedAt: null,
      ...pendingResult,
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
    };
    const target = this.filePath(jobId);
    const temporary = `${target}.${process.pid}.${randomUUID()}.reserve`;
    try {
      await fs.writeFile(temporary, JSON.stringify(receipt), {
        mode: 0o600,
        flag: "wx",
      });
      try {
        // 先以硬链接原子占位。占位成功后才允许执行命令，进程崩溃也不会让同一 jobId 自动重放。
        await fs.link(temporary, target);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const existing = await this.read(jobId);
        if (!existing)
          throw Object.assign(new Error("Job reservation is unavailable"), {
            code: "HOST_AGENT_JOB_STORE_UNAVAILABLE",
          });
        return { receipt: existing, reserved: false };
      }
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    this.memory.set(jobId, receipt);
    return { receipt, reserved: true };
  }

  execute(jobId, handler, pendingResult = {}) {
    if (this.inFlight.has(jobId)) return this.inFlight.get(jobId);
    const task = (async () => {
      const existing = await this.read(jobId);
      if (existing) return { receipt: existing, replayed: true };
      const reservation = await this.reserve(jobId, pendingResult);
      if (!reservation.reserved)
        return { receipt: reservation.receipt, replayed: true };
      const result = await handler();
      const receipt = await this.write(jobId, result);
      return { receipt, replayed: false };
    })().finally(() => this.inFlight.delete(jobId));
    this.inFlight.set(jobId, task);
    return task;
  }

  async cleanup() {
    if (!this.ready) return;
    const entries = await fs.readdir(this.stateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !JOB_FILE_PATTERN.test(entry.name)) continue;
      const target = path.join(this.stateDir, entry.name);
      try {
        const value = JSON.parse(await fs.readFile(target, "utf8"));
        if (
          value?.state !== "unknown" &&
          Date.parse(value?.expiresAt) <= Date.now()
        )
          await fs.unlink(target);
      } catch {
        // 无法解析的回执可能对应已执行的动作；必须保留并失败关闭，禁止清理后自动重放。
      }
    }
  }
}
