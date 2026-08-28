import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260828_tag_spaces_knowledge.sql', import.meta.url);

describe('标签空间帮助知识迁移', () => {
  it('说明单心智模型、浏览与管理边界', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('每个标签都是一个空间');
    expect(source).toContain('它不是另一套专题或文件夹');
    expect(source).toContain('默认列表不显示没有任何资源的空标签');
    expect(source).toContain('“最近更新”与“最近加入”');
    expect(source).toContain('PC 端还可在当前空间内搜索，移动端继续使用顶栏全局搜索');
    expect(source).toContain('之前的搜索、筛选、排序和滚动位置会保留');
    expect(source).toContain('<b>标签空间：</b>用于浏览和回看内容');
    expect(source).toContain('<b>标签管理：</b>用于新建、编辑、排序和删除标签');
    expect(source).toContain('待办是行动对象，不属于标签空间');
  });

  it('以公开帮助条目幂等写入知识库', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @tag_spaces_help_title = '标签空间如何使用'");
    expect(source).toContain("'帮助中心', 'public', 'html', 922");
    expect(source).toContain('admin_archived = 0');
    expect(source).toContain('START TRANSACTION');
    expect(source).toContain('COMMIT');
    expect(source).toContain('WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @tag_spaces_help_id)');
    expect(source).toContain('AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @tag_spaces_help_title)');
    expect(source).toContain('SET @tag_spaces_help_target_id = COALESCE(');
    expect(source).toContain('WHERE id = @tag_spaces_help_target_id');
  });
});
