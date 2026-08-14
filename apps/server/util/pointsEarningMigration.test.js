import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260814_points_earning_c5.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);
const schemaUrl = new URL('./growthCenterSchema.js', import.meta.url);

describe('积分获取 C5 迁移门禁', () => {
  it('使用显式迁移固化旧承诺、事实账本和对账基线', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');
    const executable = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/ADD\s+(?:COLUMN|INDEX)\s+IF\s+NOT\s+EXISTS/iu);
    expect(source).toContain('points-earning-c5-achievement-snapshots-v1');
    expect(source).toContain('points-earning-c5-meaningful-activity-v1');
    expect(source).toContain('points-earning-c5-baseline-v1');
    expect(source).toContain("ua.policy_version=COALESCE(ua.policy_version, 'points-earning-legacy')");
    expect(source).toContain("'activity_bookmark'");
    expect(source).toContain('points_ledger_baselines');
  });

  it('应用启动只补 Schema，不执行历史大表回填', async () => {
    const source = await readFile(fileURLToPath(schemaUrl), 'utf8');
    const ensureBody = source.slice(source.indexOf('export function ensureGrowthCenterSchema()'));
    expect(ensureBody).not.toContain('await migrateLegacyAchievementState()');
    expect(ensureBody).not.toContain('await migrateLegacyAchievementRewardSnapshots()');
    expect(ensureBody).not.toContain('await migrateGrowthActivityHistory()');
    expect(ensureBody).not.toContain('await migrateC5BaselineOnce()');
  });

  it('只读 Schema 门禁覆盖 C5 表、索引和三个迁移标记', async () => {
    const source = await readFile(fileURLToPath(assertionsUrl), 'utf8');
    expect(source).toContain('[49] missing_points_earning_c5_table');
    expect(source).toContain('idx_points_log_policy_time');
    expect(source).toContain('idx_user_growth_points');
    expect(source).toContain('idx_points_economy_user_status_time');
    expect(source).toContain('uk_points_campaign_request');
    expect(source).toContain('points-earning-c5-achievement-snapshots-v1');
    expect(source).toContain('points-earning-c5-meaningful-activity-v1');
    expect(source).toContain('points-earning-c5-baseline-v1');
  });
});
