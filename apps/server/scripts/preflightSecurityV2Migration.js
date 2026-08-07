import pool from '../db/index.js';

const countRows = async (sql) => {
  const [rows] = await pool.query(sql);
  return Number(rows[0]?.total || 0);
};

try {
  const [activeLegacyBans, activeLegacyWhitelist, legacyBannedUsers, automaticIpBans, existingV2Tables] =
    await Promise.all([
      countRows('SELECT COUNT(*) AS total FROM security_account_bans WHERE is_active = 1'),
      countRows('SELECT COUNT(*) AS total FROM security_whitelist WHERE enabled = 1'),
      countRows(`
        SELECT COUNT(*) AS total
        FROM user u
        JOIN security_account_bans b ON b.user_id = u.id AND b.is_active = 1
        WHERE u.role <> 'root' AND u.del_flag = 1
      `),
      countRows(`
        SELECT COUNT(*) AS total
        FROM security_ip_reputation
        WHERE is_banned = 1
          AND ban_reason REGEXP '^IP风险分 [0-9]+ 达到自动封禁阈值 [0-9]+$'
      `),
      countRows(`
        SELECT COUNT(*) AS total
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (
            'security_rule_overrides',
            'security_exceptions',
            'security_account_restrictions',
            'security_rule_tuning_suggestions',
            'security_policy_audit',
            'security_migration_state'
          )
      `),
    ]);
  const migrationCompleted =
    existingV2Tables === 6
      ? await countRows(`
          SELECT COUNT(*) AS total
          FROM security_migration_state
          WHERE migration_key = 'security-controls-v2-del-flag-separation'
        `)
      : 0;

  console.log(
    '[security-v2-preflight] %s',
    JSON.stringify({
      activeLegacyBans,
      activeLegacyWhitelist,
      legacyBannedUsers,
      automaticIpBans,
      existingV2Tables,
      migrationCompleted,
    }),
  );
} catch (error) {
  console.error('[security-v2-preflight] failed code=%s', String(error?.code || 'UNKNOWN'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
