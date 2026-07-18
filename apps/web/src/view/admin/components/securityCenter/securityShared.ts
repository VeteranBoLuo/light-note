import type { InjectionKey, Ref } from 'vue';

// Tab config
export const securityTabs = [
  { key: 'overview', routeName: 'securityCenterOverview', label: '威胁总览' },
  { key: 'events', routeName: 'securityCenterEvents', label: '攻击日志' },
  { key: 'ips', routeName: 'securityCenterIps', label: 'IP画像' },
  { key: 'accountReputation', routeName: 'securityCenterAccountReputation', label: '账号画像' },
  { key: 'whitelist', routeName: 'securityCenterWhitelist', label: '白名单' },
  { key: 'rules', routeName: 'securityCenterRules', label: '规则库' },
] as const;

export type SecurityTabKey = (typeof securityTabs)[number]['key'];

export type SecurityHandledStatus = 'unhandled' | 'processed' | 'false_positive' | 'authorized_test';

export const securityHandledStatusOptions: Array<{ value: SecurityHandledStatus; label: string }> = [
  { value: 'unhandled', label: '未处理' },
  { value: 'processed', label: '已处理' },
  { value: 'false_positive', label: '误报' },
  { value: 'authorized_test', label: '授权测试' },
];

export function excludesSecurityEventRisk(status: string) {
  return status === 'false_positive' || status === 'authorized_test';
}

export function securityHandledStatusConfirmText(status: SecurityHandledStatus, total = 1) {
  const target = total > 1 ? `选中的 ${total} 条攻击日志` : '这条攻击日志';
  if (status === 'false_positive') {
    return `确认将${target}标记为误报？日志证据会保留，对应的 IP 和账号风险影响会被回滚。`;
  }
  if (status === 'authorized_test') {
    return `确认将${target}标记为授权测试？日志证据和拦截结果会保留，但不会计入 IP 和账号风险。`;
  }
  if (status === 'unhandled') {
    return `确认将${target}改为未处理？如果此前标记为误报或授权测试，对应风险将重新计入。`;
  }
  return `确认将${target}标记为已处理？如果此前标记为误报或授权测试，对应风险将重新计入。`;
}

export function getRouteTab(routeName: string | symbol | undefined | null): SecurityTabKey {
  return securityTabs.find((tab) => tab.routeName === routeName)?.key || 'overview';
}

// Utility functions
export function severityColor(severity: string) {
  return { low: 'blue', medium: 'orange', high: 'volcano', critical: 'red' }[severity] || 'default';
}

export function scoreColor(score: number) {
  if (score >= 80) return 'var(--security-critical)';
  if (score >= 50) return 'var(--security-high)';
  if (score >= 20) return 'var(--security-medium)';
  return 'var(--security-low)';
}

export function statusText(status: string) {
  return (
    {
      unhandled: '未处理',
      processed: '已处理',
      confirmed: '已处理',
      false_positive: '误报',
      authorized_test: '授权测试',
      ignored: '已处理',
      resolved: '已处理',
    }[status] || status
  );
}

export function statusPillClass(status: string) {
  return (
    {
      unhandled: 'is-unhandled',
      processed: 'is-processed',
      confirmed: 'is-processed',
      false_positive: 'is-false-positive',
      authorized_test: 'is-authorized-test',
      ignored: 'is-processed',
      resolved: 'is-processed',
    }[status] || 'is-neutral'
  );
}

export function eventUserText(record: any) {
  return record.alias || record.email || record.userId || '-';
}

export function eventUserTooltip(record: any) {
  const parts = [record.alias, record.email, record.userId].filter(Boolean);
  return parts.length ? parts.join(' / ') : '未识别用户';
}

export function normalizeAccount(account: any) {
  return typeof account === 'string' ? { userId: account } : account || {};
}

// Injection keys
export const OPEN_EVENT_DETAIL: InjectionKey<(eventId: string) => void> = Symbol('openEventDetail');
export const OPEN_IP_ACCOUNTS: InjectionKey<(ip: string) => void> = Symbol('openIpAccounts');
export const NAVIGATE_TO_USER_EVENTS: InjectionKey<(userId: string, userLabel: string) => void> =
  Symbol('navigateToUserEvents');
export const REFRESH_TRIGGER: InjectionKey<Ref<number>> = Symbol('refreshTrigger');
export const BAN_IP: InjectionKey<(ip: string) => void> = Symbol('banIp');
export const UNBAN_IP: InjectionKey<(ip: string) => void> = Symbol('unbanIp');
export const BAN_ACCOUNT: InjectionKey<(account: any) => void> = Symbol('banAccount');
export const UNBAN_ACCOUNT: InjectionKey<(account: any) => void> = Symbol('unbanAccount');

// Table columns
export const eventColumns = [
  { title: '时间', key: 'createdAt', sortable: true },
  { title: '等级', key: 'severity' },
  { title: '分数', key: 'threatScore' },
  { title: '规则', key: 'matchedRule' },
  { title: '用户昵称', key: 'user' },
  { title: '来源IP', key: 'sourceIp' },
  { title: '接口', key: 'requestPath' },
  { title: '拦截', key: 'blocked' },
  { title: '状态', key: 'handledStatus' },
];

export const typeColumns = [
  { title: '攻击类型', key: 'attackType' },
  { title: '数量', key: 'total' },
];

export const trendColumns = [
  { title: '时间', key: 'time' },
  { title: '事件', key: 'total' },
  { title: '拦截', key: 'blocked' },
];

export const topIpColumns = [
  { title: 'IP', key: 'sourceIp' },
  { title: '次数', key: 'total' },
  { title: '最高分', key: 'maxScore' },
];

export const topPathColumns = [
  { title: '接口', key: 'requestPath' },
  { title: '次数', key: 'total' },
  { title: '最高分', key: 'maxScore' },
];

export const recentColumns = [
  { title: '时间', key: 'createdAt' },
  { title: '规则', key: 'matchedRule' },
  { title: 'IP', key: 'sourceIp' },
  { title: '分数', key: 'threatScore' },
  { title: '动作', key: 'actionTaken' },
];

export const ipColumns = [
  { title: 'IP', key: 'ip' },
  { title: '来源地', key: 'city' },
  { title: '风险分', key: 'riskScore' },
  { title: '攻击次数', key: 'totalAttacks' },
  { title: '高危', key: 'highRiskCount' },
  { title: '严重', key: 'criticalCount' },
  { title: '状态', key: 'isBanned' },
  { title: '最近攻击', key: 'lastAttackTime', sortable: true },
  { title: '操作', key: 'action' },
];

export const accountColumns = [
  { title: '账号', key: 'account' },
  { title: '角色', key: 'role' },
  { title: '风险分', key: 'riskScore' },
  { title: '封禁原因', key: 'banReason' },
  { title: '封禁时间', key: 'bannedAt' },
  { title: '操作', key: 'action' },
];

export const accountRepColumns = [
  { title: '账号', key: 'account' },
  { title: '角色', key: 'role' },
  { title: '风险分', key: 'riskScore' },
  { title: '事件次数', key: 'totalEvents' },
  { title: '高危', key: 'highRiskCount' },
  { title: '严重', key: 'criticalCount' },
  { title: '状态', key: 'delFlag' },
  { title: '最近事件', key: 'lastEventAt', sortable: true },
  { title: '操作', key: 'action' },
];

export const ruleColumns = [
  { title: '规则', key: 'ruleName' },
  { title: '类型', key: 'attackType' },
  { title: '等级', key: 'severity' },
  { title: '基础分', key: 'baseScore' },
  { title: '置信度', key: 'confidence' },
  { title: '动作', key: 'action' },
  { title: '状态', key: 'enabled' },
];

export const whitelistColumns = [
  { title: '类型', key: 'targetType', width: '80px' },
  { title: '白名单对象', key: 'targetLabel' },
  { title: '备注', key: 'reason' },
  { title: '状态', key: 'enabled', width: '80px' },
  { title: '创建人', key: 'createdByLabel', width: '120px' },
  { title: '更新时间', key: 'updatedAt', width: '180px', sortable: true },
  { title: '操作', key: 'action', width: '100px' },
];

export const ipRecentColumns = [
  { title: '时间', key: 'createdAt' },
  { title: '规则', key: 'matchedRule', width: '160px' },
  { title: '等级', key: 'severity', width: '80px' },
  { title: '分数', key: 'threatScore', width: '80px' },
];

export const ipAccountColumns = [
  { title: '账号', key: 'account' },
  { title: '状态', key: 'delFlag', width: '60px' },
  { title: '安全事件', key: 'securityEvents', width: '80px' },
  { title: '访问次数', key: 'apiRequests', width: '80px' },
  { title: '最近出现', key: 'lastSeenAt', width: '200px' },
  { title: '来源', key: 'sources', width: '150px' },
  { title: '操作', key: 'action' },
];
