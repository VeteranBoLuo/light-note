import type { InjectionKey, Ref } from 'vue';

// Tab config
export const securityTabs = [
  { key: 'overview', routeName: 'securityCenterOverview', label: '威胁总览' },
  { key: 'events', routeName: 'securityCenterEvents', label: '攻击日志' },
  { key: 'ips', routeName: 'securityCenterIps', label: 'IP画像' },
  { key: 'accountBans', routeName: 'securityCenterAccountBans', label: '账号封禁' },
  { key: 'accountReputation', routeName: 'securityCenterAccountReputation', label: '账号画像' },
  { key: 'rules', routeName: 'securityCenterRules', label: '规则库' },
] as const;

export type SecurityTabKey = (typeof securityTabs)[number]['key'];

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
      ignored: '已处理',
      resolved: '已处理',
    }[status] || status
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
  { title: '时间', dataIndex: 'createdAt', ellipsis: true, width: 165 },
  { title: '等级', dataIndex: 'severity', width: 82 },
  { title: '分数', dataIndex: 'threatScore', width: 120 },
  { title: '类型', dataIndex: 'attackType', ellipsis: true, width: 135 },
  { title: '用户昵称', dataIndex: 'user', ellipsis: true, width: 130 },
  { title: '来源IP', dataIndex: 'sourceIp', ellipsis: true, width: 145 },
  { title: '接口', dataIndex: 'requestPath', ellipsis: true, width: 220 },
  { title: '拦截', dataIndex: 'blocked', width: 82 },
  { title: '状态', dataIndex: 'handledStatus', width: 95 },
];

export const typeColumns = [
  { title: '攻击类型', dataIndex: 'attackType' },
  { title: '数量', dataIndex: 'total', width: 90 },
];

export const trendColumns = [
  { title: '时间', dataIndex: 'time' },
  { title: '事件', dataIndex: 'total', width: 90 },
  { title: '拦截', dataIndex: 'blocked', width: 90 },
];

export const topIpColumns = [
  { title: 'IP', dataIndex: 'sourceIp' },
  { title: '次数', dataIndex: 'total', width: 80 },
  { title: '最高分', dataIndex: 'maxScore', width: 90 },
];

export const topPathColumns = [
  { title: '接口', dataIndex: 'requestPath', ellipsis: true },
  { title: '次数', dataIndex: 'total', width: 80 },
  { title: '最高分', dataIndex: 'maxScore', width: 90 },
];

export const recentColumns = [
  { title: '时间', dataIndex: 'createdAt', ellipsis: true },
  { title: '类型', dataIndex: 'attackType', ellipsis: true },
  { title: 'IP', dataIndex: 'sourceIp', ellipsis: true },
  { title: '分数', dataIndex: 'threatScore', width: 80 },
  { title: '动作', dataIndex: 'actionTaken', width: 80 },
];

export const ipColumns = [
  { title: 'IP', dataIndex: 'ip', ellipsis: true },
  { title: '风险分', dataIndex: 'riskScore', width: 140 },
  { title: '攻击次数', dataIndex: 'totalAttacks', width: 100 },
  { title: '高危', dataIndex: 'highRiskCount', width: 80 },
  { title: '严重', dataIndex: 'criticalCount', width: 80 },
  { title: '状态', dataIndex: 'isBanned', width: 90 },
  { title: '最近攻击', dataIndex: 'lastAttackTime', ellipsis: true },
  { title: '操作', dataIndex: 'action', width: 90 },
];

export const accountColumns = [
  { title: '账号', dataIndex: 'account', ellipsis: true },
  { title: '角色', dataIndex: 'role', width: 90 },
  { title: '风险分', dataIndex: 'riskScore', width: 140 },
  { title: '封禁原因', dataIndex: 'banReason', ellipsis: true },
  { title: '封禁时间', dataIndex: 'bannedAt', ellipsis: true, width: 160 },
  { title: '操作', dataIndex: 'action', width: 110 },
];

export const accountRepColumns = [
  { title: '账号', dataIndex: 'account', ellipsis: true, width: 200 },
  { title: '角色', dataIndex: 'role', width: 80 },
  { title: '风险分', dataIndex: 'riskScore', width: 140 },
  { title: '事件次数', dataIndex: 'totalEvents', width: 90 },
  { title: '高危', dataIndex: 'highRiskCount', width: 70 },
  { title: '严重', dataIndex: 'criticalCount', width: 70 },
  { title: '状态', dataIndex: 'delFlag', width: 80 },
  { title: '最近事件', dataIndex: 'lastEventAt', ellipsis: true, width: 160 },
  { title: '操作', dataIndex: 'action', width: 100 },
];

export const ruleColumns = [
  { title: '规则', dataIndex: 'ruleName', ellipsis: true },
  { title: '类型', dataIndex: 'attackType', width: 160 },
  { title: '等级', dataIndex: 'severity', width: 100 },
  { title: '基础分', dataIndex: 'baseScore', width: 90 },
  { title: '置信度', dataIndex: 'confidence', width: 90 },
  { title: '动作', dataIndex: 'action', width: 90 },
  { title: '状态', dataIndex: 'enabled', width: 90 },
];

export const ipRecentColumns = [
  { title: '时间', dataIndex: 'createdAt', ellipsis: true },
  { title: '类型', dataIndex: 'attackType', ellipsis: true },
  { title: '等级', dataIndex: 'severity', width: 90 },
  { title: '分数', dataIndex: 'threatScore', width: 80 },
];

export const ipAccountColumns = [
  { title: '账号', dataIndex: 'account', ellipsis: true },
  { title: '状态', dataIndex: 'delFlag', width: 90 },
  { title: '安全事件', dataIndex: 'securityEvents', width: 90 },
  { title: '访问次数', dataIndex: 'apiRequests', width: 90 },
  { title: '最近出现', dataIndex: 'lastSeenAt', ellipsis: true, width: 160 },
  { title: '来源', dataIndex: 'sources', ellipsis: true, width: 110 },
  { title: '操作', dataIndex: 'action', width: 100 },
];
