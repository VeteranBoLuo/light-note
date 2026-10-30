/**
 * 年度报告前后端共用契约：开放窗口、章节键与称号规则键。
 *
 * - 开放与入口截止使用绝对时刻，与功能上新提示一致；年度边界和数据截止日由服务端按账号时区计算。
 * - 章节门槛与称号判定只在服务端执行，前端按返回的键渲染，文案由 i18n 映射。
 */

export const ANNUAL_REPORT_CHAPTERS = Object.freeze([
  'cover',
  'overview',
  'rhythm',
  'notes',
  'bookmarks',
  'keywords',
  'time',
  'action',
  'poster',
]);

/** 少数据账号只展示封面、实际记录与海报。 */
export const ANNUAL_REPORT_LIGHT_CHAPTERS = Object.freeze(['cover', 'overview', 'poster']);

export const ANNUAL_REPORT_RECORD_TYPES = Object.freeze(['bookmark', 'note', 'file', 'todo', 'organize']);

/** 称号 = 时间修饰（可空）+ 占比最高记录类型对应的名词。 */
export const ANNUAL_REPORT_TITLE_MODIFIERS = Object.freeze(['night', 'morning', 'weekend', 'steady']);

export const ANNUAL_REPORTS = Object.freeze({
  2026: Object.freeze({
    year: 2026,
    announcementId: 'annual-report-2026',
    achievementKey: 'annual_review_2026',
    // 普通账号的开放时刻；Root 与测试账号可提前查看用于线上验收。
    openFrom: '2026-12-15T00:00:00.000+08:00',
    // 入口（成长中心按钮、「今日」入口行）截止；报告页本身长期可访问。
    entryUntil: '2027-02-01T00:00:00.000+08:00',
    // 站内通知只在这几天的 10:00 检查发送，服务重启后次日补发，同一账号最多一次。
    noticeFrom: '2026-12-15T00:00:00.000+08:00',
    noticeUntil: '2026-12-22T00:00:00.000+08:00',
  }),
});

function toTimestamp(now) {
  return now instanceof Date ? now.getTime() : Number(now);
}

export function getAnnualReportDefinition(year) {
  const key = Number(year);
  return Number.isInteger(key) ? ANNUAL_REPORTS[key] || null : null;
}

export function isAnnualReportOpen(definition, now = Date.now()) {
  if (!definition) return false;
  const timestamp = toTimestamp(now);
  const openFrom = Date.parse(definition.openFrom);
  return Number.isFinite(timestamp) && Number.isFinite(openFrom) && timestamp >= openFrom;
}

export function isAnnualReportEntryWindow(definition, now = Date.now()) {
  if (!definition) return false;
  const timestamp = toTimestamp(now);
  const entryUntil = Date.parse(definition.entryUntil);
  return isAnnualReportOpen(definition, now) && Number.isFinite(entryUntil) && timestamp < entryUntil;
}

export function isAnnualReportNoticeWindow(definition, now = Date.now()) {
  if (!definition) return false;
  const timestamp = toTimestamp(now);
  const from = Date.parse(definition.noticeFrom);
  const until = Date.parse(definition.noticeUntil);
  return Number.isFinite(timestamp) && Number.isFinite(from) && Number.isFinite(until) && timestamp >= from && timestamp < until;
}
