import type { InfraCheckSilence } from '@/api/infraApi';
import { formatAdminDateTime } from '@/utils/adminDateTime';
import { formatBytes } from './serverManagementFormat';

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

function backupAge(t: Translate, hours: number) {
  if (hours < 1) return t('serverManagement.securityPage.backupEvidence.lessThanHour');
  return hours < 48
    ? t('serverManagement.securityPage.backupEvidence.hours', { count: Math.floor(hours) })
    : t('serverManagement.securityPage.backupEvidence.days', { count: Math.floor(hours / 24) });
}

/** 数据库备份检查项的证据：最近一次成功距今多久、大小、最近运行是否失败、异地副本状态。 */
export function backupEvidenceText(t: Translate, evidence: Record<string, unknown>) {
  const ageHours = typeof evidence.ageHours === 'number' ? evidence.ageHours : null;
  const offsite = ['uploaded', 'failed', 'skipped'].includes(String(evidence.offsite))
    ? String(evidence.offsite)
    : 'unknown';
  return [
    ageHours == null
      ? t('serverManagement.securityPage.backupEvidence.never')
      : t('serverManagement.securityPage.backupEvidence.lastSuccess', {
          age: backupAge(t, ageHours),
          size: formatBytes(evidence.bytes),
        }),
    evidence.lastRunOk === false
      ? t('serverManagement.securityPage.backupEvidence.lastRunFailed', { code: evidence.errorCode || '—' })
      : '',
    t(`serverManagement.securityPage.backupEvidence.offsite.${offsite}`),
  ]
    .filter(Boolean)
    .join(' · ');
}
