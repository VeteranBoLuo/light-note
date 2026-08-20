import fs from "node:fs/promises";
import os from "node:os";

function percent(value) {
  return Number.isFinite(value)
    ? Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
    : null;
}

function cpuTotals() {
  return os.cpus().reduce(
    (total, cpu) => {
      const times = cpu.times || {};
      const all = Object.values(times).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      );
      return {
        total: total.total + all,
        idle: total.idle + Number(times.idle || 0),
      };
    },
    { total: 0, idle: 0 },
  );
}

async function readNetworkTotals() {
  if (process.platform !== "linux") return null;
  const source = await fs.readFile("/proc/net/dev", "utf8");
  let rxBytes = 0;
  let txBytes = 0;
  for (const line of source.split("\n").slice(2)) {
    const [namePart, valuesPart] = line.split(":");
    const name = String(namePart || "").trim();
    if (!name || name === "lo") continue;
    const fields = String(valuesPart || "")
      .trim()
      .split(/\s+/u)
      .map(Number);
    if (fields.length < 16 || fields.some((value) => !Number.isFinite(value)))
      continue;
    rxBytes += fields[0];
    txBytes += fields[8];
  }
  return { rxBytes, txBytes };
}

async function readDisk(mountPoint) {
  const stats = await fs.statfs(mountPoint);
  const blockSize = Number(stats.bsize || 0);
  const totalBytes = Number(stats.blocks || 0) * blockSize;
  const freeBytes = Number(stats.bavail || 0) * blockSize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return {
    mountPoint,
    totalBytes,
    usedBytes,
    freeBytes,
    percent: totalBytes > 0 ? percent((usedBytes / totalBytes) * 100) : null,
  };
}

export class MetricSampler {
  constructor({
    mountPoint = "/",
    intervalMs = 10_000,
    maxSamples = 360,
  } = {}) {
    this.mountPoint = mountPoint;
    this.intervalMs = intervalMs;
    this.maxSamples = maxSamples;
    this.history = [];
    this.latest = null;
    this.previousCpu = null;
    this.previousNetwork = null;
    this.timer = null;
    this.collecting = null;
  }

  async sample() {
    if (this.collecting) return this.collecting;
    this.collecting = this.#collect().finally(() => {
      this.collecting = null;
    });
    return this.collecting;
  }

  async #collect() {
    const sampledAtMs = Date.now();
    const sampledAt = new Date(sampledAtMs).toISOString();
    const collectionErrors = [];
    const currentCpu = cpuTotals();
    const cpuDelta = this.previousCpu
      ? {
          total: currentCpu.total - this.previousCpu.total,
          idle: currentCpu.idle - this.previousCpu.idle,
        }
      : null;
    this.previousCpu = currentCpu;
    const cpuPercent =
      cpuDelta?.total > 0
        ? percent((1 - cpuDelta.idle / cpuDelta.total) * 100)
        : null;

    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
    const memoryPercent =
      totalMemoryBytes > 0
        ? percent((usedMemoryBytes / totalMemoryBytes) * 100)
        : null;

    let disk = null;
    try {
      disk = await readDisk(this.mountPoint);
    } catch (error) {
      collectionErrors.push({
        source: "disk",
        code: String(error?.code || "DISK_READ_FAILED"),
      });
    }

    let network = null;
    try {
      const totals = await readNetworkTotals();
      if (totals) {
        const elapsedSeconds = this.previousNetwork
          ? Math.max(
              0.001,
              (sampledAtMs - this.previousNetwork.sampledAtMs) / 1000,
            )
          : null;
        network = {
          rxBytes: totals.rxBytes,
          txBytes: totals.txBytes,
          rxBytesPerSecond:
            elapsedSeconds == null
              ? null
              : Math.max(
                  0,
                  Math.round(
                    (totals.rxBytes - this.previousNetwork.rxBytes) /
                      elapsedSeconds,
                  ),
                ),
          txBytesPerSecond:
            elapsedSeconds == null
              ? null
              : Math.max(
                  0,
                  Math.round(
                    (totals.txBytes - this.previousNetwork.txBytes) /
                      elapsedSeconds,
                  ),
                ),
        };
        this.previousNetwork = { ...totals, sampledAtMs };
      }
    } catch (error) {
      collectionErrors.push({
        source: "network",
        code: String(error?.code || "NETWORK_READ_FAILED"),
      });
    }

    const loadAverage = os.loadavg();
    const point = {
      sampledAt,
      cpuPercent,
      memoryPercent,
      diskPercent: disk?.percent ?? null,
      load1: Number.isFinite(loadAverage[0])
        ? Math.round(loadAverage[0] * 100) / 100
        : null,
      networkRxBytesPerSecond: network?.rxBytesPerSecond ?? null,
      networkTxBytesPerSecond: network?.txBytesPerSecond ?? null,
    };
    this.latest = {
      sampledAt,
      cpu: { percent: cpuPercent, cores: os.cpus().length, loadAverage },
      memory: {
        totalBytes: totalMemoryBytes,
        usedBytes: usedMemoryBytes,
        freeBytes: freeMemoryBytes,
        percent: memoryPercent,
      },
      disk,
      network,
      uptimeSeconds: Math.floor(os.uptime()),
      collectionErrors,
    };
    this.history.push(point);
    if (this.history.length > this.maxSamples)
      this.history.splice(0, this.history.length - this.maxSamples);
    return this.latest;
  }

  start() {
    if (this.timer) return;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot() {
    return {
      latest: this.latest,
      history: this.history.map((point) => ({ ...point })),
    };
  }
}

export function hostIdentity() {
  const cpu = os.cpus()[0];
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: String(cpu?.model || "unknown").trim(),
    cpuCores: os.cpus().length,
  };
}
