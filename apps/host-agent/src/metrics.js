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
  const totalInodes = Number(stats.files || 0);
  const freeInodes = Number(stats.ffree || 0);
  const usedInodes = Math.max(0, totalInodes - freeInodes);
  return {
    mountPoint,
    totalBytes,
    usedBytes,
    freeBytes,
    percent: totalBytes > 0 ? percent((usedBytes / totalBytes) * 100) : null,
    totalInodes: totalInodes > 0 ? totalInodes : null,
    usedInodes: totalInodes > 0 ? usedInodes : null,
    freeInodes: totalInodes > 0 ? freeInodes : null,
    inodePercent:
      totalInodes > 0 ? percent((usedInodes / totalInodes) * 100) : null,
  };
}

const PHYSICAL_BLOCK_DEVICE =
  /^(?:sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+|dm-\d+)$/u;

async function readDiskIoTotals() {
  if (process.platform !== "linux") return null;
  const source = await fs.readFile("/proc/diskstats", "utf8");
  const totals = {
    readBytes: 0,
    writeBytes: 0,
    reads: 0,
    writes: 0,
    busyMs: 0,
    devices: 0,
  };
  for (const line of source.split("\n")) {
    const fields = line.trim().split(/\s+/u);
    const name = String(fields[2] || "");
    if (!PHYSICAL_BLOCK_DEVICE.test(name) || fields.length < 14) continue;
    const values = fields.slice(3).map(Number);
    if (values.slice(0, 10).some((value) => !Number.isFinite(value))) continue;
    totals.reads += values[0];
    totals.readBytes += values[2] * 512;
    totals.writes += values[4];
    totals.writeBytes += values[6] * 512;
    totals.busyMs += values[9];
    totals.devices += 1;
  }
  return totals.devices ? totals : null;
}

export class MetricSampler {
  constructor({
    mountPoint = "/",
    intervalMs = 3_000,
    maxSamples = 1_200,
  } = {}) {
    this.mountPoint = mountPoint;
    this.intervalMs = intervalMs;
    this.maxSamples = maxSamples;
    this.history = [];
    this.latest = null;
    this.previousCpu = null;
    this.previousNetwork = null;
    this.previousDiskIo = null;
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

    let diskIo = null;
    try {
      const totals = await readDiskIoTotals();
      if (totals) {
        const elapsedSeconds = this.previousDiskIo
          ? Math.max(
              0.001,
              (sampledAtMs - this.previousDiskIo.sampledAtMs) / 1000,
            )
          : null;
        const rate = (current, previous) =>
          elapsedSeconds == null
            ? null
            : Math.max(0, Math.round((current - previous) / elapsedSeconds));
        diskIo = {
          readBytesPerSecond: this.previousDiskIo
            ? rate(totals.readBytes, this.previousDiskIo.readBytes)
            : null,
          writeBytesPerSecond: this.previousDiskIo
            ? rate(totals.writeBytes, this.previousDiskIo.writeBytes)
            : null,
          readsPerSecond: this.previousDiskIo
            ? rate(totals.reads, this.previousDiskIo.reads)
            : null,
          writesPerSecond: this.previousDiskIo
            ? rate(totals.writes, this.previousDiskIo.writes)
            : null,
          busyPercent:
            elapsedSeconds == null || !this.previousDiskIo
              ? null
              : percent(
                  (Math.max(0, totals.busyMs - this.previousDiskIo.busyMs) /
                    (elapsedSeconds * 1000)) *
                    100,
                ),
        };
        this.previousDiskIo = { ...totals, sampledAtMs };
      }
    } catch (error) {
      collectionErrors.push({
        source: "disk-io",
        code: String(error?.code || "DISK_IO_READ_FAILED"),
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
      diskReadBytesPerSecond: diskIo?.readBytesPerSecond ?? null,
      diskWriteBytesPerSecond: diskIo?.writeBytesPerSecond ?? null,
      diskReadsPerSecond: diskIo?.readsPerSecond ?? null,
      diskWritesPerSecond: diskIo?.writesPerSecond ?? null,
      diskIoBusyPercent: diskIo?.busyPercent ?? null,
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
      diskIo,
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
