export const SECURITY_HANDLED_STATUSES = ['unhandled', 'processed', 'false_positive', 'authorized_test'];

const RISK_EXCLUDED_STATUSES = new Set(['false_positive', 'authorized_test']);

export const excludesSecurityEventRisk = (handledStatus) => RISK_EXCLUDED_STATUSES.has(handledStatus);
