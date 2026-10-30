import fs from "node:fs/promises";
import { HOST_AGENT_PROTOCOL_VERSION } from "@lightnote/shared/host-agent-protocol";
import { requestPrivilegedHelper } from "./helperClient.js";
import { stableErrorCode } from "./redaction.js";

function ipv4FromHex(value) {
  const bytes =
    String(value || "")
      .match(/.{2}/gu)
      ?.map((part) => Number.parseInt(part, 16))
      .reverse() || [];
  return bytes.length === 4 && bytes.every(Number.isFinite)
    ? bytes.join(".")
    : "unknown";
}

function ipv6FromHex(value) {
  const source = String(value || "");
  if (source === "00000000000000000000000000000000") return "::";
  if (source === "00000000000000000000000001000000") return "::1";
  const bytes =
    source
      .match(/.{8}/gu)
      ?.flatMap((word) => word.match(/.{2}/gu)?.reverse() || []) || [];
  if (bytes.length !== 16) return "unknown";
  return Array.from(
    { length: 8 },
    (_, index) =>
      `${bytes[index * 2]}${bytes[index * 2 + 1]}`.replace(/^0+/u, "") || "0",
  ).join(":");
}

export function exposureFor(address) {
  // 127.0.0.0/8 整段都是回环，例如 systemd-resolved 监听的 127.0.0.53。
  if (/^127\./u.test(address) || address === "::1") return "loopback";
  if (address === "0.0.0.0" || address === "::") return "public";
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(address))
    return "local";
  if (/^(?:fc|fd|fe8|fe9|fea|feb)/iu.test(address)) return "local";
  return "public";
}

async function parseProcSockets(file, protocol) {
  const source = await fs.readFile(file, "utf8");
  const ipv6 = protocol.endsWith("6");
  const tcp = protocol.startsWith("tcp");
  const result = [];
  for (const line of source.split("\n").slice(1)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 4 || (tcp && fields[3] !== "0A")) continue;
    const [addressHex, portHex] = String(fields[1] || "").split(":");
    const port = Number.parseInt(portHex, 16);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    const address = ipv6 ? ipv6FromHex(addressHex) : ipv4FromHex(addressHex);
    result.push({ protocol, address, port, exposure: exposureFor(address) });
  }
  return result;
}

export async function collectListeningPorts() {
  if (process.platform !== "linux") return [];
  const definitions = [
    ["/proc/net/tcp", "tcp"],
    ["/proc/net/tcp6", "tcp6"],
    ["/proc/net/udp", "udp"],
    ["/proc/net/udp6", "udp6"],
  ];
  const settled = await Promise.allSettled(
    definitions.map(([file, protocol]) => parseProcSockets(file, protocol)),
  );
  const seen = new Set();
  return settled
    .flatMap((item) => (item.status === "fulfilled" ? item.value : []))
    .filter((item) => {
      const key = `${item.protocol}:${item.address}:${item.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));
}

const UNAVAILABLE_BACKUP = Object.freeze({
  available: false,
  lastSuccessAt: null,
  lastSuccessBytes: null,
  lastRunAt: null,
  lastRunOk: null,
  lastRunErrorCode: null,
  offsite: null,
});
const BACKUP_OFFSITE_STATES = new Set(["uploaded", "failed", "skipped"]);

// 旧版 helper 不带备份字段时按“读不到”处理，不能当作备份正常。
function normalizeBackup(value) {
  if (!value || typeof value !== "object" || value.available !== true)
    return UNAVAILABLE_BACKUP;
  const isoOrNull = (input) =>
    typeof input === "string" && Number.isFinite(Date.parse(input))
      ? new Date(input).toISOString()
      : null;
  return {
    available: true,
    lastSuccessAt: isoOrNull(value.lastSuccessAt),
    lastSuccessBytes:
      Number.isSafeInteger(value.lastSuccessBytes) &&
      value.lastSuccessBytes >= 0
        ? value.lastSuccessBytes
        : null,
    lastRunAt: isoOrNull(value.lastRunAt),
    lastRunOk: typeof value.lastRunOk === "boolean" ? value.lastRunOk : null,
    lastRunErrorCode: /^[A-Z0-9_]{1,64}$/u.test(
      String(value.lastRunErrorCode || ""),
    )
      ? value.lastRunErrorCode
      : null,
    offsite: BACKUP_OFFSITE_STATES.has(value.offsite) ? value.offsite : null,
  };
}

function unavailableSnapshot(capturedAt) {
  return {
    capturedAt,
    ssh: {
      available: false,
      port: null,
      permitRootLogin: null,
      passwordAuthentication: null,
      publicKeyAuthentication: null,
      successes24h: null,
      failures24h: null,
      recent: [],
    },
    firewall: { available: false, provider: null, state: "unknown" },
    fail2ban: { available: false, state: "unknown", installed: null },
    updates: { available: false, pending: null, security: null },
    backup: UNAVAILABLE_BACKUP,
  };
}

const FIREWALL_RULE_ACTIONS = new Set(["allow", "limit", "deny", "reject"]);
const FIREWALL_RULE_PROTOCOLS = new Set(["tcp", "udp", "any"]);
const FIREWALL_DEFAULT_POLICIES = new Set(["allow", "deny", "reject"]);

function normalizeFirewallPorts(value) {
  if (value === "any") return "any";
  if (!Array.isArray(value) || !value.length || value.length > 64) return null;
  const ranges = value.map((range) =>
    Array.isArray(range) &&
    range.length === 2 &&
    range.every((port) => Number.isSafeInteger(port) && port >= 1 && port <= 65535) &&
    range[0] <= range[1]
      ? [range[0], range[1]]
      : null,
  );
  return ranges.every(Boolean) ? ranges : null;
}

// 规则按 ufw 的先后顺序参与判定；任意一条无法识别时整组视为未知，
// 宁可把端口当作可能暴露，也不能因丢掉一条放行规则而误判为已拦截。
function normalizeFirewallRules(value) {
  if (!Array.isArray(value) || value.length > 512) return null;
  const rules = value.map((rule) => {
    const ports = normalizeFirewallPorts(rule?.ports);
    if (
      (rule?.family !== "ipv4" && rule?.family !== "ipv6") ||
      !FIREWALL_RULE_ACTIONS.has(rule?.action) ||
      !FIREWALL_RULE_PROTOCOLS.has(rule?.protocol) ||
      (rule?.source !== "any" && rule?.source !== "restricted") ||
      !ports
    ) {
      return null;
    }
    return {
      family: rule.family,
      action: rule.action,
      protocol: rule.protocol,
      source: rule.source,
      ports,
    };
  });
  return rules.every(Boolean) ? rules : null;
}

function familyCoverage(port, rules, defaultIncoming) {
  const protocol = port.protocol.startsWith("udp") ? "udp" : "tcp";
  let restricted = false;
  for (const rule of rules) {
    if (rule.protocol !== "any" && rule.protocol !== protocol) continue;
    if (
      rule.ports !== "any" &&
      !rule.ports.some(([from, to]) => port.port >= from && port.port <= to)
    ) {
      continue;
    }
    const allows = rule.action === "allow" || rule.action === "limit";
    if (rule.source !== "any") {
      restricted ||= allows;
      continue;
    }
    if (allows) return "allowed";
    return restricted ? "restricted" : "blocked";
  }
  if (defaultIncoming === "allow") return "allowed";
  if (defaultIncoming === "deny" || defaultIncoming === "reject") {
    return restricted ? "restricted" : "blocked";
  }
  return "unknown";
}

/**
 * 判断任意公网来源能否经主机防火墙到达该监听端口。
 * 绑定 `::` 的 IPv6 套接字按双栈处理，需同时检查 IPv4 与 IPv6 规则。
 */
export function firewallCoverage(port, firewall) {
  if (!firewall?.available) return "unknown";
  if (firewall.state === "disabled") return "allowed";
  if (firewall.state !== "enabled" || !Array.isArray(firewall.inboundRules)) {
    return "unknown";
  }
  const families = port.protocol.endsWith("6")
    ? port.address === "::"
      ? ["ipv4", "ipv6"]
      : ["ipv6"]
    : ["ipv4"];
  const results = families.map((family) =>
    family === "ipv6" && firewall.ipv6 !== true
      ? "unknown"
      : familyCoverage(
          port,
          firewall.inboundRules.filter((rule) => rule.family === family),
          firewall.defaultIncoming,
        ),
  );
  return (
    ["allowed", "unknown", "restricted"].find((level) =>
      results.includes(level),
    ) || "blocked"
  );
}

export function normalizeHelperSnapshot(stdout) {
  const payload = JSON.parse(stdout || "{}");
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.ssh ||
    !payload.firewall ||
    !payload.fail2ban ||
    !payload.updates
  ) {
    throw Object.assign(new Error("security helper response is invalid"), {
      code: "HOST_HELPER_RESPONSE_INVALID",
    });
  }
  const booleanOrNull = (value) => (typeof value === "boolean" ? value : null);
  const countOrNull = (value) =>
    Number.isSafeInteger(value) && value >= 0 ? value : null;
  const state = (value) =>
    ["enabled", "disabled", "unknown"].includes(value) ? value : "unknown";
  const recent = Array.isArray(payload.ssh.recent)
    ? payload.ssh.recent.slice(0, 20).map((entry) => ({
        occurredAt: String(entry?.occurredAt || "").slice(0, 40),
        outcome: entry?.outcome === "succeeded" ? "succeeded" : "failed",
        sourceAddress: entry?.sourceAddress
          ? String(entry.sourceAddress).slice(0, 64)
          : null,
        user: entry?.user ? String(entry.user).slice(0, 64) : null,
        method: entry?.method ? String(entry.method).slice(0, 32) : null,
      }))
    : [];
  return {
    capturedAt: Number.isFinite(Date.parse(payload.capturedAt))
      ? payload.capturedAt
      : new Date().toISOString(),
    ssh: {
      available: payload.ssh.available === true,
      port:
        Number.isSafeInteger(Number(payload.ssh.port)) &&
        Number(payload.ssh.port) >= 1 &&
        Number(payload.ssh.port) <= 65535
          ? Number(payload.ssh.port)
          : null,
      permitRootLogin: payload.ssh.permitRootLogin
        ? String(payload.ssh.permitRootLogin).slice(0, 32)
        : null,
      passwordAuthentication: booleanOrNull(payload.ssh.passwordAuthentication),
      publicKeyAuthentication: booleanOrNull(
        payload.ssh.publicKeyAuthentication,
      ),
      successes24h: countOrNull(payload.ssh.successes24h),
      failures24h: countOrNull(payload.ssh.failures24h),
      recent,
    },
    firewall: {
      available: payload.firewall.available === true,
      provider: payload.firewall.provider
        ? String(payload.firewall.provider).slice(0, 32)
        : null,
      state: state(payload.firewall.state),
      defaultIncoming: FIREWALL_DEFAULT_POLICIES.has(
        payload.firewall.defaultIncoming,
      )
        ? payload.firewall.defaultIncoming
        : null,
      ipv6: booleanOrNull(payload.firewall.ipv6),
      inboundRules: normalizeFirewallRules(payload.firewall.inboundRules),
    },
    fail2ban: {
      available: payload.fail2ban.available === true,
      state: state(payload.fail2ban.state),
      installed: booleanOrNull(payload.fail2ban.installed),
    },
    updates: {
      available: payload.updates.available === true,
      pending: countOrNull(payload.updates.pending),
      security: countOrNull(payload.updates.security),
    },
    backup: normalizeBackup(payload.backup),
  };
}

export async function collectSecuritySnapshot(
  config,
  helperRequester = requestPrivilegedHelper,
) {
  const capturedAt = new Date().toISOString();
  const collectionErrors = [];
  let host = unavailableSnapshot(capturedAt);
  try {
    const result = await helperRequester(
      config.privilegedHelperSocketPath,
      "security-snapshot",
      undefined,
      { timeoutMs: 35_000, maxOutputBytes: 512 * 1024 },
    );
    if (result.exitCode !== 0)
      throw Object.assign(new Error("security helper failed"), {
        code: "HOST_HELPER_QUERY_FAILED",
      });
    host = normalizeHelperSnapshot(result.stdout);
  } catch (error) {
    collectionErrors.push({ source: "security", code: stableErrorCode(error) });
  }
  let listeningPorts = [];
  try {
    listeningPorts = await collectListeningPorts();
  } catch (error) {
    collectionErrors.push({
      source: "listening-ports",
      code: stableErrorCode(error),
    });
  }
  return {
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    ...host,
    // 规则只用于在本机判定端口可达性，不随快照外传。
    firewall: {
      available: host.firewall.available,
      provider: host.firewall.provider,
      state: host.firewall.state,
    },
    listeningPorts: listeningPorts.map((item) => ({
      ...item,
      firewall: firewallCoverage(item, host.firewall),
    })),
    collectionErrors,
  };
}
