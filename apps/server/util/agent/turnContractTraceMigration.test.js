import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../migrations/20260819_agent_turn_contract_trace.sql', import.meta.url);
const assertionsUrl = new URL('../../migrations/schema-assertions.sql', import.meta.url);

describe('Agent Turn Contract trace 迁移', () => {
  it('以 MySQL 5.7 兼容方式幂等增加独立 trace 字段', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("TABLE_NAME = 'agent_logs'");
    expect(source).toContain("COLUMN_NAME = 'turn_contract_trace'");
    expect(source).toContain('ADD COLUMN `turn_contract_trace` text DEFAULT NULL');
    expect(source).toContain("SET @ddl := IF(");
    expect(source).toContain('PREPARE stmt FROM @ddl');
  });

  it('发布门禁会阻止缺少 trace 字段的环境重启', async () => {
    const source = await readFile(fileURLToPath(assertionsUrl), 'utf8');
    expect(source).toContain('[50] missing_agent_turn_contract_trace_column');
    expect(source).toContain("actual.column_name='turn_contract_trace'");
  });
});
