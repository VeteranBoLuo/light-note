export const SECURITY_HANDLED_STATUSES = ['unhandled', 'processed', 'false_positive', 'authorized_test'];

const STATUS_ALIASES = {
  confirmed: 'processed',
  resolved: 'processed',
  ignored: 'processed',
  processed: 'processed',
  false_positive: 'false_positive',
  authorized_test: 'authorized_test',
  unhandled: 'unhandled',
};

const RISK_EXCLUDED_STATUSES = new Set(['false_positive', 'authorized_test']);

export const normalizeSecurityHandledStatus = (handledStatus = 'processed') => STATUS_ALIASES[handledStatus];

export const excludesSecurityEventRisk = (handledStatus) => RISK_EXCLUDED_STATUSES.has(handledStatus);

export const securityHandledStatusSuccessMessage = (handledStatus) => {
  if (handledStatus === 'false_positive') return '已标记误报，风险影响已排除';
  if (handledStatus === 'authorized_test') return '已标记授权测试，风险影响已排除';
  return '处理状态已更新';
};
