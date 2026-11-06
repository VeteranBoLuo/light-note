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
  '20261102_cloud_multipart_uploads.sql',
  '20260909_image_preview_metadata.sql', '20260909_organize_file_evidence.sql',
  '20260909_note_import_tasks.sql', '20260909_note_import_progress.sql', '20260909_visitor_examples.sql',
  '20260821_cloud_folder_tree.sql', '20260908_user_activity.sql', '20260914_resource_reuse.sql',
  '20260813_points_economy_c4.sql', '20260826_points_economy_c5_storage_limits.sql',
  '20260814_points_earning_c5.sql', '20260825_ai_bonus_wallet_and_afdian_rewards.sql',
  '20261105_update_logs_product_version.sql',
];
const ensureModules = [
  ['security/index.js', 'ensureSecurityTables'], ['notification.js', 'ensureNotificationTable'],
  ['points.js', 'ensurePointsSchema'], ['aiBonusWalletSchema.js', 'ensureAiBonusWalletSchema'],
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
  await pool.query('CREATE TABLE IF NOT EXISTS local_test_migrations (name VARCHAR(191) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  for (const file of migrations) {
    const [applied] = await pool.query('SELECT name FROM local_test_migrations WHERE name=?', [file]);
    if (applied.length) continue;
    console.log('[local-bootstrap] applying %s', file);
    await applySql(await fs.readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    await pool.query('INSERT INTO local_test_migrations (name) VALUES (?)', [file]);
  }
  for (const [file, name] of ensureModules) {
    const module = await import(`../util/${file}`);
    await module[name]();
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
