import { summarizeDiagnosticChecks } from './infraDiagnostics.js';

// 只能静默资源阈值与安全检查；服务故障、Agent 离线和采集异常必须持续可见并告警。
const SILENCEABLE_CHECK_IDS = new Set([
  'system.cpu',
  'system.memory',
  'storage.capacity',
  'storage.inodes',
  'storage.ioBusy',
  'security.ssh-root-login',
  'security.ssh-password-authentication',
  'security.ssh-public-key-authentication',
  'security.firewall',
  'security.fail2ban',
  'security.security-updates',
  'security.unexpected-public-ports',
  'security.ssh-login-failures',
]);

// 不提供永久静默，到期后仍异常会再提醒一次，避免静默后被遗忘。
export const SILENCE_DURATION_DAYS = Object.freeze([1, 7, 30]);
const SILENCED_STATES = new Set(['fail', 'warning']);

export function isSilenceableCheckId(checkId) {
  return SILENCEABLE_CHECK_IDS.has(String(checkId || ''));
}

/** 静默只遮住仍处于异常或预警的检查项；已到期、已恢复或状态未知时照常显示与计数。 */
export function isSilenceActive(silence, state, now) {
  return Boolean(silence) && SILENCED_STATES.has(state) && new Date(silence.silencedUntil) > now;
}

function silenceView(silence) {
  return {
    reason: silence.reason,
    until: new Date(silence.silencedUntil).toISOString(),
    createdAt: new Date(silence.createdAt).toISOString(),
    actorUserId: silence.createdBy,
    actorAlias: silence.actorAlias || null,
  };
}

export function applyDiagnosticSilences(diagnostics, silences, now = new Date()) {
  const byCheckId = new Map(silences.map((item) => [item.checkId, item]));
  const checks = diagnostics.checks.map((check) => {
    const silence = byCheckId.get(check.id);
    return {
      ...check,
      silenceable: isSilenceableCheckId(check.id),
      silence: isSilenceActive(silence, check.state, now) ? silenceView(silence) : null,
    };
  });
  return { ...diagnostics, ...summarizeDiagnosticChecks(checks), checks };
}

export function applyFindingSilences(findings, silences, now = new Date()) {
  const byCheckId = new Map(silences.map((item) => [item.checkId, item]));
  return findings.map((finding) => {
    const silence = byCheckId.get(`security.${finding.id}`);
    return { ...finding, silence: isSilenceActive(silence, finding.state, now) ? silenceView(silence) : null };
  });
}

/**
 * 告警评估每分钟推进一次静默生命周期（纯函数）：
 * 连续恢复达到阈值即自动解除；到期时仍异常或预警则解除并补发一次提醒；状态未知时不做判断。
 * suppressed 是本轮仍在静默期内的检查项，其开启与恢复告警都不投递。
 */
export function evaluateSilenceLifecycle(silences, diagnostics, now, { resolveAfter }) {
  const states = new Map((diagnostics?.checks || []).map((check) => [check.id, check.state]));
  const suppressed = new Set();
  const streakUpdates = [];
  const removals = [];
  for (const silence of silences) {
    const state = states.get(silence.checkId) || 'unknown';
    const expired = new Date(silence.silencedUntil) <= now;
    if (!expired) suppressed.add(silence.checkId);
    if (state === 'unknown') continue;
    if (state === 'pass') {
      const passStreak = silence.passStreak + 1;
      if (expired || passStreak >= resolveAfter) removals.push({ silence, remind: false });
      else streakUpdates.push({ silence, passStreak });
      continue;
    }
    if (expired) removals.push({ silence, remind: true, state });
    else if (silence.passStreak) streakUpdates.push({ silence, passStreak: 0 });
  }
  return { suppressed, streakUpdates, removals };
}

function fromDatabaseRow(row) {
  return {
    checkId: row.check_id,
    reason: row.reason,
    silencedUntil: row.silenced_until,
    passStreak: Number(row.pass_streak || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function loadInfraAlertSilences(db, { withActors = false } = {}) {
  const [rows] = await db.query(
    'SELECT check_id, reason, silenced_until, pass_streak, created_by, created_at FROM infra_alert_silences',
  );
  const silences = rows.map(fromDatabaseRow);
  if (!withActors || !silences.length) return silences;
  // 分开查别名，避免两张表的 id 排序规则不同导致 JOIN 报错。
  const [users] = await db.query('SELECT id, alias FROM user WHERE id IN (?)', [
    [...new Set(silences.map((item) => item.createdBy))],
  ]);
  const aliases = new Map(users.map((user) => [String(user.id), user.alias || null]));
  return silences.map((item) => ({ ...item, actorAlias: aliases.get(String(item.createdBy)) || null }));
}

export const UPSERT_SILENCE_SQL = `INSERT INTO infra_alert_silences
  (check_id, reason, silenced_until, pass_streak, created_by, created_at)
  VALUES (?, ?, ?, 0, ?, ?)
  ON DUPLICATE KEY UPDATE reason=VALUES(reason), silenced_until=VALUES(silenced_until), pass_streak=0,
    created_by=VALUES(created_by), created_at=VALUES(created_at)`;
