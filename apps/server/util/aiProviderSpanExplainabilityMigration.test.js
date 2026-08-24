import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260825_ai_provider_span_explainability.sql', import.meta.url);

describe('Provider Span 可解释性迁移', () => {
  it('幂等增加调用顺序、计费归属、修复触发码与保守预算', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');
    for (const column of ['billing_scope', 'sequence_no', 'trigger_code', 'estimated_tokens']) {
      expect(source).toContain(`column_name='${column}'`);
      expect(source).toContain(`ADD COLUMN \`${column}\``);
    }
    expect(source).toContain("SET billing_scope='platform'");
    expect(source).toContain("RIGHT(stage, 7) = '_repair'");
  });

  it('只处理治理元数据，不读取或写入用户内容字段', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');
    const executable = source.replace(/^--.*$/gmu, '');
    expect(executable).not.toMatch(/\b(?:prompt|content|question|title|url|image|answer)\b/iu);
    expect(executable).not.toMatch(/DELETE\s+FROM/iu);
  });
});
