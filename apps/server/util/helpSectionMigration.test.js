import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260902_help_center_sections.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);
const utilDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(utilDir, '../../..');

describe('帮助中心栏目迁移', () => {
  it('以 MySQL 5.7 兼容方式新增元数据列，并只对空栏目做一次性回填', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    expect(migration).toContain("table_name='knowledge_base'");
    expect(migration).toContain("column_name='help_section'");
    expect(migration).toContain('ADD COLUMN `help_section` varchar(50) DEFAULT NULL');
    expect(migration).toContain("WHERE category='帮助中心'");
    expect(migration).toContain("help_section IS NULL OR TRIM(help_section)=''");
    expect(migration).not.toMatch(/ALTER\s+TABLE[^;]+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/iu);
  });

  it('只读 Schema 门禁同时约束列形态和公开文章栏目完整性', async () => {
    const assertions = await readFile(assertionsUrl, 'utf8');
    expect(assertions).toContain("'[66] missing_help_section_column'");
    expect(assertions).toContain("'[66] invalid_help_section_column'");
    expect(assertions).toContain("'[66] missing_public_help_section'");
    expect(assertions).toContain("NULLIF(TRIM(help_section), '') IS NULL");
  });

  it('发布先执行幂等迁移，再运行只读断言并重启服务', async () => {
    const deploy = await readFile(path.resolve(repositoryRoot, 'scripts/deploy-server.sh'), 'utf8');
    const migrationIndex = deploy.indexOf('node scripts/migrateHelpCenterSections.js');
    const assertionIndex = deploy.indexOf('node scripts/checkSchemaAssertions.js');
    const restartIndex = deploy.indexOf('pm2 restart $PM2');

    expect(migrationIndex).toBeGreaterThanOrEqual(0);
    expect(assertionIndex).toBeGreaterThan(migrationIndex);
    expect(restartIndex).toBeGreaterThan(assertionIndex);
  });
});
