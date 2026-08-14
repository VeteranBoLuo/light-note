import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260813_points_economy_c4.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);
const checkerUrl = new URL('../scripts/checkSchemaAssertions.js', import.meta.url);

describe('积分经济 C4 迁移门禁', () => {
  it('MySQL 5.7 迁移使用 information_schema 幂等补列，并保留一次性回填标记', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');
    const executable = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/iu);
    expect(source).toContain("migration_key = 'points-economy-c4-paid-pity-v1'");
    expect(source).toContain("WHERE @c4_should_backfill = 1");
    expect(source).toContain('idx_points_economy_metrics');
    expect(source).toContain("INSERT IGNORE INTO points_economy_migration_state");
  });

  it('只读 Schema 门禁同时检查收据结构、聚合索引和回填标记', async () => {
    const source = await readFile(fileURLToPath(assertionsUrl), 'utf8');
    expect(source).toContain('uk_points_economy_user_request');
    expect(source).toContain('idx_points_economy_metrics');
    expect(source).toContain('missing_points_economy_migration_state');
    expect(source).toContain('points-economy-c4-paid-pity-v1');
    const checker = await readFile(fileURLToPath(checkerUrl), 'utf8');
    expect(checker).toContain("error?.code !== 'ER_NO_SUCH_TABLE'");
    expect(checker).toContain("console.error('[schema-check] missing_table:");
  });
});
