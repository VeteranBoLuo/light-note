import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260819_drawing_square_manual_version_knowledge.sql', import.meta.url);

describe('方形手绘画布与手动版本帮助知识迁移', () => {
  it('说明自适应居中、旧图兼容和保存版本语义', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('根据当前窗口的可用宽度和高度自动缩放并居中');
    expect(source).toContain('不会缩放、拉伸或裁剪原有内容');
    expect(source).toContain('编辑、预览、历史版本和分享页使用相同的方形比例');
    expect(source).toContain('不会把单个小笔画放大铺满预览区');
    expect(source).toContain('点击右上角“保存版本”，或按 Command/Ctrl+S');
  });

  it('使用功能标记幂等追加到笔记管理', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('data-ln-feature="drawing-square-v2"');
    expect(source).toContain('LOCATE(@drawing_square_marker, COALESCE(content, \'\')) = 0');
    expect(source).toContain("title = '笔记管理'");
  });
});
