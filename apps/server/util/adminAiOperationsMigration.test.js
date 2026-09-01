import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260901_ai_operations_center.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);

describe('AI 运行中心索引迁移', () => {
  it('以 MySQL 5.7 兼容的幂等方式补齐根执行游标与 Provider 筛选索引', async () => {
    const source = await readFile(migrationUrl, 'utf8');
    expect(source).toContain("table_name='ai_executions'");
    expect(source).toContain("index_name='idx_ai_execution_admin_created'");
    expect(source).toContain('`idx_ai_execution_admin_created` (`created_at`,`id`)');
    expect(source).toContain("table_name='ai_provider_spans'");
    expect(source).toContain("index_name='idx_ai_provider_span_provider_execution'");
    expect(source).toContain('`idx_ai_provider_span_provider_execution` (`provider`,`execution_id`)');
    expect(source).toContain('PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
    expect(source).toContain('PREPARE stmt FROM @provider_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
    expect(source.replace(/^--.*$/gmu, '')).not.toMatch(/ADD\s+(?:KEY|INDEX)\s+IF\s+NOT\s+EXISTS/iu);
  });

  it('只读 Schema 门禁登记相同索引', async () => {
    const assertions = await readFile(assertionsUrl, 'utf8');
    expect(assertions).toContain("'[64] invalid_ai_operations_index'");
    expect(assertions).toContain("actual.cols <> 'created_at,id'");
    expect(assertions).toContain("'[64] invalid_ai_operations_provider_index'");
    expect(assertions).toContain("actual.cols <> 'provider,execution_id'");
  });
});
