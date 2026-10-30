import type { InfraCheckSilence } from '@/api/infraApi';
import { formatAdminDateTime } from '@/utils/adminDateTime';

type Translate = (key: string, named?: Record<string, unknown>) => string;

/** 诊断检查项 ID 与安全检查项 ID 的对应：security.<findingId>，security.snapshot 不是检查项。 */
export function securityFindingIdOf(checkId: string) {
  return checkId.startsWith('security.') && checkId !== 'security.snapshot' ? checkId.slice(9) : '';
}

function checkTextKey(checkId: string, field: 'title' | 'recommendation') {
  const findingId = securityFindingIdOf(checkId);
  if (findingId) return `serverManagement.securityPage.findings.${findingId}.${field}`;
  return `serverManagement.diagnosticsPage.checks.${checkId.startsWith('collection.') ? 'collection' : checkId}.${field}`;
}

export function infraCheckTitle(t: Translate, checkId: string) {
  return t(checkTextKey(checkId, 'title'));
}

export function infraCheckRecommendation(t: Translate, checkId: string) {
  return t(checkTextKey(checkId, 'recommendation'));
}

export function silenceRemainingDays(silence: InfraCheckSilence, now = Date.now()) {
  return Math.max(1, Math.ceil((new Date(silence.until).getTime() - now) / 86_400_000));
}

/** 操作者 · 静默时间 · 到期时间（剩余天数），诊断页与安全检查页共用同一口径。 */
export function silenceMetaText(t: Translate, locale: string, silence: InfraCheckSilence, now = Date.now()) {
  const format = (value: string) => formatAdminDateTime(value, locale, { includeSeconds: false });
  return t('serverManagement.diagnosticsPage.silence.meta', {
    actor: silence.actorAlias || silence.actorUserId,
    createdAt: format(silence.createdAt),
    until: format(silence.until),
    days: silenceRemainingDays(silence, now),
  });
}
