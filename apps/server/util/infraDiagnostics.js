import {
  getHostAgentDashboard,
  getHostAgentSecurity,
  getHostAgentServices,
  getHostAgentStorage,
} from './hostAgentClient.js';

// 服务器诊断的唯一判定源：诊断接口与后台告警共用，阈值和安全规则只在这里维护。
function securityFinding(id, state, severity, evidence = {}) {
  return { id, state, severity, evidence };
}

function diagnosticCheck(id, domain, state, severity, evidence, target) {
  return { id, domain, state, severity, evidence, target };
}

export function thresholdState(value, warningAt, failedAt) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= failedAt) return 'fail';
  if (value >= warningAt) return 'warning';
  return 'pass';
}

export function diagnosticSourceErrorCode(error) {
  const code = String(error?.code || '')
    .trim()
    .toUpperCase();
  return /^HOST_AGENT_[A-Z0-9_]{1,52}$/u.test(code) ? code : 'HOST_AGENT_REQUEST_FAILED';
}

// 每天 03:30 备份，正常情况下最近一次成功不超过 24 小时；超过 36 小时判为异常，留出在下一次定时前修复的时间。
const BACKUP_MAX_AGE_HOURS = 36;

function backupFinding(snapshot) {
  const backup = snapshot?.backup;
  const referenceMs = Date.parse(snapshot?.capturedAt) || Date.now();
  const ageMs = referenceMs - Date.parse(backup?.lastSuccessAt);
  // 判定用精确时长，证据里的小时数只保留一位小数供展示。
  const ageHours = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 360_000) / 10) : null;
  const evidence = {
    lastSuccessAt: backup?.lastSuccessAt ?? null,
    ageHours,
    bytes: backup?.lastSuccessBytes ?? null,
    lastRunOk: backup?.lastRunOk ?? null,
    errorCode: backup?.lastRunErrorCode ?? null,
    offsite: backup?.offsite ?? null,
  };
  // 旧版 Agent 或读不到备份目录时保持未知，不能当作备份正常。
  if (!backup?.available) return securityFinding('database-backup', 'unknown', 'high', evidence);
  if (ageHours == null || ageMs > BACKUP_MAX_AGE_HOURS * 3_600_000) {
    return securityFinding('database-backup', 'fail', 'high', evidence);
  }
  // 最近一次运行失败或异地副本没传上去时，本机仍有可用备份，先预警。
  const healthy = backup.lastRunOk === true && backup.offsite === 'uploaded';
  return securityFinding('database-backup', healthy ? 'pass' : 'warning', healthy ? 'high' : 'medium', evidence);
}

// root 只允许密钥（含仅强制命令）时口令无法被爆破，但仍是 root 直登：降为预警，继续提示改用普通账号。
const KEY_ONLY_ROOT_LOGIN = new Set(['without-password', 'prohibit-password', 'forced-commands-only']);

export function deriveSecurityFindings(snapshot) {
  const findings = [];
  const ssh = snapshot?.ssh || {};
  const rootLoginKeyOnly = KEY_ONLY_ROOT_LOGIN.has(ssh.permitRootLogin);
  findings.push(
    securityFinding(
      'ssh-root-login',
      !ssh.available ? 'unknown' : ssh.permitRootLogin === 'no' ? 'pass' : rootLoginKeyOnly ? 'warning' : 'fail',
      rootLoginKeyOnly ? 'medium' : 'high',
      { value: ssh.permitRootLogin || null },
    ),
    securityFinding(
      'ssh-password-authentication',
      !ssh.available || ssh.passwordAuthentication == null ? 'unknown' : ssh.passwordAuthentication ? 'fail' : 'pass',
      'high',
      { value: ssh.passwordAuthentication ?? null },
    ),
    securityFinding(
      'ssh-public-key-authentication',
      !ssh.available || ssh.publicKeyAuthentication == null ? 'unknown' : ssh.publicKeyAuthentication ? 'pass' : 'fail',
      'high',
      { value: ssh.publicKeyAuthentication ?? null },
    ),
  );
  findings.push(
    securityFinding(
      'firewall',
      !snapshot?.firewall?.available ? 'unknown' : snapshot.firewall.state === 'enabled' ? 'pass' : 'fail',
      'high',
      { provider: snapshot?.firewall?.provider || null, value: snapshot?.firewall?.state || 'unknown' },
    ),
    securityFinding(
      'fail2ban',
      !snapshot?.fail2ban?.available ? 'unknown' : snapshot.fail2ban.state === 'enabled' ? 'pass' : 'fail',
      'medium',
      { value: snapshot?.fail2ban?.installed === false ? 'not-installed' : snapshot?.fail2ban?.state || 'unknown' },
    ),
  );
  const securityUpdates = snapshot?.updates?.security;
  findings.push(
    securityFinding(
      'security-updates',
      !snapshot?.updates?.available || securityUpdates == null ? 'unknown' : securityUpdates > 0 ? 'fail' : 'pass',
      'high',
      { pending: snapshot?.updates?.pending ?? null, security: securityUpdates ?? null },
    ),
  );
  const allowedPublicPorts = new Set([80, 443, Number(ssh.port || 22)]);
  const nonStandardPublicPorts = (snapshot?.listeningPorts || []).filter(
    (item) => item.exposure === 'public' && !allowedPublicPorts.has(Number(item.port)),
  );
  // 绑定所有地址但被主机防火墙拦截或仅放行指定来源的端口不算公网暴露；
  // 旧版 Agent 未标注防火墙结论时按可能暴露处理。
  const isFirewallFiltered = (item) => item.firewall === 'blocked' || item.firewall === 'restricted';
  const unexpectedPublicPorts = nonStandardPublicPorts.filter((item) => !isFirewallFiltered(item));
  const internalPorts = new Set([3000, 3306, 6379, 9001]);
  const portLabel = (item) => `${item.protocol}/${item.port}`;
  findings.push(
    securityFinding(
      'unexpected-public-ports',
      unexpectedPublicPorts.length ? 'fail' : 'pass',
      unexpectedPublicPorts.some((item) => internalPorts.has(Number(item.port))) ? 'high' : 'medium',
      {
        ports: unexpectedPublicPorts.map(portLabel).slice(0, 20),
        firewallFilteredPorts: nonStandardPublicPorts.filter(isFirewallFiltered).map(portLabel).slice(0, 20),
      },
    ),
  );
  const failures24h = ssh.failures24h;
  findings.push(
    securityFinding(
      'ssh-login-failures',
      failures24h == null ? 'unknown' : failures24h >= 50 ? 'fail' : 'pass',
      'medium',
      { failures24h: failures24h ?? null, successes24h: ssh.successes24h ?? null },
    ),
  );
  findings.push(backupFinding(snapshot));
  return findings;
}

export function deriveInfraDiagnostics({ dashboard, services, storage, security }, sources = []) {
  const checks = [];
  const metrics = dashboard?.metrics || {};
  const rootMount = (storage?.mounts || []).find((item) => item?.mountPoint === '/') || storage?.mounts?.[0] || null;
  const serviceItems = Array.isArray(services?.services) ? services.services : [];
  const unavailableDomains = new Set(
    sources.filter((item) => item.state !== 'available').map((item) => String(item.domain)),
  );

  checks.push(
    diagnosticCheck(
      'system.cpu',
      'overview',
      unavailableDomains.has('overview') ? 'unknown' : thresholdState(metrics?.cpu?.percent, 75, 90),
      'high',
      { percent: Number.isFinite(metrics?.cpu?.percent) ? metrics.cpu.percent : null },
      { module: 'overview' },
    ),
    diagnosticCheck(
      'system.memory',
      'overview',
      unavailableDomains.has('overview') ? 'unknown' : thresholdState(metrics?.memory?.percent, 80, 90),
      'high',
      {
        percent: Number.isFinite(metrics?.memory?.percent) ? metrics.memory.percent : null,
        usedBytes: Number.isFinite(metrics?.memory?.usedBytes) ? metrics.memory.usedBytes : null,
        totalBytes: Number.isFinite(metrics?.memory?.totalBytes) ? metrics.memory.totalBytes : null,
      },
      { module: 'overview' },
    ),
    diagnosticCheck(
      'storage.capacity',
      'storage',
      unavailableDomains.has('storage') ? 'unknown' : thresholdState(rootMount?.percent, 80, 90),
      'high',
      {
        mountPoint: rootMount?.mountPoint || null,
        percent: Number.isFinite(rootMount?.percent) ? rootMount.percent : null,
        freeBytes: Number.isFinite(rootMount?.freeBytes) ? rootMount.freeBytes : null,
      },
      { module: 'storage' },
    ),
    diagnosticCheck(
      'storage.inodes',
      'storage',
      unavailableDomains.has('storage') ? 'unknown' : thresholdState(rootMount?.inodePercent, 80, 90),
      'medium',
      {
        mountPoint: rootMount?.mountPoint || null,
        percent: Number.isFinite(rootMount?.inodePercent) ? rootMount.inodePercent : null,
        freeInodes: Number.isFinite(rootMount?.freeInodes) ? rootMount.freeInodes : null,
      },
      { module: 'storage' },
    ),
    diagnosticCheck(
      'storage.ioBusy',
      'storage',
      unavailableDomains.has('storage') ? 'unknown' : thresholdState(storage?.io?.busyPercent, 70, 90),
      'medium',
      { percent: Number.isFinite(storage?.io?.busyPercent) ? storage.io.busyPercent : null },
      { module: 'storage' },
    ),
  );

  const unhealthyServices = serviceItems.filter((item) => item?.state !== 'running').map((item) => item.id);
  checks.push(
    diagnosticCheck(
      'services.health',
      'services',
      unavailableDomains.has('services') || !serviceItems.length
        ? 'unknown'
        : unhealthyServices.length
          ? 'fail'
          : 'pass',
      'high',
      { total: serviceItems.length, unhealthy: unhealthyServices.slice(0, 20) },
      {
        module: 'services',
        ...(unhealthyServices.length === 1 ? { serviceId: unhealthyServices[0] } : {}),
      },
    ),
  );

  const securityFindings = security ? deriveSecurityFindings(security) : [];
  for (const finding of securityFindings) {
    checks.push(
      diagnosticCheck(`security.${finding.id}`, 'security', finding.state, finding.severity, finding.evidence, {
        module: 'security',
        findingId: finding.id,
      }),
    );
  }
  if (unavailableDomains.has('security')) {
    checks.push(diagnosticCheck('security.snapshot', 'security', 'unknown', 'high', {}, { module: 'security' }));
  }

  for (const source of sources) {
    if (source.state !== 'available' || !Number(source.collectionErrorCount || 0)) continue;
    checks.push(
      diagnosticCheck(
        `collection.${source.domain}`,
        source.domain,
        'unknown',
        'medium',
        { count: Number(source.collectionErrorCount) },
        { module: source.domain },
      ),
    );
  }

  const availableCapturedAt = sources
    .filter((item) => item.state === 'available' && item.capturedAt)
    .map((item) => new Date(item.capturedAt).getTime())
    .filter(Number.isFinite);
  return {
    capturedAt: availableCapturedAt.length ? new Date(Math.max(...availableCapturedAt)).toISOString() : null,
    ...summarizeDiagnosticChecks(checks),
    checks,
    sources,
  };
}

/** 计数与整体状态只看未静默的检查项；静默项单独计数，诊断页、概览和告警口径一致。 */
export function summarizeDiagnosticChecks(checks) {
  const visible = checks.filter((item) => !item.silence);
  const summary = {
    failed: visible.filter((item) => item.state === 'fail').length,
    warning: visible.filter((item) => item.state === 'warning').length,
    passed: visible.filter((item) => item.state === 'pass').length,
    unknown: visible.filter((item) => item.state === 'unknown').length,
    silenced: checks.length - visible.length,
  };
  const status = summary.failed > 0 ? 'critical' : summary.warning > 0 || summary.unknown > 0 ? 'attention' : 'healthy';
  return { status, summary };
}

/**
 * 采集 Host Agent 四个域的快照并推导诊断。单个域失败只标为不可用，不中断其他域；
 * 失败日志交给调用方决定，后台告警按分钟评估时不应在 Agent 离线期间刷屏。
 */
export async function loadInfraDiagnostics({ onSourceError } = {}) {
  const definitions = [
    ['overview', () => getHostAgentDashboard()],
    ['services', () => getHostAgentServices()],
    ['storage', () => getHostAgentStorage()],
    ['security', () => getHostAgentSecurity()],
  ];
  const settled = await Promise.allSettled(definitions.map(([, loader]) => loader()));
  const snapshots = {};
  const sources = settled.map((result, index) => {
    const domain = definitions[index][0];
    if (result.status === 'fulfilled') {
      snapshots[domain === 'overview' ? 'dashboard' : domain] = result.value;
      return {
        domain,
        state: 'available',
        capturedAt: result.value?.capturedAt || result.value?.sampledAt || null,
        collectionErrorCount: Array.isArray(result.value?.collectionErrors)
          ? result.value.collectionErrors.length
          : Array.isArray(result.value?.metrics?.collectionErrors)
            ? result.value.metrics.collectionErrors.length
            : 0,
      };
    }
    const code = diagnosticSourceErrorCode(result.reason);
    onSourceError?.(domain, code);
    return {
      domain,
      state: 'unavailable',
      capturedAt: null,
      collectionErrorCount: 0,
      code,
    };
  });
  return deriveInfraDiagnostics(snapshots, sources);
}
