import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260820_todo_preview_resource_links_knowledge.sql', import.meta.url);

describe('待办详情预览与关联资料帮助知识迁移', () => {
  it('完整说明预览、编辑、四象限点击与关联资料边界', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('默认打开详情预览，不会直接进入编辑表单');
    expect(source).toContain('桌面端也可以点击详情抽屉外的遮罩关闭预览');
    expect(source).toContain('四象限卡片的标题、优先级、日期和空白区域都可以打开详情');
    expect(source).toContain('只有窄屏空间不足时才会省略');
    expect(source).toContain('无论是在列表、详情预览还是编辑器内，都可以点击胶囊打开对应资料');
    expect(source).toContain('删除关联也只解除待办与资料之间的关系，不删除资料本身');
  });

  it('以公开帮助条目幂等写入且只更新唯一目标', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @todo_preview_help_title = '查看和编辑待办：详情预览、清单与关联资料'");
    expect(source).toContain("'帮助中心', 'public', 'html', 923");
    expect(source).toContain('WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_preview_help_id)');
    expect(source).toContain('AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_preview_help_title)');
    expect(source).toContain('SET @todo_preview_help_target_id = COALESCE(');
    expect(source).toContain('WHERE id = @todo_preview_help_target_id');
    expect(source).not.toContain('WHERE id = @todo_preview_help_id OR title = @todo_preview_help_title');
  });
});
