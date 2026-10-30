import { describe, expect, it, vi } from "vitest";
import {
  collectSecuritySnapshot,
  exposureFor,
  firewallCoverage,
  normalizeHelperSnapshot,
} from "./security.js";

const ufw = (inboundRules, overrides = {}) => ({
  available: true,
  provider: "ufw",
  state: "enabled",
  defaultIncoming: "deny",
  ipv6: true,
  inboundRules,
  ...overrides,
});
const rule = (family, port, overrides = {}) => ({
  family,
  action: "allow",
  protocol: "tcp",
  ports: [[port, port]],
  source: "any",
  ...overrides,
});
const port = (protocol, address, value) => ({
  protocol,
  address,
  port: value,
  exposure: exposureFor(address),
});

describe("exposureFor", () => {
  it("整个 127.0.0.0/8 都是回环，不会把 systemd-resolved 判成公网", () => {
    expect(exposureFor("127.0.0.53")).toBe("loopback");
    expect(exposureFor("127.0.0.1")).toBe("loopback");
    expect(exposureFor("::1")).toBe("loopback");
    expect(exposureFor("0.0.0.0")).toBe("public");
    expect(exposureFor("::")).toBe("public");
    expect(exposureFor("10.0.0.8")).toBe("local");
  });
});

describe("firewallCoverage", () => {
  it("默认拒绝入站时，只有放行规则覆盖的端口对公网可达", () => {
    const firewall = ufw([
      rule("ipv4", 3306),
      rule("ipv4", 39000, { ports: [[39000, 40000]] }),
      rule("ipv4", 8888, { protocol: "any" }),
    ]);
    expect(firewallCoverage(port("tcp", "0.0.0.0", 3306), firewall)).toBe(
      "allowed",
    );
    expect(firewallCoverage(port("tcp", "0.0.0.0", 39500), firewall)).toBe(
      "allowed",
    );
    expect(firewallCoverage(port("udp", "0.0.0.0", 8888), firewall)).toBe(
      "allowed",
    );
    expect(firewallCoverage(port("tcp", "0.0.0.0", 9001), firewall)).toBe(
      "blocked",
    );
    expect(firewallCoverage(port("udp", "0.0.0.0", 3306), firewall)).toBe(
      "blocked",
    );
  });

  it("双栈 IPv6 套接字同时检查两个协议族，任一族放行即视为可达", () => {
    const firewall = ufw([rule("ipv4", 3306)]);
    expect(firewallCoverage(port("tcp6", "::", 3306), firewall)).toBe(
      "allowed",
    );
    expect(firewallCoverage(port("tcp6", "::", 9001), firewall)).toBe(
      "blocked",
    );
    expect(
      firewallCoverage(port("tcp6", "2001:db8:0:0:0:0:0:1", 3306), firewall),
    ).toBe("blocked");
  });

  it("按规则先后判定，仅放行指定来源时标为受限", () => {
    expect(
      firewallCoverage(
        port("tcp", "0.0.0.0", 3306),
        ufw([rule("ipv4", 3306, { action: "deny" }), rule("ipv4", 3306)]),
      ),
    ).toBe("blocked");
    expect(
      firewallCoverage(
        port("tcp", "0.0.0.0", 3306),
        ufw([rule("ipv4", 3306, { source: "restricted" })]),
      ),
    ).toBe("restricted");
  });

  it("规则不可用、IPv6 未受 ufw 管理或防火墙未启用时不能判成已拦截", () => {
    expect(
      firewallCoverage(port("tcp", "0.0.0.0", 9001), ufw(null)),
    ).toBe("unknown");
    expect(
      firewallCoverage(port("tcp6", "::", 9001), ufw([], { ipv6: false })),
    ).toBe("unknown");
    expect(
      firewallCoverage(port("tcp", "0.0.0.0", 9001), ufw([], { state: "disabled" })),
    ).toBe("allowed");
    expect(
      firewallCoverage(port("tcp", "0.0.0.0", 9001), { available: false }),
    ).toBe("unknown");
  });
});

describe("collectSecuritySnapshot", () => {
  const helperPayload = (firewall) => ({
    capturedAt: "2026-10-30T00:00:00.000Z",
    ssh: { available: true, port: 22, recent: [] },
    firewall,
    fail2ban: { available: true, state: "disabled", installed: false },
    updates: { available: true, pending: 0, security: 0 },
  });

  it("保留 Fail2ban 未安装事实，防火墙规则只在本机使用不外传", async () => {
    const helperRequester = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(helperPayload(ufw([rule("ipv4", 22)]))),
      stderr: "",
    }));
    const snapshot = await collectSecuritySnapshot(
      { privilegedHelperSocketPath: "/run/lightnote-host-helper.sock" },
      helperRequester,
    );
    expect(snapshot.fail2ban).toEqual({
      available: true,
      state: "disabled",
      installed: false,
    });
    expect(snapshot.firewall).toEqual({
      available: true,
      provider: "ufw",
      state: "enabled",
    });
  });

  it("无法识别的防火墙规则使整组规则失效，端口不会被误判为已拦截", () => {
    const { firewall } = normalizeHelperSnapshot(
      JSON.stringify(
        helperPayload(
          ufw([rule("ipv4", 3306, { action: "deny" }), rule("ipv4", 22, { ports: [[0, 99999]] })]),
        ),
      ),
    );
    expect(firewall.inboundRules).toBeNull();
    expect(firewallCoverage(port("tcp", "0.0.0.0", 3306), firewall)).toBe(
      "unknown",
    );
  });

  it("备份状态只保留时间、大小与状态值，旧版 helper 不带字段时按读不到处理", async () => {
    const backup = {
      available: true,
      lastSuccessAt: "2026-10-30T07:32:59.000Z",
      lastSuccessBytes: 169409795,
      lastRunAt: "2026-10-30T07:33:23.076Z",
      lastRunOk: true,
      lastRunErrorCode: null,
      offsite: "uploaded",
    };
    const snapshot = await collectSecuritySnapshot(
      { privilegedHelperSocketPath: "/run/lightnote-host-helper.sock" },
      async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          ...helperPayload(ufw([rule("ipv4", 22)])),
          backup: { ...backup, file: "/www/backup/secret.sql.gz" },
        }),
        stderr: "",
      }),
    );
    expect(snapshot.backup).toEqual(backup);

    const legacy = normalizeHelperSnapshot(
      JSON.stringify(helperPayload(ufw([rule("ipv4", 22)]))),
    );
    expect(legacy.backup).toMatchObject({ available: false, lastSuccessAt: null });

    const malformed = normalizeHelperSnapshot(
      JSON.stringify({
        ...helperPayload(ufw([rule("ipv4", 22)])),
        backup: {
          available: true,
          lastSuccessAt: "not a date",
          lastSuccessBytes: -1,
          lastRunOk: "yes",
          lastRunErrorCode: "mysqldump: Access denied for 'root'",
          offsite: "uploaded:ops-backups/mysql/x.sql.gz",
        },
      }),
    );
    expect(malformed.backup).toEqual({
      available: true,
      lastSuccessAt: null,
      lastSuccessBytes: null,
      lastRunAt: null,
      lastRunOk: null,
      lastRunErrorCode: null,
      offsite: null,
    });
  });

  it("helper 不可用时备份同样标为读不到", async () => {
    const snapshot = await collectSecuritySnapshot(
      { privilegedHelperSocketPath: "/run/lightnote-host-helper.sock" },
      async () => ({ exitCode: 1, stdout: "", stderr: "failed" }),
    );
    expect(snapshot.backup).toMatchObject({ available: false });
  });
});
