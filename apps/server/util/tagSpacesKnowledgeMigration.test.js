import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260828_tag_spaces_knowledge.sql', import.meta.url);

describe('统一标签模块帮助知识迁移', () => {
  it('说明单一入口、标签目录与弹框编辑', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('标签既是分类，也是内容入口');
    expect(source).toContain('顶部“标签”是统一入口');
    expect(source).toContain('直接打开你最近使用的标签');
    expect(source).toContain('没有另一套“标签空间”需要维护');
    expect(source).toContain('桌面端左侧目录列出全部标签');
    expect(source).toContain('将鼠标移到标签上或右键');
    expect(source).toContain('新建或编辑不再跳转到单独页面');
    expect(source).toContain('标签说明会直接展示在标签档案中');
    expect(source).not.toContain('右侧说明卡');
    expect(source).toContain('“常一起使用”展示与当前标签共同出现在同一资源上的其他标签');
    expect(source).toContain('“最近更新”与“最近加入”');
    expect(source).toContain('PC 端可在当前标签内搜索，移动端继续使用顶栏全局搜索');
    expect(source).toContain('点击“分析标签”会立即读取当前关联资料并生成分析');
    expect(source).toContain('待办是行动对象，不纳入标签的书签、笔记和文件聚合');
  });

  it('以公开帮助条目幂等写入知识库', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @tag_spaces_help_title = '标签如何使用'");
    expect(source).toContain("SET @tag_spaces_help_legacy_title = '标签空间如何使用'");
    expect(source).toContain("'帮助中心', 'public', 'html', 922");
    expect(source).toContain('admin_archived = 0');
    expect(source).toContain('START TRANSACTION');
    expect(source).toContain('COMMIT');
    expect(source).toContain('WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @tag_spaces_help_id)');
    expect(source).toContain('WHERE title IN (@tag_spaces_help_title, @tag_spaces_help_legacy_title)');
    expect(source).toContain('SET @tag_spaces_help_target_id = COALESCE(');
    expect(source).toContain('WHERE id = @tag_spaces_help_target_id');
  });
});
