#!/usr/bin/node
import { spawnSync } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
} from "node:fs";

const PM2_BIN = "/usr/bin/pm2";
const NSENTER_BIN = "/usr/bin/nsenter";
const SYSTEMCTL_BIN = "/usr/bin/systemctl";
const JOURNALCTL_BIN = "/usr/bin/journalctl";
const STAT_BIN = "/usr/bin/stat";
const TAIL_BIN = "/usr/bin/tail";
const NGINX_BIN = "/usr/sbin/nginx";
const SSHD_BIN = "/usr/sbin/sshd";
const FIREWALL_CMD_BIN = "/usr/bin/firewall-cmd";
const APT_BIN = "/usr/bin/apt";
// helper 沙箱只允许 AF_UNIX，ufw/iptables 无法读取运行时规则；改读 ufw 自身持久化的配置与规则。
const UFW_CONFIG = "/etc/ufw/ufw.conf";
const UFW_DEFAULTS = "/etc/default/ufw";
const UFW_RULE_FILES = Object.freeze([
  ["/etc/ufw/user.rules", "ipv4"],
  ["/etc/ufw/user6.rules", "ipv6"],
]);
const UFW_POLICIES = Object.freeze({
  ACCEPT: "allow",
  DROP: "deny",
  REJECT: "reject",
});
// 每日数据库备份（运维脚本 /usr/local/lib/lightnote-ops/backup-database.mjs）的固定产物位置；
// 只有通过校验的备份才会改名为 tag_db-*.sql.gz，所以最新文件即最近一次成功备份。
const DB_BACKUP_DIR = "/www/backup/mysql-daily";
const DB_BACKUP_STATUS_FILE = `${DB_BACKUP_DIR}/last-run.json`;
const DB_BACKUP_FILE_PATTERN = /^tag_db-\d{8}-\d{6}\.sql\.gz$/u;
const PANEL_NGINX_BIN = "/www/server/nginx/sbin/nginx";
const PANEL_NGINX_CONFIG = "/www/server/nginx/conf/nginx.conf";
const PANEL_NGINX_PID = "/www/server/nginx/logs/nginx.pid";
const PANEL_NGINX_LOG_DIR = "/www/wwwlogs";
const PANEL_REDIS_BIN = "/www/server/redis/src/redis-server";
const PANEL_REDIS_PID = "/www/server/redis/redis.pid";
const PANEL_REDIS_LOG = "/www/server/redis/redis.log";
const PANEL_MYSQL_BIN = "/www/server/mysql/bin/mysqld";
const PANEL_MYSQL_DATA_DIR = "/www/server/data";
const PANEL_LOG_TAIL_BYTES = 128 * 1024;
const LOG_TAIL_LINES = 300;
// Linux 用户态 ABI 固定的时钟节拍，/proc/<pid>/stat 的 starttime 以此为单位。
const USER_HZ = 100;
const PM2_HOME = "/root/.pm2";
const PM2_LOG_DIR = `${PM2_HOME}/logs`;
// 日志经两层 JSON 转义（流结构 + Socket 回包），每条流取 64KB 才能稳定落在 Agent 的 512KB 读取上限内。
const PM2_LOG_STREAM_BYTES = 64 * 1024;
const PM2_LOG_STREAMS = Object.freeze([
  ["stdout", "out"],
  ["stderr", "error"],
]);
const MAX_SOCKET_REQUEST_BYTES = 1024;
const PM2_SERVICES = Object.freeze({
  "lightnote-api": "app",
  "lightnote-document-worker": "light-note-document-worker",
  "lightnote-bookmark-icon-worker": "light-note-bookmark-icon-worker",
  "lightnote-resource-governance-worker":
    "light-note-resource-governance-worker",
  "lightnote-browser-push-worker": "light-note-browser-push",
  "lightnote-note-import-worker": "light-note-imports",
  "lightnote-data-export-worker": "light-note-exports",
});
const RESTARTABLE_SERVICES = new Set([
  "lightnote-document-worker",
  "lightnote-bookmark-icon-worker",
  "lightnote-resource-governance-worker",
]);
const SYSTEMD_SERVICES = Object.freeze({
  nginx: "nginx.service",
  mysql: "mysql.service",
  redis: "redis-server.service",
});

const environment = {
  PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
};
const pm2Environment = { ...environment, PM2_HOME };
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const SECRET_ASSIGNMENT =
  /\b([a-z0-9_-]*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session)[a-z0-9_-]*)\s*[:=]\s*([^\s,;]+)/giu;
const BEARER_TOKEN = /\bBearer\s+[a-z0-9._~+\/-]+=*/giu;
const SENSITIVE_QUERY =
  /([?&](?:token|key|secret|signature|auth|session)=)[^&#\s]+/giu;
const URI_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/giu;
const JWT_TOKEN = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/giu;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;

function executable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function readable(file) {
  try {
    accessSync(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function run(file, args, options = {}) {
  return spawnSync(file, args, {
    shell: false,
    encoding: "utf8",
    timeout: options.timeout || 15_000,
    maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
    env: options.env || environment,
  });
}

function runInHostMount(file, args, options = {}) {
  // helper 是 systemd 按请求启动的 root 进程，ProtectHome 隐藏了 /root；固定进入宿主挂载命名空间访问 root PM2，
  // 非 root Agent 只持有 helper Socket 的连接权限，始终看不到 /root/.pm2。
  return run(NSENTER_BIN, ["--mount=/proc/1/ns/mnt", "--", file, ...args], options);
}

function runPm2(args, options = {}) {
  return runInHostMount(PM2_BIN, args, { ...options, env: pm2Environment });
}

function readPm2LogStream(file) {
  const stat = runInHostMount(STAT_BIN, ["--format=%Y", "--", file]);
  if (stat.status !== 0) return null;
  const tail = runInHostMount(TAIL_BIN, [
    "--bytes",
    String(PM2_LOG_STREAM_BYTES),
    "--",
    file,
  ]);
  if (tail.status !== 0) return null;
  const text = String(tail.stdout || "");
  const clipped = Buffer.byteLength(text) >= PM2_LOG_STREAM_BYTES;
  const lines = text.split("\n");
  if (clipped) lines.shift();
  if (lines.at(-1) === "") lines.pop();
  const modifiedSeconds = Number(String(stat.stdout).trim());
  return {
    modifiedAt:
      Number.isSafeInteger(modifiedSeconds) && modifiedSeconds > 0
        ? new Date(modifiedSeconds * 1000).toISOString()
        : null,
    lines: lines.slice(-LOG_TAIL_LINES).map(redact),
    truncated: clipped || lines.length > LOG_TAIL_LINES,
  };
}

// PM2 未开启 time 前缀时日志行没有时间戳，out/err 无法逐行合并；按流分别返回并附最后写入时间，由 Agent 排序。
function readPm2LogStreams(processName) {
  const streams = PM2_LOG_STREAMS.map(([stream, suffix]) => ({
    stream,
    content: readPm2LogStream(`${PM2_LOG_DIR}/${processName}-${suffix}.log`),
  }));
  // 单个文件缺失按空流处理；两条都读不到说明宿主命名空间或 PM2 目录不可用。
  if (streams.every((item) => item.content === null)) return null;
  return streams.map(({ stream, content }) => ({
    stream,
    modifiedAt: content?.modifiedAt ?? null,
    lines: content?.lines ?? [],
    truncated: content?.truncated ?? false,
  }));
}

function commandFailure(result, message) {
  if (result.status === 0) return null;
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: "",
    stderr: `${message}\n`,
  };
}

function success(stdout = "") {
  return { exitCode: 0, stdout, stderr: "" };
}

function denied() {
  return { exitCode: 64, stdout: "", stderr: "action denied\n" };
}

function redact(value) {
  return String(value || "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(SECRET_ASSIGNMENT, "$1=[REDACTED]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(SENSITIVE_QUERY, "$1[REDACTED]")
    .replace(URI_CREDENTIALS, "$1[REDACTED]@")
    .replace(JWT_TOKEN, "[REDACTED_JWT]")
    .replace(PRIVATE_KEY_BLOCK, "[REDACTED_PRIVATE_KEY]")
    .slice(-128 * 1024);
}

function serviceIsActive(unit) {
  return run(SYSTEMCTL_BIN, ["is-active", "--quiet", unit]).status === 0;
}

function parseBooleanSetting(value) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function readSshPosture() {
  if (!executable(SSHD_BIN)) {
    return {
      available: false,
      port: null,
      permitRootLogin: null,
      passwordAuthentication: null,
      publicKeyAuthentication: null,
    };
  }
  const result = run(SSHD_BIN, ["-T"], {
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });
  if (result.status !== 0) {
    return {
      available: false,
      port: null,
      permitRootLogin: null,
      passwordAuthentication: null,
      publicKeyAuthentication: null,
    };
  }
  const settings = Object.fromEntries(
    String(result.stdout || "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/u))
      .filter(([key, value]) => key && value)
      .map(([key, ...rest]) => [key, rest.join(" ")]),
  );
  return {
    available: true,
    port: Number.isInteger(Number(settings.port))
      ? Number(settings.port)
      : null,
    permitRootLogin: settings.permitrootlogin || null,
    passwordAuthentication: parseBooleanSetting(
      settings.passwordauthentication,
    ),
    publicKeyAuthentication: parseBooleanSetting(settings.pubkeyauthentication),
  };
}

function readShellAssignments(file) {
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) =>
        line.match(/^\s*([A-Z0-9_]+)=("?)([^"\s#]*)\2\s*(?:#.*)?$/u),
      )
      .filter(Boolean)
      .map((match) => [match[1], match[3]]),
  );
}

function parseUfwPorts(value) {
  if (value === "any") return "any";
  const ranges = [];
  for (const part of String(value || "").split(",")) {
    const match = part.match(/^(\d{1,5})(?::(\d{1,5}))?$/u);
    if (!match) return null;
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from < 1 || to > 65535 || from > to) return null;
    ranges.push([from, to]);
  }
  return ranges.length ? ranges : null;
}

// 解析 ufw 写入规则文件的 "### tuple ###" 行：
// action proto dport dst sport src [dapp sapp] direction[_iface] [comment=...]
function readUfwInboundRules() {
  const rules = [];
  for (const [file, family] of UFW_RULE_FILES) {
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      if (family === "ipv6") continue;
      return null;
    }
    for (const line of source.split("\n")) {
      if (!line.startsWith("### tuple ### ")) continue;
      const tokens = line
        .slice("### tuple ### ".length)
        .trim()
        .split(/\s+/u)
        .filter((token) => !token.startsWith("comment="));
      const direction = /^(?:in|out)(?:_|$)/u.test(tokens[6] || "")
        ? tokens[6]
        : tokens[8];
      if (!direction) return null;
      if (!/^in(?:_|$)/u.test(direction) || tokens[0].includes(":")) continue;
      const action = tokens[0].split("_")[0];
      if (!["allow", "limit", "deny", "reject"].includes(action)) return null;
      if (!["tcp", "udp", "any"].includes(tokens[1])) continue;
      const ports = parseUfwPorts(tokens[2]);
      if (!ports) return null;
      rules.push({
        family,
        action,
        protocol: tokens[1],
        ports,
        source:
          tokens[5] === "0.0.0.0/0" || tokens[5] === "::/0"
            ? "any"
            : "restricted",
      });
    }
  }
  return rules;
}

function readUfwPosture() {
  if (!readable(UFW_CONFIG)) return null;
  try {
    const enabled = readShellAssignments(UFW_CONFIG).ENABLED;
    if (enabled !== "yes" && enabled !== "no") return null;
    const defaults = readable(UFW_DEFAULTS)
      ? readShellAssignments(UFW_DEFAULTS)
      : {};
    return {
      available: true,
      provider: "ufw",
      state: enabled === "yes" ? "enabled" : "disabled",
      defaultIncoming: UFW_POLICIES[defaults.DEFAULT_INPUT_POLICY] || null,
      ipv6: defaults.IPV6 === "yes" ? true : defaults.IPV6 === "no" ? false : null,
      inboundRules: readUfwInboundRules(),
    };
  } catch {
    return null;
  }
}

function readFirewallPosture() {
  const ufw = readUfwPosture();
  if (ufw) return ufw;
  if (executable(FIREWALL_CMD_BIN)) {
    const result = run(FIREWALL_CMD_BIN, ["--state"], {
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
    return {
      available: true,
      provider: "firewalld",
      state: result.status === 0 ? "enabled" : "disabled",
    };
  }
  if (serviceIsActive("nftables.service"))
    return { available: true, provider: "nftables", state: "enabled" };
  return { available: false, provider: null, state: "unknown" };
}

function readFail2banPosture() {
  const result = run(SYSTEMCTL_BIN, [
    "show",
    "fail2ban.service",
    "--property=LoadState,ActiveState",
    "--no-pager",
  ]);
  const text = String(result.stdout || "");
  if (result.status !== 0) {
    return { available: false, state: "unknown", installed: null };
  }
  // 未安装是可确认的事实，不是采集失败；按未启用防护处理。
  if (/LoadState=not-found/u.test(text)) {
    return { available: true, state: "disabled", installed: false };
  }
  return {
    available: true,
    state: /ActiveState=active/u.test(text) ? "enabled" : "disabled",
    installed: true,
  };
}

function readPendingUpdates() {
  if (!executable(APT_BIN))
    return { available: false, pending: null, security: null };
  const result = run(APT_BIN, ["list", "--upgradable"], {
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0)
    return { available: false, pending: null, security: null };
  const lines = String(result.stdout || "")
    .split("\n")
    .filter((line) => line.includes("/") && !line.startsWith("Listing"));
  return {
    available: true,
    pending: lines.length,
    security: lines.filter((line) => /security/iu.test(line)).length,
  };
}

function readSshActivity() {
  if (!executable(JOURNALCTL_BIN))
    return { successes24h: null, failures24h: null, recent: [] };
  const result = run(
    JOURNALCTL_BIN,
    [
      "--unit",
      "ssh.service",
      "--unit",
      "sshd.service",
      "--since=-24 hours",
      "--no-pager",
      "--output=short-iso",
    ],
    { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 },
  );
  if (result.status !== 0)
    return { successes24h: null, failures24h: null, recent: [] };
  let successes24h = 0;
  let failures24h = 0;
  const recent = [];
  for (const line of String(result.stdout || "").split("\n")) {
    const accepted = line.match(
      /^(\S+)\s+.*Accepted\s+(\S+)\s+for\s+(\S+)\s+from\s+([^\s]+)/u,
    );
    const failed = line.match(
      /^(\S+)\s+.*Failed\s+(\S+)\s+for(?:\s+invalid user)?\s+(\S+)\s+from\s+([^\s]+)/u,
    );
    const invalid = line.match(
      /^(\S+)\s+.*Invalid user\s+(\S+)\s+from\s+([^\s]+)/u,
    );
    if (accepted) {
      successes24h += 1;
      recent.push({
        occurredAt: accepted[1],
        outcome: "succeeded",
        method: accepted[2],
        user: accepted[3],
        sourceAddress: accepted[4],
      });
    } else if (failed) {
      failures24h += 1;
      recent.push({
        occurredAt: failed[1],
        outcome: "failed",
        method: failed[2],
        user: failed[3],
        sourceAddress: failed[4],
      });
    } else if (invalid) {
      failures24h += 1;
      recent.push({
        occurredAt: invalid[1],
        outcome: "failed",
        method: null,
        user: invalid[2],
        sourceAddress: invalid[3],
      });
    }
  }
  return { successes24h, failures24h, recent: recent.slice(-20).reverse() };
}

// 只回传时间、大小与状态值；备份路径、错误原文和对象存储键都不外传。
function readDatabaseBackup() {
  let latest = null;
  try {
    for (const name of readdirSync(DB_BACKUP_DIR)) {
      if (!DB_BACKUP_FILE_PATTERN.test(name)) continue;
      const stat = lstatSync(`${DB_BACKUP_DIR}/${name}`);
      if (stat.isFile() && (!latest || stat.mtimeMs > latest.mtimeMs))
        latest = stat;
    }
  } catch {
    return { available: false };
  }
  let status = null;
  try {
    status = JSON.parse(readFileSync(DB_BACKUP_STATUS_FILE, "utf8"));
  } catch {
    status = null;
  }
  const offsite = String(status?.offsite || "").split(":")[0];
  const errorCode = String(status?.error?.code || "");
  return {
    available: true,
    lastSuccessAt: latest ? new Date(latest.mtimeMs).toISOString() : null,
    lastSuccessBytes: latest ? latest.size : null,
    lastRunAt: status?.finishedAt || null,
    lastRunOk: typeof status?.ok === "boolean" ? status.ok : null,
    lastRunErrorCode: /^[A-Z0-9_]{1,64}$/u.test(errorCode) ? errorCode : null,
    offsite: ["uploaded", "failed", "skipped"].includes(offsite)
      ? offsite
      : null,
  };
}

function securitySnapshot() {
  const ssh = { ...readSshPosture(), ...readSshActivity() };
  return {
    capturedAt: new Date().toISOString(),
    ssh,
    firewall: readFirewallPosture(),
    fail2ban: readFail2banPosture(),
    updates: readPendingUpdates(),
    backup: readDatabaseBackup(),
  };
}

function verifiedProcessPid(pidFile, executablePath) {
  try {
    const source = readFileSync(pidFile, "utf8").trim();
    if (!/^[1-9]\d{0,9}$/u.test(source)) return null;
    const pid = Number(source);
    return realpathSync(`/proc/${pid}/exe`) === executablePath ? pid : null;
  } catch {
    return null;
  }
}

// 只列出固定目录下的普通文件；符号链接、子目录和不匹配的文件名一律忽略。
function fixedDirectoryFiles(directory, pattern) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => `${directory}/${entry.name}`);
  } catch {
    return [];
  }
}

function latestNonEmptyFile(files) {
  return (
    files
      .map((file) => {
        try {
          const stats = lstatSync(file);
          return stats.isFile() && stats.size > 0
            ? { file, modifiedAt: stats.mtimeMs }
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.modifiedAt - a.modifiedAt)[0]?.file || null
  );
}

// 宝塔托管的服务不经 systemd 启动，对应 unit 可能长期处于 failed，必须以固定 PID 文件和
// 已校验的可执行文件判定运行状态，日志也只读取面板写入的固定文件。
const PANEL_SERVICES = Object.freeze({
  nginx: Object.freeze({
    binary: PANEL_NGINX_BIN,
    pidFiles: () => [PANEL_NGINX_PID],
    logFile: () =>
      latestNonEmptyFile(
        fixedDirectoryFiles(PANEL_NGINX_LOG_DIR, /^[A-Za-z0-9._-]*error\.log$/u),
      ),
  }),
  redis: Object.freeze({
    binary: PANEL_REDIS_BIN,
    pidFiles: () => [PANEL_REDIS_PID],
    logFile: () => latestNonEmptyFile([PANEL_REDIS_LOG]),
  }),
  mysql: Object.freeze({
    binary: PANEL_MYSQL_BIN,
    pidFiles: () =>
      fixedDirectoryFiles(PANEL_MYSQL_DATA_DIR, /^[A-Za-z0-9._-]+\.pid$/u),
    logFile: () =>
      latestNonEmptyFile(
        fixedDirectoryFiles(PANEL_MYSQL_DATA_DIR, /^[A-Za-z0-9._-]+\.err$/u),
      ),
  }),
});

function residentBytes(pid) {
  try {
    const match = readFileSync(`/proc/${pid}/status`, "utf8").match(
      /^VmRSS:\s+(\d+)\s+kB$/mu,
    );
    return match ? Number(match[1]) * 1024 : 0;
  } catch {
    return 0;
  }
}

function childPids(pid) {
  try {
    return readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8")
      .trim()
      .split(/\s+/u)
      .filter((value) => /^[1-9]\d{0,9}$/u.test(value))
      .map(Number);
  } catch {
    return [];
  }
}

function processStartedAt(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // 进程名可能含空格或括号；从最后一个 ")" 之后的第 3 个字段起切分，starttime 是第 22 个字段。
    const startTicks = Number(
      stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19],
    );
    const bootSeconds = Number(
      readFileSync("/proc/stat", "utf8").match(/^btime\s+(\d+)$/mu)?.[1],
    );
    if (!Number.isSafeInteger(startTicks) || !Number.isSafeInteger(bootSeconds)) {
      return null;
    }
    return new Date((bootSeconds + startTicks / USER_HZ) * 1000);
  } catch {
    return null;
  }
}

function panelServiceStatus(serviceId) {
  if (!Object.hasOwn(PANEL_SERVICES, serviceId)) return null;
  const definition = PANEL_SERVICES[serviceId];
  const pid = executable(definition.binary)
    ? definition
        .pidFiles()
        .map((pidFile) => verifiedProcessPid(pidFile, definition.binary))
        .find(Boolean) || null
    : null;
  const startedAt = pid ? processStartedAt(pid) : null;
  // 主进程加直接子进程（如 Nginx worker）的常驻内存；共享页会重复计入，属近似值。
  const memoryBytes = pid
    ? [pid, ...childPids(pid)].reduce((sum, item) => sum + residentBytes(item), 0)
    : 0;
  return {
    state: pid ? "running" : "stopped",
    detail: pid ? "active / panel-managed" : "inactive / panel-managed",
    pid,
    uptimeSeconds: startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
      : null,
    cpuPercent: null,
    memoryBytes: memoryBytes > 0 ? memoryBytes : null,
    restartCount: null,
    startedAt: startedAt ? startedAt.toISOString() : null,
  };
}

function panelLogFile(serviceId) {
  if (!Object.hasOwn(PANEL_SERVICES, serviceId)) return undefined;
  const definition = PANEL_SERVICES[serviceId];
  return executable(definition.binary) ? definition.logFile() : undefined;
}

function tailFileLines(file) {
  let descriptor;
  try {
    descriptor = openSync(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) return null;
    const length = Math.min(stats.size, PANEL_LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(descriptor, buffer, 0, length, stats.size - length);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    if (length < stats.size) lines.shift();
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-LOG_TAIL_LINES);
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function systemdServiceStatus(serviceId) {
  const unit = SYSTEMD_SERVICES[serviceId];
  if (!unit) return null;
  const result = run(SYSTEMCTL_BIN, [
    "show",
    unit,
    "--property=ActiveState,SubState,MainPID,MemoryCurrent,NRestarts,ActiveEnterTimestamp",
    "--no-pager",
  ]);
  if (result.status !== 0) return null;
  const fields = Object.fromEntries(
    String(result.stdout || "")
      .split("\n")
      .map((line) => line.split("="))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key, rest.join("=")]),
  );
  const state =
    fields.ActiveState === "active"
      ? "running"
      : fields.ActiveState === "failed"
        ? "degraded"
        : fields.ActiveState === "inactive"
          ? "stopped"
          : "unknown";
  const pid = Number(fields.MainPID || 0);
  const memoryBytes = Number(fields.MemoryCurrent || 0);
  const restartCount = Number(fields.NRestarts || 0);
  const startedAtMs = Date.parse(fields.ActiveEnterTimestamp || "");
  return {
    state,
    detail:
      [fields.ActiveState, fields.SubState].filter(Boolean).join(" / ") ||
      "unknown",
    pid: pid > 0 ? pid : null,
    uptimeSeconds: null,
    cpuPercent: null,
    memoryBytes: memoryBytes > 0 ? memoryBytes : null,
    restartCount:
      Number.isSafeInteger(restartCount) && restartCount >= 0
        ? restartCount
        : null,
    startedAt: Number.isFinite(startedAtMs)
      ? new Date(startedAtMs).toISOString()
      : null,
  };
}

function managedServiceStatus(serviceId) {
  const panelStatus = panelServiceStatus(serviceId);
  return panelStatus?.state === "running"
    ? panelStatus
    : systemdServiceStatus(serviceId) || panelStatus;
}

function nginxTopology() {
  const panelStatus = panelServiceStatus("nginx");
  if (panelStatus?.state === "running" && readable(PANEL_NGINX_CONFIG)) {
    return "panel";
  }
  return serviceIsActive("nginx.service") ? "systemd" : null;
}

function executeAction(action, targetId) {
  if (action === "capabilities" && targetId === undefined) {
    const topology = nginxTopology();
    return success(
      JSON.stringify({
        nginxReload:
          (topology === "panel" && executable(PANEL_NGINX_BIN)) ||
          (topology === "systemd" &&
            executable(SYSTEMCTL_BIN) &&
            executable(NGINX_BIN)),
        pm2Status: executable(PM2_BIN) && executable(NSENTER_BIN),
        workerRestart: executable(PM2_BIN) && executable(NSENTER_BIN),
        serviceLogs:
          executable(NSENTER_BIN) &&
          executable(STAT_BIN) &&
          executable(TAIL_BIN) &&
          executable(JOURNALCTL_BIN),
        securitySnapshot: executable(JOURNALCTL_BIN),
      }),
    );
  }

  if (action === "security-snapshot" && targetId === undefined) {
    return success(JSON.stringify(securitySnapshot()));
  }

  if (action === "service-status" && Object.hasOwn(PANEL_SERVICES, targetId)) {
    return success(JSON.stringify(managedServiceStatus(targetId)));
  }

  if (action === "nginx-reload" && targetId === undefined) {
    const topology = nginxTopology();
    if (!topology) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "nginx service is not active\n",
      };
    }
    const binary = topology === "panel" ? PANEL_NGINX_BIN : NGINX_BIN;
    const test = run(
      binary,
      topology === "panel" ? ["-t", "-c", PANEL_NGINX_CONFIG] : ["-t"],
    );
    const testFailure = commandFailure(test, "nginx configuration test failed");
    if (testFailure) return testFailure;
    const reload =
      topology === "panel"
        ? run(binary, ["-s", "reload", "-c", PANEL_NGINX_CONFIG])
        : run(SYSTEMCTL_BIN, ["reload", "nginx.service"]);
    return (
      commandFailure(reload, "nginx reload failed") ||
      success("nginx configuration checked and reloaded\n")
    );
  }

  if (action === "pm2-status" && targetId === undefined) {
    const result = runPm2(["jlist"]);
    const failure = commandFailure(result, "pm2 status failed");
    if (failure) return failure;
    try {
      const items = JSON.parse(result.stdout || "[]");
      const allowedNames = new Set(Object.values(PM2_SERVICES));
      const safeItems = (Array.isArray(items) ? items : [])
        .filter((item) => allowedNames.has(String(item?.name || "")))
        .map((item) => ({
          name: String(item.name),
          pid: Number(item.pid || 0) || null,
          pm2_env: {
            status: String(item?.pm2_env?.status || "unknown"),
            pm_uptime: Number(item?.pm2_env?.pm_uptime || 0) || null,
            restart_time: Number(item?.pm2_env?.restart_time || 0) || 0,
            unstable_restarts:
              Number(item?.pm2_env?.unstable_restarts || 0) || 0,
          },
          monit: {
            cpu: Number(item?.monit?.cpu || 0) || 0,
            memory: Number(item?.monit?.memory || 0) || 0,
          },
        }));
      return success(JSON.stringify(safeItems));
    } catch {
      return { exitCode: 1, stdout: "", stderr: "pm2 status invalid\n" };
    }
  }

  if (action === "pm2-restart" && RESTARTABLE_SERVICES.has(targetId)) {
    const result = runPm2(["restart", PM2_SERVICES[targetId]], {
      timeout: 20_000,
    });
    return (
      commandFailure(result, "pm2 restart failed") ||
      success("allowlisted worker restarted\n")
    );
  }

  if (action === "pm2-logs" && Object.hasOwn(PM2_SERVICES, targetId)) {
    const streams = readPm2LogStreams(PM2_SERVICES[targetId]);
    if (!streams) {
      return { exitCode: 1, stdout: "", stderr: "pm2 logs failed\n" };
    }
    return success(JSON.stringify({ streams }));
  }

  if (action === "journal-logs" && Object.hasOwn(SYSTEMD_SERVICES, targetId)) {
    // 已安装面板版时以面板日志为准；没有非空日志就返回空，不回退到失效 unit 的旧 journal。
    const panelLog = panelLogFile(targetId);
    if (panelLog !== undefined) {
      if (panelLog === null) return success("");
      const lines = tailFileLines(panelLog);
      if (!lines) {
        return { exitCode: 1, stdout: "", stderr: "service logs failed\n" };
      }
      return success(redact(lines.join("\n")));
    }
    const result = run(JOURNALCTL_BIN, [
      "--unit",
      SYSTEMD_SERVICES[targetId],
      "--lines",
      "300",
      "--no-pager",
      "--output=short-iso",
    ]);
    const failure = commandFailure(result, "service logs failed");
    if (failure) return failure;
    return success(
      redact([result.stdout, result.stderr].filter(Boolean).join("\n")),
    );
  }

  return denied();
}

function validSocketRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const keys = Object.keys(payload);
  if (keys.some((key) => key !== "action" && key !== "targetId")) return false;
  if (typeof payload.action !== "string" || payload.action.length > 64) {
    return false;
  }
  return (
    payload.targetId === undefined ||
    (typeof payload.targetId === "string" && payload.targetId.length <= 64)
  );
}

async function readSocketRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_SOCKET_REQUEST_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8").trim());
    return validSocketRequest(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function main() {
  const [action, targetId, extra] = process.argv.slice(2);
  if (action === "socket" && targetId === undefined) {
    const request = await readSocketRequest();
    process.stdout.write(
      JSON.stringify(
        request ? executeAction(request.action, request.targetId) : denied(),
      ),
    );
    return;
  }

  const result =
    !action || extra !== undefined ? denied() : executeAction(action, targetId);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

await main();
