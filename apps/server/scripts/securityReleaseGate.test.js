import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(serverRoot, '../..');

const readProjectFile = (filePath) => readFile(path.resolve(repositoryRoot, filePath), 'utf8');

describe('安全中心 V2 发布门禁', () => {
  it('在重启应用前先迁移并执行只读 Schema 检查', async () => {
    const deployScript = await readProjectFile('scripts/deploy-server.sh');
    const uploadIndex = deployScript.indexOf('rsync -az');
    const preflightIndex = deployScript.indexOf('node scripts/preflightSecurityV2Migration.js');
    const migrationIndex = deployScript.indexOf('node util/security/migrate.js');
    const schemaCheckIndex = deployScript.indexOf('node scripts/checkSchemaAssertions.js');
    const restartIndex = deployScript.indexOf('pm2 restart $PM2');

    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(preflightIndex).toBeGreaterThan(uploadIndex);
    expect(migrationIndex).toBeGreaterThan(preflightIndex);
    expect(schemaCheckIndex).toBeGreaterThan(migrationIndex);
    expect(restartIndex).toBeGreaterThan(schemaCheckIndex);
  });

  it('覆盖安全 V2 的表、关键列、索引和数据迁移标记', async () => {
    const assertions = await readProjectFile('apps/server/migrations/schema-assertions.sql');

    for (const requiredToken of [
      'security_rule_overrides',
      'security_exceptions',
      'security_account_restrictions',
      'security_rule_tuning_suggestions',
      'security_policy_audit',
      'security_migration_state',
      'idx_security_event_cluster',
      'idx_security_event_review',
      'security-controls-v2-del-flag-separation',
    ]) {
      expect(assertions).toContain(requiredToken);
    }
  });

  it('安全初始化失败时阻止应用继续监听', async () => {
    const appSource = await readProjectFile('apps/server/app.js');
    const migrationIndex = appSource.indexOf('await ensureSecurityTables();');
    const exitIndex = appSource.indexOf('process.exit(1);', migrationIndex);
    const listenIndex = appSource.indexOf('app.listen(9001');

    expect(migrationIndex).toBeGreaterThanOrEqual(0);
    expect(exitIndex).toBeGreaterThan(migrationIndex);
    expect(listenIndex).toBeGreaterThan(exitIndex);
  });
});
