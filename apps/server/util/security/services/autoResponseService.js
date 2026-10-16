import pool from '../../../db/index.js';
import { SECURITY_CONFIG } from '../rules.js';
import { isSecurityWhitelisted } from './whitelist.js';
import { setIpBan, clearIpReputationCache } from './ipReputation.js';
import { recordAdminOperationAudit } from '../../adminOperationAudit.js';
import {
  AUTO_RESPONSE_ACTOR,
  automaticBanEvents,
  automaticBanReason,
  automaticProbeEvidence,
} from './autoResponsePolicy.js';

export async function applyAutomaticSecurityResponse({
  eventId,
  context,
  evidenceList,
  decision,
  statusCode,
  db = pool,
}) {
  if (!SECURITY_CONFIG.autoResponseEnabled || !SECURITY_CONFIG.blockEnabled) return null;
  const evidence = automaticProbeEvidence(context, evidenceList, decision, statusCode);
  if (!evidence) return null;
  const ip = context.sourceIp;
  const c = await db.getConnection();
  try {
    // Only the next transaction changes isolation; concurrent probes see the last committed trigger.
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction();
    const [[event]] = await c.query(
      'SELECT event_id,workflow_status,disposition FROM security_events WHERE event_id=? FOR UPDATE',
      [eventId],
    );
    if (!event || event.workflow_status !== 'new' || event.disposition !== 'unknown') {
      await c.rollback();
      return null;
    }
    await c.query('INSERT IGNORE INTO security_ip_reputation (ip,first_seen_at,last_seen_at) VALUES (?,NOW(),NOW())', [
      ip,
    ]);
    const [[current]] = await c.query('SELECT * FROM security_ip_reputation WHERE ip=? FOR UPDATE', [ip]);
    if (
      (await isSecurityWhitelisted('ip', ip, c)) ||
      (context.userId && (await isSecurityWhitelisted('user', context.userId, c)))
    ) {
      await c.rollback();
      return null;
    }
    const reason = `自动复核：游客直接探测敏感文件，${evidence.ruleCode}，请求已403拦截；策略security-auto-v1`;
    await c.query(
      `UPDATE security_events SET handled_status='processed',workflow_status='resolved',disposition='confirmed_attack',
      handled_by=?,handled_at=NOW(),reviewed_by=?,reviewed_at=NOW(),review_reason=?,remark=? WHERE event_id=?`,
      [AUTO_RESPONSE_ACTOR, AUTO_RESPONSE_ACTOR, reason, reason, eventId],
    );
    const [triggers] = await c.query(
      `SELECT event_id FROM security_events
      WHERE source_ip=? AND reviewed_by=? AND disposition='confirmed_attack' AND handled_status='processed'
        AND created_at>=DATE_SUB(NOW(),INTERVAL 5 MINUTE) ORDER BY id DESC LIMIT 2`,
      [ip, AUTO_RESPONSE_ACTOR],
    );
    const [revocations] = await c.query(
      `SELECT id FROM security_policy_audit
      WHERE policy_type='source_deny' AND action='revoke' AND created_at>=DATE_SUB(NOW(),INTERVAL 1 HOUR)
        AND JSON_UNQUOTE(JSON_EXTRACT(snapshot_json,'$.ip'))=? LIMIT 1`,
      [ip],
    );
    const alreadyRestricted = Number(current?.is_banned) === 1 && new Date(current.banned_until).getTime() > Date.now();
    const restricted = triggers.length === 2 && !alreadyRestricted && !revocations.length;
    if (restricted) {
      await setIpBan(ip, true, 60, automaticBanReason(triggers.map((r) => r.event_id)), c);
      await c.query(
        `INSERT INTO security_policy_audit
        (policy_type,action,policy_version,operator_id,reason,snapshot_json) VALUES ('source_deny','create',1,?,?,?)`,
        [
          AUTO_RESPONSE_ACTOR,
          reason,
          JSON.stringify({
            ip,
            minutes: 60,
            scope: 'visitor',
            eventIds: triggers.map((r) => r.event_id),
            automatic: true,
          }),
        ],
      );
    }
    await recordAdminOperationAudit(
      {
        actorUserId: AUTO_RESPONSE_ACTOR,
        action: 'security.auto_response',
        targetType: 'security_event',
        targetId: eventId,
        outcome: 'succeeded',
        reason,
        requestId: eventId,
        ip,
        metadata: {
          ruleCode: evidence.ruleCode,
          disposition: 'confirmed_attack',
          sourceRestricted: restricted,
          minutes: restricted ? 60 : 0,
          scope: 'visitor',
          manualRevocationRespected: Boolean(revocations.length),
        },
      },
      { db: c, required: true },
    );
    await c.commit();
    clearIpReputationCache(ip);
    return { reviewed: true, restricted };
  } catch (error) {
    await c.rollback().catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}

// Reclassifying either trigger as a false positive/test releases only its automatic restriction.
export async function releaseAutomaticSecurityResponse({ connection, event }) {
  const [[current]] = await connection.query('SELECT * FROM security_ip_reputation WHERE ip=? FOR UPDATE', [
    event.source_ip,
  ]);
  if (!automaticBanEvents(current?.ban_reason).includes(event.event_id)) return false;
  await setIpBan(event.source_ip, false, 0, '', connection);
  await connection.query(
    `INSERT INTO security_policy_audit
    (policy_type,action,policy_version,operator_id,reason,snapshot_json) VALUES ('source_deny','revoke',1,?,?,?)`,
    [
      AUTO_RESPONSE_ACTOR,
      '触发证据被人工排除，自动解除游客来源限制',
      JSON.stringify({ ip: event.source_ip, eventId: event.event_id, automatic: true }),
    ],
  );
  return true;
}
