export const GOVERNANCE_RISK = Object.freeze({
  SAFE: 'safe',
  REVIEW: 'review',
  BLOCKED: 'blocked',
});

export const GOVERNANCE_SCOPES = Object.freeze(['image', 'bookmark', 'note', 'file', 'todo', 'account_job']);

export const GOVERNANCE_RULES = Object.freeze({
  LOCAL_IMAGE_UNREFERENCED: Object.freeze({
    issueCode: 'LOCAL_IMAGE_UNREFERENCED',
    resourceType: 'image',
    risk: GOVERNANCE_RISK.SAFE,
    executor: 'localImage',
    minAgeHours: 24,
    minObservations: 2,
    observationGapHours: 24,
    supportsBatch: true,
    revalidate: true,
  }),
  LOCAL_IMAGE_UNSUPPORTED: Object.freeze({
    issueCode: 'LOCAL_IMAGE_UNSUPPORTED',
    resourceType: 'image',
    risk: GOVERNANCE_RISK.BLOCKED,
    minAgeHours: 24,
    supportsBatch: false,
    revalidate: true,
  }),
  OWNER_MISSING: Object.freeze({
    issueCode: 'OWNER_MISSING',
    resourceType: 'business',
    risk: GOVERNANCE_RISK.REVIEW,
    operatorReviewSeverity: 'high',
    ownerStateAware: true,
    invalidOwnerCleanup: true,
    supportsBatch: false,
    revalidate: true,
  }),
  // 历史规则仅用于展示旧扫描结果；del_flag=1 也可能只是管理员停用，禁止继续授权清理。
  SOFT_DELETED_OWNER_HAS_RESOURCES: Object.freeze({
    issueCode: 'SOFT_DELETED_OWNER_HAS_RESOURCES',
    resourceType: 'account',
    risk: GOVERNANCE_RISK.BLOCKED,
    legacy: true,
    ownerStateAware: true,
    supportsBatch: false,
    revalidate: true,
  }),
  FORMALLY_DELETED_OWNER_HAS_RESOURCES: Object.freeze({
    issueCode: 'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
    resourceType: 'account',
    risk: GOVERNANCE_RISK.REVIEW,
    operatorReviewSeverity: 'high',
    ownerStateAware: true,
    invalidOwnerCleanup: true,
    supportsBatch: false,
    revalidate: true,
  }),
  ACCOUNT_DELETION_STALLED: Object.freeze({
    issueCode: 'ACCOUNT_DELETION_STALLED',
    resourceType: 'account_job',
    risk: GOVERNANCE_RISK.BLOCKED,
    ownerStateAware: true,
    invalidOwnerCleanup: true,
    supportsBatch: false,
    revalidate: true,
  }),
});

export function resourceGovernanceScanEnabled(env = process.env) {
  return String(env.RESOURCE_GOVERNANCE_SCAN_ENABLED || 'true').toLowerCase() !== 'false';
}

// 破坏性能力必须显式启用。未配置、拼写错误或未知值全部失败关闭。
export function resourceGovernanceCleanupEnabled(env = process.env) {
  return String(env.RESOURCE_GOVERNANCE_CLEANUP_ENABLED || '').toLowerCase() === 'true';
}

export function normalizeGovernanceScopes(value) {
  const requested = Array.isArray(value) ? value.map((item) => String(item || '').trim()) : [];
  const normalized = [...new Set(requested.filter((item) => GOVERNANCE_SCOPES.includes(item)))];
  return normalized.length ? normalized : [...GOVERNANCE_SCOPES];
}

export function getGovernanceRule(issueCode) {
  return GOVERNANCE_RULES[String(issueCode || '')] || null;
}

export function getOperatorReviewGovernanceRules() {
  return Object.values(GOVERNANCE_RULES).filter((rule) => Boolean(rule.operatorReviewSeverity));
}

export function getOwnerStateGovernanceRules() {
  return Object.values(GOVERNANCE_RULES).filter((rule) => rule.ownerStateAware === true);
}

export function getInvalidOwnerCleanupGovernanceRules() {
  return Object.values(GOVERNANCE_RULES).filter((rule) => rule.invalidOwnerCleanup === true);
}

export function canCreateCleanupJob(finding) {
  const rule = getGovernanceRule(finding?.issue_code || finding?.issueCode);
  return Boolean(
    rule?.executor &&
    rule.supportsBatch &&
    finding &&
    (finding.risk_level || finding.riskLevel) === GOVERNANCE_RISK.SAFE &&
    finding.state === 'open',
  );
}
