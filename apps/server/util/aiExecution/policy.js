export const AI_EXECUTION_BILLING_RULE_VERSION = 3;
export const AI_EXECUTION_VALIDATION_RULE_VERSION = 2;
export const AI_EXECUTION_LEASE_MS = 60 * 60 * 1000;
export const AI_EXECUTION_LEASE_RENEW_WINDOW_MS = 15 * 60 * 1000;

export function aiExecutionLeaseExpiry(now = Date.now(), leaseMs = AI_EXECUTION_LEASE_MS) {
  const base = Number(now);
  const duration = Math.max(60_000, Math.floor(Number(leaseMs) || AI_EXECUTION_LEASE_MS));
  return new Date((Number.isFinite(base) ? base : Date.now()) + duration);
}
