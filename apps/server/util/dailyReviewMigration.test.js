import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const utilDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(utilDir, '../../..');
const readProjectFile = (filePath) => readFile(path.resolve(repositoryRoot, filePath), 'utf8');

describe('daily review migration and release order', () => {
  it('发布先幂等升级每日回顾 Schema，再执行只读断言，最后重启进程', async () => {
    const deployScript = await readProjectFile('scripts/deploy-server.sh');
    const ensureIndex = deployScript.indexOf('node scripts/ensureDailyReviewSchema.js');
    const assertionIndex = deployScript.indexOf('node scripts/checkSchemaAssertions.js');
    const restartIndex = deployScript.indexOf('pm2 restart $PM2');

    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(assertionIndex).toBeGreaterThan(ensureIndex);
    expect(restartIndex).toBeGreaterThan(assertionIndex);
  });

  it('显式 migration、运行时 ensure、基线 Schema 与断言使用同一表和 last_shown_date', async () => {
    const [migration, runtimeSchema, baselineSchema, assertions] = await Promise.all([
      readProjectFile('apps/server/migrations/20260901_daily_review.sql'),
      readProjectFile('apps/server/util/dailyReviewSchema.js'),
      readProjectFile('apps/server/tag_db.sql'),
      readProjectFile('apps/server/migrations/schema-assertions.sql'),
    ]);

    for (const source of [migration, runtimeSchema, baselineSchema, assertions]) {
      expect(source).toContain('daily_content_review_sessions');
      expect(source).toContain('daily_content_review_items');
      expect(source).toContain('resource_date');
      // 历史奖励型每日回顾已经占用这两个表名；新版内容回顾必须与它并存，不能再次复用。
      expect(source).not.toMatch(/\bdaily_review_sessions\b/);
      expect(source).not.toMatch(/\bdaily_review_items\b/);
    }
    for (const source of [migration, runtimeSchema, assertions]) expect(source).toContain('last_shown_date');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS growth_recap_state');
    expect(runtimeSchema).toContain('GROWTH_RECAP_STATE_TABLE_SQL');
    for (const token of [
      '[63]',
      'invalid_daily_review_table_shape',
      'invalid_daily_review_column_shape',
      'invalid_daily_review_index_shape',
      'invalid_daily_review_foreign_key_mapping',
      'invalid_growth_recap_last_shown_date_shape',
      'BINARY status',
      'BINARY resource_type',
      "NULLIF(TRIM(reason_tag_id), '')",
    ]) {
      expect(assertions).toContain(token);
    }
  });
});
