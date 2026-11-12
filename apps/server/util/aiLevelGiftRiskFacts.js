import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { resolveNetworkBinding } from './aiQuota.js';

export function aiGiftNetworkKey(value) {
  const ip = String(value || '').replace(/^::ffff:/i, '');
  if (!isIP(ip)) return null;
  return createHash('sha256').update(resolveNetworkBinding({ ip })).digest('hex');
}

// 和建号共用事务。即使赠礼关闭也记录；后续开启不能绕过注册复核。
export async function recordAiGiftRegistration(connection, userId, ip, { checked = false } = {}) {
  await connection.query(
    `INSERT INTO ai_level_gift_registrations (user_id,network_key,registered_at,checked_at)
     SELECT id,?,create_time,? FROM user WHERE id=? AND role='user' AND create_time IS NOT NULL
     ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)`,
    [aiGiftNetworkKey(ip), checked ? new Date() : null, userId],
  );
}

// 必须在正式注销的账号事务内、去标识化之前调用；短期计数不随内容清理而消失。
export async function preserveAiGiftRiskOnDeletion(connection, tables, userId) {
  if (tables.has('ai_level_gift_registrations')) {
    let ip = null;
    if (tables.has('api_logs')) {
      const [[log]] = await connection.query(
        `SELECT ip FROM api_logs WHERE user_id=? AND
         LOWER(TRIM(TRAILING '/' FROM SUBSTRING_INDEX(SUBSTRING_INDEX(url,'?',1),'#',1)))
         IN ('/api/user/registeruser','/user/registeruser','/api/user/github/register')
         ORDER BY request_time ASC LIMIT 1`,
        [userId],
      );
      ip = log?.ip;
    }
    await recordAiGiftRegistration(connection, userId, ip, { checked: true });
    await connection.query('UPDATE ai_level_gift_registrations SET user_id=NULL WHERE user_id=?', [userId]);
  }
  if (tables.has('ai_level_gift_risk_usage') && tables.has('ai_executions')) {
    await connection.query(
      `INSERT INTO ai_level_gift_risk_usage (execution_id,provider_tokens,known_tokens,created_at)
       SELECT e.id,(SELECT COALESCE(SUM(total_tokens),0) FROM ai_provider_spans WHERE execution_id=e.id),
         e.provider_tokens,e.created_at
       FROM ai_executions e JOIN user u ON u.id=CONVERT(e.actor_user_id USING utf8) COLLATE utf8_general_ci
       WHERE u.id=? AND u.role='user' AND u.create_time>=DATE_SUB(NOW(),INTERVAL 7 DAY)
         AND e.billing_policy='user' AND e.created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
       ON DUPLICATE KEY UPDATE provider_tokens=GREATEST(ai_level_gift_risk_usage.provider_tokens,VALUES(provider_tokens)),
         known_tokens=GREATEST(ai_level_gift_risk_usage.known_tokens,VALUES(known_tokens))`,
      [userId],
    );
  }
}
