import { createHash } from 'node:crypto';
import { ADVICE_POLICY_VERSION } from './dailyBriefAdvice.js';

// 检查不计费；这些间隔只约束真正的模型生成。持久化在原有 facts_json 内，跨进程共享。
export const DAILY_BRIEF_REFRESH_POLICY = Object.freeze({
  normalIntervalMs: 10 * 60_000,
  manualIntervalMs: 30_000,
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
    fingerprint: digest([13, ADVICE_POLICY_VERSION, calendar.date, calendar.timezone, calendar.locale, factRevisions]),
  };
}

// 旧版等待记录可能已覆盖最后一次结果。只恢复未执行的判断，失败不能自动重放。
export function needsAdviceResultRecovery(brief) {
  return brief?.adviceStatus === 'deferred' && !brief.lastAdviceResult && !brief.adviceResultVersion;
}

export function briefFreshness({ row, facts, calendar, preference, now, automatic = true }) {
  const brief = parseBriefJson(row?.briefJson ?? row?.brief_json);
  const attempt = parseBriefJson(row?.factsJson ?? row?.facts_json, {});
  const pendingFacts = row?.status === 'generating' && !Array.isArray(attempt) ? attempt?.facts : null;
  const snapshot = facts || pendingFacts ? briefSnapshot(facts || pendingFacts, calendar, now.toISOString()) : null;
  const previous = brief?.snapshot;
  const staleFactIds = snapshot
    ? [...new Set([...Object.keys(snapshot.factRevisions), ...Object.keys(previous?.factRevisions || {})])].filter(
        (id) => snapshot.factRevisions[id] !== previous?.factRevisions?.[id],
      )
    : [];
  const stale = Boolean(brief && snapshot && snapshot.fingerprint !== previous?.fingerprint);
  const generating = row?.status === 'generating' && !Number(row.leaseExpired ?? row.lease_expired ?? 0);
  const failed = row?.status === 'failed' || (row?.status === 'generating' && !generating);
  // 事实刷新不等待模型冷却或额度；是否调用模型另在生成入口按原尝试预算判断。
  const pauseReason = automatic && preference.autoUpdate === false ? 'manual' : null;
  const interval = automatic
    ? DAILY_BRIEF_REFRESH_POLICY.normalIntervalMs
    : DAILY_BRIEF_REFRESH_POLICY.manualIntervalMs;
  const lastAttempt = Math.max(
    Date.parse(attempt.attemptedAt || '') || 0,
    Date.parse(brief?.adviceAttemptedAt || '') || 0,
  );
  const recovery = needsAdviceResultRecovery(brief);
  const deferredAt =
    recovery || brief?.adviceDeferred
      ? lastAttempt + (recovery ? DAILY_BRIEF_REFRESH_POLICY.manualIntervalMs : interval)
      : null;
  const retryAdvice =
    !automatic &&
    brief?.adviceStatus === 'failed' &&
    now.getTime() - (Date.parse(attempt.attemptedAt || '') || 0) >= interval;
  const needsUpdate = !brief || stale || failed || retryAdvice || (deferredAt !== null && now.getTime() >= deferredAt);
  return {
    autoUpdate: preference.autoUpdate !== false,
    checkedAt: facts ? now.toISOString() : null,
    dataAsOf: previous?.capturedAt || null,
    stale,
    staleFactIds,
    pauseReason,
    nextRefreshAt: deferredAt !== null ? new Date(deferredAt).toISOString() : null,
    shouldGenerate: Boolean(snapshot && needsUpdate && !generating && !pauseReason),
  };
}
