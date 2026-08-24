import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260824_admin_overview_performance.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);
const baselineUrl = new URL('../tag_db.sql', import.meta.url);
const todoBaselineUrl = new URL('../migrations/20260715_todo_action_center.sql', import.meta.url);

describe('后台总览性能索引迁移', () => {
  it('以 MySQL 5.7 兼容的幂等方式补齐笔记和待办创建时间索引', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    expect(migration).toContain("table_name='note' AND index_name='idx_note_admin_created'");
    expect(migration).toContain('`idx_note_admin_created` (`del_flag`(8),`create_time`,`create_by`(64))');
    expect(migration).toContain("table_name='todo_items' AND index_name='idx_todo_admin_created'");
    expect(migration).toContain('`idx_todo_admin_created` (`del_flag`,`create_time`,`user_id`(64))');
    expect(migration).toContain('PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
    expect(migration).not.toMatch(/ALTER\s+TABLE[^;]+ADD\s+(?:KEY|INDEX)\s+IF\s+NOT\s+EXISTS/iu);
  });

  it('基线与只读 Schema 门禁登记对应索引', async () => {
    const [baseline, todoBaseline, assertions] = await Promise.all([
      readFile(baselineUrl, 'utf8'),
      readFile(todoBaselineUrl, 'utf8'),
      readFile(assertionsUrl, 'utf8'),
    ]);
    expect(baseline).toContain('KEY `idx_note_admin_created` (`del_flag`(8),`create_time`,`create_by`(64))');
    expect(todoBaseline).toContain('KEY idx_todo_admin_created (del_flag, create_time, user_id(64))');
    expect(assertions).toContain("'[53] invalid_admin_overview_index'");
    expect(assertions).toContain("'del_flag(8),create_time,create_by(64)' expected_cols");
    expect(assertions).toContain("'del_flag,create_time,user_id(64)'");
  });
});
