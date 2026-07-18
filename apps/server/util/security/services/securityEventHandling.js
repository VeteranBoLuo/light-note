import { excludesSecurityEventRisk } from '../handledStatus.js';
import { rebuildIpReputationFromEvents, revertIpReputationImpact } from './ipReputation.js';
import { rebuildAccountReputationFromEvents, revertAccountReputationImpact } from './accountReputation.js';

const revertIpRisk = async ({ connection, event }) => {
  if (Number(event.ip_risk_delta || 0) > 0) {
    await revertIpReputationImpact({
      ip: event.source_ip,
      attackType: event.attack_type,
      severity: event.severity,
      riskDelta: event.ip_risk_delta,
      connection,
    });
  } else {
    await rebuildIpReputationFromEvents({ ip: event.source_ip, connection });
  }
  await connection.query(
    `UPDATE security_events
     SET ip_risk_reverted = 1, ip_risk_reverted_at = NOW()
     WHERE event_id = ?`,
    [event.event_id],
  );
};

const restoreIpRisk = async ({ connection, event }) => {
  await connection.query(
    `UPDATE security_events
     SET ip_risk_reverted = 0, ip_risk_reverted_at = NULL
     WHERE event_id = ?`,
    [event.event_id],
  );
  await rebuildIpReputationFromEvents({ ip: event.source_ip, connection });
};

const revertAccountRisk = async ({ connection, event }) => {
  if (Number(event.user_risk_delta || 0) > 0) {
    await revertAccountReputationImpact({
      userId: event.user_id,
      attackType: event.attack_type,
      severity: event.severity,
      riskDelta: event.user_risk_delta,
      connection,
    });
  } else {
    await rebuildAccountReputationFromEvents({ userId: event.user_id, connection });
  }
  await connection.query(
    `UPDATE security_events
     SET user_risk_reverted = 1, user_risk_reverted_at = NOW()
     WHERE event_id = ?`,
    [event.event_id],
  );
};

const restoreAccountRisk = async ({ connection, event }) => {
  await connection.query(
    `UPDATE security_events
     SET user_risk_reverted = 0, user_risk_reverted_at = NULL
     WHERE event_id = ?`,
    [event.event_id],
  );
  await rebuildAccountReputationFromEvents({ userId: event.user_id, connection });
};

export const applySecurityEventHandle = async ({ connection, event, normalizedStatus, remark, operatorId }) => {
  await connection.query(
    `UPDATE security_events
     SET handled_status = ?, remark = ?, handled_by = ?, handled_at = NOW()
     WHERE event_id = ?`,
    [normalizedStatus, remark, operatorId, event.event_id],
  );

  const shouldExcludeRisk = excludesSecurityEventRisk(normalizedStatus);

  if (shouldExcludeRisk && !event.ip_risk_reverted) {
    await revertIpRisk({ connection, event });
  } else if (!shouldExcludeRisk && event.ip_risk_reverted) {
    await restoreIpRisk({ connection, event });
  }

  if (!event.user_id) return;

  if (shouldExcludeRisk && !event.user_risk_reverted) {
    await revertAccountRisk({ connection, event });
  } else if (!shouldExcludeRisk && event.user_risk_reverted) {
    await restoreAccountRisk({ connection, event });
  }
};
