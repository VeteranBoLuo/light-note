import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../migrations/20260827_new_user_drawing_sample_title_correction_knowledge.sql',
  import.meta.url,
);

describe('新账号手绘示例帮助知识迁移', () => {
  it('以完整目标内容同步，不依赖旧文案先存在', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('SET @new_user_samples_content =');
    expect(source).toContain('5 篇分别展示富文本、Markdown、思维导图与手绘能力的示例笔记');
    expect(source).toContain('其中手绘样例标题为“手绘笔记示例”');
    expect(source).toContain('共享游客账号会单独保留同一篇手绘示例用于体验');
    expect(source).not.toContain('REPLACE(');
    expect(source).not.toContain('其中手绘样例标题为“上色”');
  });

  it('缺失时插入、存在时按固定 ID 或标题幂等覆盖', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @new_user_samples_id = '8f1795d6-2991-40f1-835e-fae25eb1c3d9'");
    expect(source).toContain('WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @new_user_samples_id)');
    expect(source).toContain('AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @new_user_samples_title)');
    expect(source).toContain('WHERE id = @new_user_samples_id OR title = @new_user_samples_title');
  });
});
