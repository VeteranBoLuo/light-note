import crypto from 'crypto';
import pool from '../../../db/index.js';
import { safeJsonStringify } from '../payloadSanitizer.js';
import { updateIpReputation, ensureIpLocation } from './ipReputation.js';
import { updateAccountReputation } from './accountReputation.js';

const countIpAttacks = async (ip, intervalExpr) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM security_events
     WHERE source_ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ${intervalExpr})`,
    [ip],
  );
  return Number(rows[0]?.total || 0);
};

export const writeSecurityEvent = async ({ context, evidenceList, threat, decision, statusCode, responseTimeMs }) => {
  if (!threat?.threatScore || evidenceList.length === 0) {
    return null;
  }
  const eventId = crypto.randomBytes(16).toString('hex');
  const ipAttackCount5m = await countIpAttacks(context.sourceIp, '5 MINUTE');
  const ipAttackCount24h = await countIpAttacks(context.sourceIp, '24 HOUR');
  const event = {
    event_id: eventId,
    attack_type: threat.attackType,
    severity: threat.severity,
    threat_score: threat.threatScore,
    confidence: threat.confidence,
    action_taken: decision.actionTaken,
    blocked: decision.blocked ? 1 : 0,
    request_method: context.method,
    request_path: context.path,
    request_url: context.originalUrl,
    status_code: statusCode || null,
    response_time_ms: responseTimeMs || null,
    source_ip: context.sourceIp,
    x_forwarded_for: context.xForwardedFor,
    user_agent: context.userAgent,
    user_id: context.userId || null,
    role: context.role || null,
    matched_rule: threat.matchedRule,
    matched_payload: threat.matchedPayload,
    payload_summary: safeJsonStringify(context.payloadSummary),
    headers_summary: safeJsonStringify(context.headersSummary),
    ip_attack_count_5m: ipAttackCount5m,
    ip_attack_count_24h: ipAttackCount24h,
    ip_risk_delta: 0,
    decision_reason: decision.reason || '',
  };
  await pool.query('INSERT INTO security_events SET ?', [event]);
  if (evidenceList.length) {
    await pool.query(
      `INSERT INTO security_event_evidence
        (event_id,rule_code,rule_name,detector,attack_type,severity,matched_field,matched_value_preview,evidence_message,score_delta,confidence)
       VALUES ?`,
      [
        evidenceList.map((item) => [
          eventId,
          item.ruleCode,
          item.ruleName,
          item.detector,
          item.attackType,
          item.severity,
          item.matchedField,
          item.matchedValuePreview,
          item.evidenceMessage,
          item.scoreDelta,
          item.confidence,
        ]),
      ],
    );
  }
  if (Number(threat.threatScore || 0) >= 20 || decision.shouldBan) {
    ensureIpLocation(context.sourceIp); // 异步查地理位置，不阻塞
    const reputationChange = await updateIpReputation({
      ip: context.sourceIp,
      attackType: threat.attackType,
      severity: threat.severity,
      threatScore: threat.threatScore,
      shouldBan: decision.shouldBan,
    }).catch(() => null);
    if (reputationChange) {
      await pool
        .query('UPDATE security_events SET ip_risk_delta = ? WHERE event_id = ?', [
          reputationChange.riskDelta || 0,
          eventId,
        ])
        .catch(() => {});
      if (reputationChange.autoBanned) {
        await pool
          .query(
            `UPDATE security_events
             SET decision_reason = CONCAT(COALESCE(decision_reason, ''), '；IP画像风险分达到', ?, '，已自动封禁IP')
             WHERE event_id = ?`,
            [reputationChange.autoBanThreshold || 80, eventId],
          )
          .catch(() => {});
      }
    }
    if (context.userId) {
      const acctChange = await updateAccountReputation({
        userId: context.userId,
        attackType: threat.attackType,
        severity: threat.severity,
        threatScore: threat.threatScore,
      }).catch(() => null);
      if (acctChange?.riskDelta) {
        await pool
          .query('UPDATE security_events SET user_risk_delta = ? WHERE event_id = ?', [
            acctChange.riskDelta || 0,
            eventId,
          ])
          .catch(() => {});
      }
    }
  }
  return eventId;
};
