import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260819_todo_series_actions_knowledge.sql', import.meta.url);

describe('待办系列操作帮助知识迁移', () => {
  it('明确区分可恢复暂停与按范围永久删除', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('临时停用使用“暂停系列”，永久结束使用“删除”并选择范围');
    expect(source).toContain('选择“暂停系列”后，系统会先要求确认');
    expect(source).toContain('<b>仅删除本次：</b>');
    expect(source).toContain('<b>删除本次及以后：</b>');
    expect(source).toContain('<b>删除整个系列：</b>');
    expect(source).toContain('以后可能继续时应选择暂停，不要选择删除');
    expect(source).toContain('不再提供含义接近删除、但无法恢复的“停止整个系列”');
  });

  it('以公开帮助条目幂等写入知识库', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @todo_series_actions_help_title = '暂停、恢复和删除任务系列有什么区别'");
    expect(source).toContain("'帮助中心', 'public', 'html', 922");
    expect(source).toContain('WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_series_actions_help_id)');
    expect(source).toContain(
      'AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_series_actions_help_title)',
    );
    expect(source).toContain('WHERE id = @todo_series_actions_help_id OR title = @todo_series_actions_help_title');
  });
});
