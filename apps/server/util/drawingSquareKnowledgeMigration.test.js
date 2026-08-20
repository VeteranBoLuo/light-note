import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260819_drawing_square_manual_version_knowledge.sql', import.meta.url);

describe('方形手绘画布与手动版本帮助知识迁移', () => {
  it('说明自适应居中、旧图兼容和保存版本语义', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('宽屏默认以 100% 显示');
    expect(source).toContain('窄屏才按当前窗口的可用宽度自动缩小并居中');
    expect(source).toContain('按住鼠标中键或右键直接拖动画布');
    expect(source).toContain('鼠标滚轮上下会以指针所在位置为中心连续缩放');
    expect(source).toContain('横向滚动或 Shift+滚轮可以左右平移');
    expect(source).toContain('工具栏问号会集中说明键盘和鼠标操作');
    expect(source).toContain('直线、箭头、矩形、圆角矩形、椭圆、三角形和菱形');
    expect(source).toContain('通过端点或四角手柄缩放');
    expect(source).toContain('颜色与尺寸合并在“样式”面板');
    expect(source).toContain('文字工具完成输入后不会继续显示选择虚线');
    expect(source).toContain('按住边框内部的空白区域也可以整体拖动');
    expect(source).toContain('不会缩放、拉伸或裁剪原有内容');
    expect(source).toContain('编辑、预览、历史版本和分享页使用相同的方形比例');
    expect(source).toContain('进入直接预览时会先把画纸中心对齐到阅读区中部');
    expect(source).toContain('仍可上下滚动查看完整画纸');
    expect(source).toContain('取景最多放大到完整画纸缩略图的 3 倍');
    expect(source).toContain('单个小点也不会被放大铺满预览区');
    expect(source).toContain('点击右上角“保存版本”，或按 Command/Ctrl+S');
  });

  it('使用功能标记幂等新增或替换笔记管理中的既有章节', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('data-ln-feature="drawing-square-v2"');
    expect(source).toContain("WHEN LOCATE(@drawing_square_marker, COALESCE(content, '')) = 0");
    expect(source).toMatch(/LOCATE\(\s*@drawing_square_section_end/u);
    expect(source).toContain('CHAR_LENGTH(@drawing_square_section_end)');
    expect(source).toContain("title = '笔记管理'");
  });
});
