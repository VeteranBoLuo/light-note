import { createHash } from 'node:crypto';

// 检查不计费；这些间隔只约束真正的模型生成。持久化在原有 facts_json 内，跨进程共享。
export const DAILY_BRIEF_REFRESH_POLICY = Object.freeze({
  normalIntervalMs: 10 * 60_000,
  urgentIntervalMs: 60_000,
  manualIntervalMs: 30_000,
  retryIntervalMs: 15 * 60_000,
  maxAutomaticAttempts: 24,
});

export function parseBriefJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function briefSnapshot(facts, calendar, capturedAt) {
  const factRevisions = Object.fromEntries(facts.map((fact) => [fact.id, digest(fact)]));
  return {
    capturedAt,
    factRevisions,
    fingerprint: digest([2, calendar.date, calendar.timezone, calendar.locale, factRevisions]),
  };
}

export function briefFreshness({ row, facts, calendar, preference, now, automatic = true }) {
  const brief = parseBriefJson(row?.briefJson ?? row?.brief_json);
  const attempt = parseBriefJson(row?.factsJson ?? row?.facts_json, {});
  const pendingFacts = row?.status === 'generating' && !Array.isArray(attempt) ? attempt?.facts : null;
  const snapshot = facts || pendingFacts ? briefSnapshot(facts || pendingFacts, calendar, now.toISOString()) : null;
  const previous = brief?.snapshot;
  const staleFactIds = snapshot
    ? Object.keys(snapshot.factRevisions).filter((id) => snapshot.factRevisions[id] !== previous?.factRevisions?.[id])
    : [];
  const stale = Boolean(brief && snapshot && snapshot.fingerprint !== previous?.fingerprint);
  const generating = row?.status === 'generating' && !Number(row.leaseExpired ?? row.lease_expired ?? 0);
  const failed = row?.status === 'failed' || (row?.status === 'generating' && !generating);
  const lastAttempt = Date.parse(attempt?.attemptedAt || '') || 0;
  const oldFacts = Array.isArray(attempt) ? attempt : attempt?.facts || [];
  const quotaBlocked = /^AI_QUOTA_(EXCEEDED|INSUFFICIENT_FOR_REQUEST)$/.test(
    row?.lastErrorCode ?? row?.last_error_code ?? '',
  );
  // 待办变化与治理队列减少会直接让旧行动建议失效，优先更新；仍合并短时间内的连续操作。
  const urgent = staleFactIds.some(
    (id) =>
      id.startsWith('todo_') ||
      (id.startsWith('organize_') &&
        Number(facts?.find((fact) => fact.id === id)?.count) < Number(oldFacts.find((fact) => fact.id === id)?.count)),
  );
  const interval = !automatic
    ? DAILY_BRIEF_REFRESH_POLICY.manualIntervalMs
    : failed
      ? DAILY_BRIEF_REFRESH_POLICY.retryIntervalMs
      : urgent
        ? DAILY_BRIEF_REFRESH_POLICY.urgentIntervalMs
        : DAILY_BRIEF_REFRESH_POLICY.normalIntervalMs;
  let pauseReason = null;
  if (automatic && preference.autoUpdate === false) pauseReason = 'manual';
  else if (automatic && quotaBlocked) pauseReason = 'quota';
  else if (automatic && Number(attempt?.automaticAttempts || 0) >= DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts)
    pauseReason = 'budget';
  const needsUpdate = !brief || stale || failed;
  const nextRefreshAt =
    lastAttempt && now.getTime() < lastAttempt + interval ? new Date(lastAttempt + interval).toISOString() : null;
  return {
    autoUpdate: preference.autoUpdate !== false,
    checkedAt: facts ? now.toISOString() : null,
    dataAsOf: previous?.capturedAt || null,
    stale,
    staleFactIds,
    pauseReason,
    nextRefreshAt,
    shouldGenerate: Boolean(snapshot && needsUpdate && !generating && !pauseReason && !nextRefreshAt),
  };
}
