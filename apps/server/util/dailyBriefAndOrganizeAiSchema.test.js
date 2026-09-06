import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_BRIEF_SCHEMA_SQL } from './dailyBriefSchema.js';

const migration = readFileSync(
  new URL('../migrations/20260904_daily_brief_and_ai_tag_suggestions.sql', import.meta.url),
  'utf8',
);
const rollback = readFileSync(
  new URL('../migrations/20260904_daily_brief_and_ai_tag_suggestions_rollback.sql', import.meta.url),
  'utf8',
);
const organizeRuntime = readFileSync(new URL('./organizeSchema.js', import.meta.url), 'utf8');
const assertions = readFileSync(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8');

describe('每日简报与整理 AI 建议 Schema 契约', () => {
  it('迁移与运行时建表共用幂等键、租约和复审字段', () => {
    const dailyRuntime = DAILY_BRIEF_SCHEMA_SQL.join('\n');
    for (const source of [migration, dailyRuntime]) {
      expect(source).toContain('workbench_daily_briefs');
      expect(source).toContain('uk_workbench_daily_brief_user_date');
      expect(source).toContain('facts_json JSON NOT NULL');
      expect(source).toContain('lease_expires_at DATETIME');
      expect(source).toContain('ENGINE=InnoDB ROW_FORMAT=DYNAMIC');
    }
    for (const source of [migration, organizeRuntime]) {
      expect(source).toContain('organize_ai_tag_batches');
      expect(source).toContain('uk_organize_ai_tag_request');
      expect(source).toContain('idx_organize_ai_tag_claim');
      expect(source).toContain('organize_ai_tag_suggestions');
      expect(source).toContain('source_hash');
      expect(source).toContain('current_tags_json');
      expect(source).toContain('recommended_tags_json');
      expect(source).toContain('accepted_tags_json');
      expect(source).toContain('ENGINE=InnoDB ROW_FORMAT=DYNAMIC');
      // 持久层只保存哈希与建议，不复制用户正文。
      expect(source).not.toContain('source_text');
    }
    expect(migration).not.toContain('tag_active_name_duplicates');
    expect(migration).not.toMatch(/(?:DELETE FROM|UPDATE)\s+(?:resource_tag_relations|tag)\b/iu);
    expect(migration).toContain('uk_tag_active_user_name');
    expect(migration).toContain('GENERATED ALWAYS AS');
    expect(migration).toContain('ALTER TABLE tag ROW_FORMAT=DYNAMIC');
    expect(migration).toContain("COLUMN_NAME='active_name'");
    expect(migration).toContain("INDEX_NAME='uk_tag_active_user_name'");
    // tag_relations 已由正式迁移退休；新迁移不能重新依赖已不存在的旧表。
    expect(migration).not.toMatch(/(?:FROM|INTO)\s+tag_relations\b/iu);
  });

  it('只读 Schema 门禁与回滚覆盖全部新表', () => {
    expect(assertions).toContain("'[68] missing_daily_brief_or_ai_suggestion_table'");
    expect(assertions).toContain('uk_workbench_daily_brief_user_date');
    expect(assertions).toContain('uk_organize_ai_tag_request');
    expect(assertions).toContain('uk_organize_ai_tag_batch_resource');
    expect(assertions).toContain('uk_tag_active_user_name');
    expect(assertions).toContain('invalid_tag_active_name_generated_column');
    expect(assertions).toContain("UPPER(actual.extra) NOT LIKE '%STORED GENERATED%'");
    expect(assertions).toContain("actual.index_columns <> 'user_id,active_name'");
    expect(assertions).toContain('invalid_daily_brief_or_ai_suggestion_table_format');
    expect(assertions).toContain("UPPER(actual.row_format) <> 'DYNAMIC'");
    expect(assertions).toContain('invalid_daily_brief_or_ai_suggestion_index_shape');
    expect(assertions).toContain("'status,lease_expires_at,create_time'");
    expect(rollback).toContain('DROP TABLE IF EXISTS organize_ai_tag_suggestions');
    expect(rollback).toContain('DROP TABLE IF EXISTS organize_ai_tag_batches');
    expect(rollback).toContain('DROP TABLE IF EXISTS workbench_daily_briefs');
    expect(rollback).toContain('DROP INDEX uk_tag_active_user_name');
    expect(rollback).toContain('DROP COLUMN active_name');
  });
});
