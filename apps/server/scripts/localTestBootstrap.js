import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { assertLocalTestEnvironment } from '../util/localTestEnvironment.js';
import { hashPassword } from '../util/password.js';
import { localSqlStatements } from '../util/localSqlStatements.js';

assertLocalTestEnvironment(process.env);
const stateDir = process.env.LIGHTNOTE_LOCAL_TEST_DIR;
const migrations = [
  '20260708_growth.sql', '20260708_ai_token_usage.sql', '20260719_ai_quota_hardening.sql',
  '20260823_ai_execution_ledger.sql', '20260824_ai_usage_actor_index.sql',
  '20260825_ai_execution_rule_versions_and_lease.sql', '20260825_ai_provider_span_explainability.sql',
  '20260923_ai_execution_input_diagnostics.sql',
  '20261030_infra_alerts.sql', '20261030_infra_alert_silences.sql',
  '20261106_ai_level_gifts.sql',
  '20261106_ai_gift_risk_facts.sql',
  '20260715_resource_inbox.sql', '20260831_organize_center_v2.sql',
  '20260905_organize_suggestion_runs.sql', '20260905_organize_ai_group.sql',
  '20260906_organize_usage_groups.sql', '20260906_organize_run_lifecycle.sql',
  '20260911_organize_processing_jobs.sql',
  '20261102_cloud_multipart_uploads.sql',
  '20260909_image_preview_metadata.sql', '20260909_organize_file_evidence.sql',
  '20260909_note_import_tasks.sql', '20260909_note_import_progress.sql', '20260909_visitor_examples.sql',
  '20260821_cloud_folder_tree.sql', '20260908_user_activity.sql', '20260914_resource_reuse.sql',
  '20260813_points_economy_c4.sql', '20260826_points_economy_c5_storage_limits.sql',
  '20260814_points_earning_c5.sql', '20260825_ai_bonus_wallet_and_afdian_rewards.sql',
  '20261105_update_logs_product_version.sql',
  '20261107_afdian_fixed_products.sql',
];
const ensureModules = [
  ['security/index.js', 'ensureSecurityTables'], ['notification.js', 'ensureNotificationTable'],
  ['points.js', 'ensurePointsSchema'], ['aiBonusWalletSchema.js', 'ensureAiBonusWalletSchema'], ['aiLevelGiftSchema.js', 'ensureAiLevelGiftSchema'],
  ['growthTaskSchema.js', 'ensureGrowthTaskSchema'], ['growthCenterSchema.js', 'ensureGrowthCenterSchema'],
  ['dailyReviewSchema.js', 'ensureDailyReviewSchema'], ['aiDocumentSchema.js', 'ensureAiDocumentSchema'],
  ['toolboxSchema.js', 'ensureToolboxSchema'], ['dailyBriefSchema.js', 'ensureDailyBriefSchema'],
  ['noteTreeSchema.js', 'ensureNoteTreeSchema'], ['bookmarkArchiveJobs.js', 'ensureBookmarkArchiveSchema'],
  ['organizeSchema.js', 'ensureOrganizeSchema'], ['featureRequestSchema.js', 'ensureFeatureRequestTables'],
  ['filePreviewSchema.js', 'ensureFilePreviewSchema'], ['resourceGovernanceSchema.js', 'ensureResourceGovernanceSchema'],
  ['communityChatSchema.js', 'ensureCommunityChatSchema'], ['communityFeed/schema.js', 'ensureCommunityFeedSchema'],
  ['afdianSupportSchema.js', 'ensureAfdianSupportSchema'], ['afdianSupportRewardSchema.js', 'ensureAfdianSupportRewardSchema'],
  ['afdianSupportPackageSchema.js', 'ensureAfdianSupportPackageSchema'],
  ['todoWorkspaceSchema.js', 'ensureTodoWorkspaceSchema'],
];
async function applySql(source) {
  const connection = await pool.getConnection();
  try {
    for (const statement of localSqlStatements(source)) await connection.query(statement);
  } finally { connection.release(); }
}
try {
  const [tables] = await pool.query('SHOW TABLES');
  if (!tables.length) {
    let source;
    try { source = await fs.readFile(path.join(stateDir, 'schema.sql'), 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      source = await fs.readFile(new URL('../tag_db.sql', import.meta.url), 'utf8');
      // 仓库基线只取结构，避免未来 SQL 文件中的种子数据被隐式复制。
      source = source.split(/;\s*(?:\r?\n|$)/).filter(sql => /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*(?:SET\b|CREATE TABLE\b)/i.test(sql)).join(';\n') + ';\n';
    }
    await applySql(source);
    console.log('[local-bootstrap] installed empty schema; no production rows imported');
  }
  await (await import('../util/aiDocumentSchema.js')).ensureAiDocumentSchema();
  await pool.query('CREATE TABLE IF NOT EXISTS local_test_migrations (name VARCHAR(191) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  for (const file of migrations) {
    const [applied] = await pool.query('SELECT name FROM local_test_migrations WHERE name=?', [file]);
    if (applied.length) continue;
    console.log('[local-bootstrap] applying %s', file);
    if (file === '20260814_points_earning_c5.sql') await (await import('../util/growthCenterSchema.js')).ensureGrowthCenterSchema();
    if (file === '20260905_organize_ai_group.sql') await (await import('../util/organizeSchema.js')).ensureOrganizeSchema();
    if (file === '20261107_afdian_fixed_products.sql') await (await import('../util/afdianSupportSchema.js')).ensureAfdianSupportSchema();
    await applySql(await fs.readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    await pool.query('INSERT INTO local_test_migrations (name) VALUES (?)', [file]);
    if (file === '20260708_growth.sql') {
      await (await import('../util/points.js')).ensurePointsSchema();
      const [[notice]] = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_growth' AND column_name='last_notified_level'");
      if (!notice) await applySql(await fs.readFile(new URL('../migrations/20260708_growth_notice.sql', import.meta.url), 'utf8'));
    }
  }
  for (const [file, name] of ensureModules) {
    const module = await import(`../util/${file}`);
    await module[name]();
  }
  // C8 积分获取要求先固化既有成就的奖励快照（线上在维护窗口显式执行）。本机缺标记时补做一次：
  // 准备函数要求「C8 尚未配置」，因此在本进程内临时移除 C8 开关后执行，结束后恢复。
  const { POINTS_EARNING_C8_SNAPSHOT_MARKER } = await import('../util/pointsEarningPolicy.js');
  const c8Keys = ['POINTS_EARNING_C8_ENABLED', 'POINTS_EARNING_C8_EFFECTIVE_DAY', 'POINTS_EARNING_C8_EFFECTIVE_WEEK'];
  const [c8Snapshot] = await pool.query('SELECT 1 FROM points_economy_migration_state WHERE migration_key=? LIMIT 1', [POINTS_EARNING_C8_SNAPSHOT_MARKER]);
  if (!c8Snapshot.length && c8Keys.some(key => process.env[key])) {
    const saved = Object.fromEntries(c8Keys.map(key => [key, process.env[key]]));
    for (const key of c8Keys) delete process.env[key];
    try {
      const { preparePointsEarningC8 } = await import('../util/pointsEarningC8Preparation.js');
      console.log('[local-bootstrap] points C8 snapshot %s', JSON.stringify(await preparePointsEarningC8({ apply: true })));
    } finally {
      for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
    }
  }
  await (await import('../util/services/knowledgeManorSchema.js')).migrateKnowledgeManorSchema(pool);
  await (await import('../util/services/knowledgeManorAdminSchema.js')).migrateKnowledgeManorAdminSchema(pool);
  await (await import('../util/huaweiPushDeliverySchema.js')).ensureHuaweiPushDeliverySchema(pool);
  await (await import('../util/publicResources/schema.js')).migratePublicResourceSchema(pool);
  await (await import('../util/bookmarkIconRuntimeCheck.js')).assertBookmarkIconWorkerRuntime();
  const accountsFile = path.join(stateDir, 'accounts.json');
  let accounts;
  try { accounts = JSON.parse(await fs.readFile(accountsFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    accounts = ['root', 'test', 'user', 'visitor'].map(role => ({ id: randomUUID(), role, email: `${role}@lightnote.test`, password: randomBytes(12).toString('base64url') }));
    await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2), { mode: 0o600, flag: 'wx' });
  }
  const { seedNewUserWorkspaceData, seedNewUserCloudFile } = await import('../util/services/newUserSeedService.js');
  const { ensureCommunityChatIdentity } = await import('../util/services/communityChatIdentityService.js');
  for (const account of accounts) {
    const [rows] = await pool.query('SELECT id FROM user WHERE email=?', [account.email]);
    if (rows.length) continue;
    await pool.query('INSERT INTO user (id,email,password,password_method,login_password_set,role,alias,preferences) VALUES (?,?,?,\'scrypt\',1,?,?,?)', [account.id, account.email, await hashPassword(account.password), account.role, `本地${account.role}`, JSON.stringify({ lang: 'zh-CN' })]);
    await ensureCommunityChatIdentity({ userId: account.id });
    const seed = await seedNewUserWorkspaceData({ userId: account.id, siteUrl: process.env.SITE_URL });
    await seedNewUserCloudFile({ userId: account.id, folderId: seed.folderId, siteUrl: process.env.SITE_URL });
    console.log('[local-bootstrap] seeded role=%s', account.role);
  }
  const todoPlanUpgrade = '20261106_initial_todo_plans_v2';
  const [todoPlanUpgradeApplied] = await pool.query('SELECT name FROM local_test_migrations WHERE name=?', [todoPlanUpgrade]);
  if (!todoPlanUpgradeApplied.length) {
    const { upgradeInitialTodoPlans } = await import('../util/services/initialTodoPlanUpgradeService.js');
    const result = await upgradeInitialTodoPlans(pool, { apply: true });
    await pool.query('INSERT INTO local_test_migrations (name) VALUES (?)', [todoPlanUpgrade]);
    console.log('[local-bootstrap] todo sample upgrade %s', JSON.stringify(result));
  }
  console.log('[local-bootstrap] ready; credentials remain in .local-test/accounts.json');
} catch (error) {
  console.error('[local-bootstrap] failed code=%s', error?.code || 'BOOTSTRAP_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
  // 导入的领域服务可能持有 Redis；一次性脚本必须明确结束。
  process.exit(process.exitCode || 0);
}
