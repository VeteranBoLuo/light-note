const RISK_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical']);

/**
 * 由统一执行器承接的后台写动作封闭注册表。新增动作必须先声明风险与护栏，
 * 再接统一审计；未登记动作不能被执行器静默放行。
 */
const ADMIN_ACTION_DEFINITIONS = Object.freeze(
  [
    ['user.update', 'user', 'high', true],
    ['user.delete', 'user', 'critical', true],
    ['user.restore', 'user', 'high', true],
    ['growth.adjust', 'user_growth', 'high', true],
    ['growth.grant_points', 'points', 'high', true],
    ['growth.points_correction', 'points', 'high', true],
    ['growth.points_campaign_create', 'points_campaign', 'medium', true],
    ['growth.points_campaign_preview', 'points_campaign', 'medium', true],
    ['growth.points_campaign_freeze', 'points_campaign', 'high', true],
    ['growth.points_campaign_confirm', 'points_campaign', 'critical', true],
    ['growth.points_campaign_execute', 'points_campaign', 'critical', true],
    ['growth.points_campaign_delete', 'points_campaign', 'high', true],
    ['notification.send', 'notification_batch', 'high', true],
    ['notification.recall', 'notification_batch', 'high', true],
    ['notification.archive', 'notification_batch', 'high', true],
    ['logs.cleanup', 'operational_logs', 'critical', false],
    ['security.event.review', 'security_event', 'high', true],
    ['security.cluster.review', 'security_event_cluster', 'high', true],
    ['security.review.batch', 'security_review_batch', 'high', true],
    ['knowledge_base.create', 'knowledge_base', 'medium', true],
    ['knowledge_base.update', 'knowledge_base', 'medium', true],
    ['knowledge_base.publish', 'knowledge_base', 'high', true],
    ['knowledge_base.archive', 'knowledge_base', 'high', true],
    ['infra.nginx_reload', 'host_service', 'high', true],
    ['infra.service_restart', 'host_service', 'high', true],
  ].map(([action, targetType, riskLevel, recoverable]) =>
    Object.freeze({
      action,
      targetType,
      riskLevel,
      reasonRequired: true,
      recoverable,
      auditRequired: riskLevel === 'high' || riskLevel === 'critical',
      version: 1,
    }),
  ),
);

const ADMIN_ACTION_MAP = new Map(ADMIN_ACTION_DEFINITIONS.map((item) => [item.action, item]));

function getAdminActionDefinition(action) {
  return ADMIN_ACTION_MAP.get(String(action || '')) || null;
}

function listAdminActionDefinitions({ riskLevel } = {}) {
  const risk = RISK_LEVELS.includes(riskLevel) ? riskLevel : null;
  return ADMIN_ACTION_DEFINITIONS.filter((item) => !risk || item.riskLevel === risk).map((item) => ({ ...item }));
}

function assertRegisteredAdminAction(action) {
  const definition = getAdminActionDefinition(action);
  if (!definition) {
    throw Object.assign(new Error('后台动作未登记'), {
      code: 'ADMIN_ACTION_UNREGISTERED',
      action: String(action || ''),
    });
  }
  return definition;
}

export {
  ADMIN_ACTION_DEFINITIONS,
  RISK_LEVELS,
  assertRegisteredAdminAction,
  getAdminActionDefinition,
  listAdminActionDefinitions,
};
