import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260819_todo_navigation_badge_knowledge.sql', import.meta.url);

describe('待办导航角标帮助知识迁移', () => {
  it('完整说明计数、颜色、截止时间与提醒时间的边界', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('已逾期的未完成待办数 + 今天到期的未完成待办数');
    expect(source).toContain('<b>橙色：</b>当前只有今天到期的待办');
    expect(source).toContain('<b>红色：</b>当前至少有一项待办已经逾期');
    expect(source).toContain('它不是全部未完成待办数，也不表示优先级');
    expect(source).toContain('没有截止时间的普通待办');
    expect(source).toContain('固定周期待办则按本次计划发生日期判断');
    expect(source).toContain('依据截止时间或周期计划，不是提醒时间');
    expect(source).toContain('完成待办后，它会从角标统计中移除，尚未发送的提醒也会取消');
  });

  it('以公开帮助条目幂等写入知识库', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @todo_navigation_badge_help_title = '顶部待办角标的数字和红色、橙色分别表示什么'");
    expect(source).toContain("'帮助中心', 'public', 'html', 921");
    expect(source).toContain(
      'WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_navigation_badge_help_id)',
    );
    expect(source).toContain(
      'AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_navigation_badge_help_title)',
    );
    expect(source).toContain('SET @todo_navigation_badge_help_target_id = COALESCE(');
    expect(source).toContain('WHERE id = @todo_navigation_badge_help_target_id');
    expect(source).not.toContain(
      'WHERE id = @todo_navigation_badge_help_id OR title = @todo_navigation_badge_help_title',
    );
  });
});
