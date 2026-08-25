import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260825_ai_execution_rule_versions_and_lease.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);

describe('AI Execution 规则版本与租约迁移', () => {
  it('幂等增加两个规则版本、租约和回收索引', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');
    for (const column of ['billing_rule_version', 'validation_rule_version', 'lease_expires_at']) {
      expect(source).toContain(`column_name='${column}'`);
      expect(source).toContain(`ADD COLUMN \`${column}\``);
    }
    expect(source).toContain('idx_ai_execution_lease');
    expect(source).toContain("WHERE status='running' AND lease_expires_at IS NULL");
  });

  it('Schema 门禁同步要求列与 status/lease 复合索引', async () => {
    const source = await readFile(fileURLToPath(assertionsUrl), 'utf8');
    expect(source).toContain('missing_ai_execution_policy_column');
    expect(source).toContain('invalid_ai_execution_lease_index');
    expect(source).toContain("'status,lease_expires_at'");
  });
});
