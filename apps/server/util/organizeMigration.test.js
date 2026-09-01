import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../migrations/20260831_organize_center_v2.sql', import.meta.url), 'utf8');
const rollback = readFileSync(
  new URL('../migrations/20260831_organize_center_v2_rollback.sql', import.meta.url),
  'utf8',
);
const healthScanMigration = readFileSync(
  new URL('../migrations/20260901_bookmark_health_scan_jobs.sql', import.meta.url),
  'utf8',
);
const healthScanRollback = readFileSync(
  new URL('../migrations/20260901_bookmark_health_scan_jobs_rollback.sql', import.meta.url),
  'utf8',
);
const assertions = readFileSync(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8');
const runtimeEnsure = readFileSync(new URL('./organizeSchema.js', import.meta.url), 'utf8');

describe('整理中心迁移契约', () => {
  it('先补齐精确 URL、忽略事实、动作幂等与健康观测，再执行历史回填', () => {
    expect(migration).toContain('ADD COLUMN `url_exact_hash` BINARY(32)');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS organize_issue_suppressions');
    expect(migration).toContain('subject_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS organize_action_requests');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS bookmark_health');
    expect(migration.indexOf('CREATE TABLE IF NOT EXISTS bookmark_health')).toBeLessThan(
      migration.indexOf('ALTER TABLE `bookmark_health` ADD COLUMN'),
    );
    expect(migration).toContain('checked_url_hash = b.url_exact_hash');
  });

  it('Schema 门禁同时检查缺列、缺索引与错误哈希，而不只检查 NULL', () => {
    expect(assertions).toContain('[65] missing_organize_table');
    expect(assertions).toContain('idx_bookmark_exact_url');
    expect(assertions).toContain('url_exact_hash <=> UNHEX(SHA2');
    expect(assertions).toContain('bookmark_health_scan_jobs');
    expect(assertions).toContain('idx_bookmark_health_scan_item_claim');
  });

  it('全量健康检测使用可恢复任务与逐项快照，运行时 ensure 和显式迁移保持一致', () => {
    for (const source of [healthScanMigration, runtimeEnsure]) {
      expect(source).toMatch(/CREATE TABLE IF NOT EXISTS\s+`?bookmark_health_scan_jobs`?/);
      expect(source).toMatch(/CREATE TABLE IF NOT EXISTS\s+`?bookmark_health_scan_items`?/);
      expect(source).toContain('lease_expires_at');
      expect(source).toContain('attempts');
    }
    expect(healthScanRollback).toContain('DROP TABLE IF EXISTS `bookmark_health_scan_items`');
    expect(healthScanRollback).toContain('DROP TABLE IF EXISTS `bookmark_health_scan_jobs`');
  });

  it('运行时 ensure 只补结构，不执行历史数据回填', () => {
    expect(runtimeEnsure).not.toMatch(/UPDATE\s+bookmark\b/i);
    expect(runtimeEnsure).not.toMatch(/UPDATE\s+bookmark_health\b/i);
  });

  it('紧急回滚包含所有新增表、列和索引', () => {
    expect(rollback).toContain('DROP TABLE IF EXISTS organize_action_requests');
    expect(rollback).toContain('DROP TABLE IF EXISTS organize_issue_suppressions');
    expect(rollback).toContain('DROP KEY `idx_bookmark_exact_url`');
    expect(rollback).toContain('DROP COLUMN `url_exact_hash`');
  });
});
