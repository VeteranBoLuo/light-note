import pool from '../db/index.js';
import { levelGiftsEnabled } from './aiQuotaPolicy.js';
import { aiGiftNetworkKey } from './aiLevelGiftRiskFacts.js';
import { createNotification } from './notification.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

export function aiGiftRiskPolicy(env = process.env) {
  const value = (key, fallback) => {
    const number = Number(env[key] ?? fallback);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
  };
  return {
    networkRegistrations: value('AI_GIFT_NETWORK_REGISTRATION_LIMIT', 3),
    globalRegistrations: value('AI_GIFT_GLOBAL_REGISTRATION_LIMIT', 20),
    newAccountTokens: value('AI_GIFT_NEW_ACCOUNT_TOKEN_LIMIT', 500_000),
  };
}

function networkBatches(rows, policy) {
  const networks = new Map();
  for (const row of rows) {
    const network = row.network_key || aiGiftNetworkKey(row.ip);
    if (!network) continue;
    const batch = networks.get(network) || { facts: new Set(), users: new Set(), latest: 0n, legacy: '' };
    batch.facts.add(row.id ? `event:${row.id}` : `legacy:${row.user_id}`);
    if (row.user_id) batch.users.add(String(row.user_id));
    // 窗口缩小、注销去标识化均不改变最新注册事实，不能视为新注册。
    if (row.id && BigInt(row.id) > batch.latest) batch.latest = BigInt(row.id);
    batch.legacy = [batch.legacy, `${new Date(row.registered_at || 0).getTime()}:${row.user_id || ''}`].sort().at(-1);
    networks.set(network, batch);
  }
  return [...networks.entries()]
    .filter(([, batch]) => batch.facts.size >= policy.networkRegistrations)
    .map(([network, batch]) => ({
      users: [...batch.users].sort(),
      key: `ai-gift-v2:network:${network}:${batch.latest || batch.legacy}`,
      networkKey: network,
      evidenceId: batch.latest.toString(),
    }));
}

export function aiGiftNetworkBatches(rows, policy = aiGiftRiskPolicy()) {
  return networkBatches(rows, policy).map((batch) => batch.users);
}

async function holdAccounts(connection, users, rule, key, evidence = {}) {
  let created = 0;
  for (const userId of users) {
    const [[prior]] = await connection.query(
      `SELECT id FROM security_account_restrictions WHERE user_id=? AND restriction_type='gift_hold'
       AND ((status='active' AND (expires_at IS NULL OR expires_at>NOW()))
         OR JSON_UNQUOTE(JSON_EXTRACT(scope_json,'$.batchKey'))=?
         OR (? IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(scope_json,'$.networkKey'))=?
           AND CAST(JSON_UNQUOTE(JSON_EXTRACT(scope_json,'$.evidenceId')) AS DECIMAL(20,0))>=?)) LIMIT 1 FOR UPDATE`,
      [userId, key, evidence.networkKey || null, evidence.networkKey || null, evidence.evidenceId || null],
    );
    if (prior) continue;
    const [result] = await connection.query(
      `INSERT INTO security_account_restrictions (user_id,restriction_type,scope_json,status,reason,created_by)
       VALUES (?,'gift_hold',?,'active',?,'system:ai_gifts')`,
      [
        userId,
        JSON.stringify({ batchKey: key, rule, ...evidence }),
        '注册或新号用量达到赠礼复核阈值；仅暂缓尚未发放的赠礼',
      ],
    );
    await connection.query(
      `INSERT INTO security_policy_audit
       (policy_type,policy_id,action,policy_version,operator_id,reason,snapshot_json)
       VALUES ('account_restriction',?,'create',1,'system:ai_gifts','AI 赠礼自动复核',?)`,
      [result.insertId, JSON.stringify({ rule, batchKey: key })],
    );
    created++;
  }
  return { created, key, accounts: users.length, rule };
}

async function pruneRiskFacts(database) {
  await database.query(`DELETE FROM ai_level_gift_registrations
    WHERE registered_at<DATE_SUB(NOW(),INTERVAL 8 DAY)
    OR (user_id IS NULL AND registered_at<DATE_SUB(NOW(),INTERVAL 24 HOUR))`);
  await database.query('DELETE FROM ai_level_gift_risk_usage WHERE created_at<DATE_SUB(NOW(),INTERVAL 24 HOUR)');
}

// 多进程共用控制锁；只确认本轮实际读到的待检查行，不放过并发提交的新注册。
export async function assessAiLevelGiftRisk({ database = pool, notify = createNotification } = {}) {
  if (!levelGiftsEnabled()) {
    // 关闭发礼不延长短期事实留存；不评估、不新增限制、不发送通知。
    await pruneRiskFacts(database);
    return { disabled: true };
  }
  const policy = aiGiftRiskPolicy();
  const connection = await database.getConnection();
  const notices = [];
  let roots = [],
    paused = false;
  try {
    await connection.beginTransaction();
    const [[control]] = await connection.query(
      'SELECT paused_from,reviewed_at,CURRENT_TIMESTAMP(3) AS assessed_at FROM ai_level_gift_controls WHERE id=1 FOR UPDATE',
    );
    if (!control) throw Object.assign(new Error('AI_GIFT_CONTROL_MISSING'), { code: 'AI_GIFT_CONTROL_MISSING' });
    await pruneRiskFacts(connection);
    const [pending] = await connection.query(
      'SELECT id FROM ai_level_gift_registrations WHERE checked_at IS NULL FOR UPDATE',
    );
    const [[count]] = await connection.query(
      `SELECT COUNT(*) AS registrations FROM (
        SELECT registered_at FROM ai_level_gift_registrations WHERE registered_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
        UNION ALL
        SELECT u.create_time FROM user u WHERE u.role='user' AND u.create_time>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
          AND NOT EXISTS(SELECT 1 FROM ai_level_gift_registrations r WHERE r.user_id=u.id)
      ) registrations WHERE registered_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
        AND (? IS NULL OR registered_at>?)`,
      [control.reviewed_at, control.reviewed_at],
    );
    const [[usage]] = await connection.query(
      `SELECT COALESCE(SUM(provider_tokens),0) AS tokens FROM (
        SELECT GREATEST(r.provider_tokens,r.known_tokens,COALESCE(e.provider_tokens,0)) AS provider_tokens,r.created_at
        FROM ai_level_gift_risk_usage r LEFT JOIN ai_executions e ON e.id=r.execution_id
        WHERE r.created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
        UNION ALL
        SELECT e.provider_tokens,e.created_at FROM ai_executions e
        JOIN user u ON u.id=CONVERT(e.actor_user_id USING utf8) COLLATE utf8_general_ci
        WHERE u.role='user' AND u.create_time>=DATE_SUB(NOW(),INTERVAL 7 DAY)
          AND e.billing_policy='user' AND e.model_called=1 AND e.created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
          AND NOT EXISTS(SELECT 1 FROM ai_level_gift_risk_usage r WHERE r.execution_id=e.id)
      ) usage_facts WHERE created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR) AND (? IS NULL OR created_at>?)`,
      [control.reviewed_at, control.reviewed_at],
    );
    const global =
      Number(count.registrations) > policy.globalRegistrations || Number(usage.tokens) > policy.newAccountTokens;
    if (global) {
      const pauseFrom = control.paused_from || control.assessed_at;
      if (!control.paused_from)
        await connection.query(
          "UPDATE ai_level_gift_controls SET paused_from=?,reason='新号注册或实际用量达到全站复核阈值',updated_by='system:ai_gifts' WHERE id=1",
          [pauseFrom],
        );
      const [users] = await connection.query(
        "SELECT id FROM user WHERE role='user' AND del_flag=0 AND create_time>=DATE_SUB(NOW(),INTERVAL 7 DAY) ORDER BY id",
      );
      const held = await holdAccounts(
        connection,
        users.map((row) => row.id),
        'global',
        `ai-gift-v2:global:${new Date(pauseFrom).getTime()}`,
      );
      paused = !control.paused_from;
      if (held.created || paused) notices.push(held);
    } else {
      const [facts] = await connection.query(`SELECT r.id,r.network_key,r.registered_at,
        IF(u.role='user' AND u.del_flag=0,u.id,NULL) AS user_id
        FROM ai_level_gift_registrations r LEFT JOIN user u ON u.id=r.user_id
        WHERE r.registered_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)`);
      // 兼容发布前的短期日志；新注册与 URL、日志开关及日志清理无关。
      const [legacy] = await connection.query(`SELECT DISTINCT logs.user_id,logs.ip,u.create_time AS registered_at
        FROM api_logs logs JOIN user u ON u.id=CONVERT(logs.user_id USING utf8) COLLATE utf8_general_ci
        WHERE logs.request_time>=DATE_SUB(NOW(),INTERVAL 24 HOUR) AND logs.del_flag=0
          AND LOWER(TRIM(TRAILING '/' FROM SUBSTRING_INDEX(SUBSTRING_INDEX(logs.url,'?',1),'#',1)))
            IN ('/api/user/registeruser','/user/registeruser','/api/user/github/register')
          AND u.role='user' AND u.del_flag=0 AND u.create_time>=DATE_SUB(NOW(),INTERVAL 24 HOUR)
          AND NOT EXISTS(SELECT 1 FROM ai_level_gift_registrations r WHERE r.user_id=u.id)`);
      for (const batch of networkBatches([...facts, ...legacy], policy)) {
        const held = await holdAccounts(connection, batch.users, 'network', batch.key, {
          networkKey: batch.networkKey,
          evidenceId: batch.evidenceId,
        });
        if (held.created) notices.push(held);
      }
    }
    for (let start = 0; start < pending.length; start += 200) {
      const ids = pending.slice(start, start + 200).map((row) => row.id);
      await connection.query(
        `UPDATE ai_level_gift_registrations SET checked_at=NOW(3) WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
    }
    if (notices.length) [roots] = await connection.query("SELECT id FROM user WHERE role='root' AND del_flag=0");
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  // 已提交且已释放连接；通知失败不能撤销限制，也不能卡住连接池。
  let notificationFailures = 0;
  for (const notice of notices)
    for (const root of roots) {
      try {
        await notify(root.id, {
          type: 'system',
          title: 'AI 赠礼需要复核',
          content:
            notice.rule === 'global'
              ? `新号达到全站复核阈值，已暂停后续新号赠礼，并暂扣最近 7 天 ${notice.accounts} 个账号的未发赠礼。`
              : `同网段注册达到复核阈值，${notice.accounts} 个账号的未发赠礼已暂扣。`,
          link: '/securityCenter/access-control',
          sourceType: 'ai_gift_review',
          sourceId: notice.key,
          meta: { rule: notice.rule, affectedAccounts: notice.accounts },
        });
      } catch (error) {
        notificationFailures++;
        console.warn('[level-gifts] risk notification failed code=%s', stableAgentErrorCode(error));
      }
    }
  return { paused, heldAccounts: notices.reduce((sum, notice) => sum + notice.created, 0), notificationFailures };
}
