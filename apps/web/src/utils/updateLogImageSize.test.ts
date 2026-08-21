import { describe, expect, it } from 'vitest';
import {
  createUpdateLogImageHtml,
  detectUpdateLogImageSizeAtCursor,
  insertUpdateLogImageAtSelection,
  resizeUpdateLogImageAtCursor,
} from './updateLogImageSize';

describe('更新日志图片尺寸', () => {
  it('生成经过属性转义且带尺寸档位的图片 HTML', () => {
    expect(createUpdateLogImageHtml('/api/updateLog/image/log/a.png', 'A "图"', 'medium')).toBe(
      '<img src="/api/updateLog/image/log/a.png" alt="A &quot;图&quot;" data-ln-size="medium" />',
    );
  });

  it('把光标所在行的 Markdown 图片转换成可调尺寸图片', () => {
    const source = '正文\n![截图](/api/updateLog/image/log/a.png)\n结尾';
    const result = resizeUpdateLogImageAtCursor(source, source.indexOf('截图'), 'small');

    expect(result.changed).toBe(true);
    expect(result.markdown).toContain('<img src="/api/updateLog/image/log/a.png" alt="截图" data-ln-size="small" />');
    expect(detectUpdateLogImageSizeAtCursor(result.markdown, result.selectionStart)).toBe('small');
  });

  it('调整 HTML 图片时清理旧宽高但保留其他样式', () => {
    const source =
      '<img src="/api/updateLog/image/log/a.png" width="60%" style="width: 60%; height: auto; border-radius: 8px">';
    const result = resizeUpdateLogImageAtCursor(source, 10, 'full');

    expect(result.markdown).toBe(
      '<img src="/api/updateLog/image/log/a.png" style="border-radius: 8px" data-ln-size="full" />',
    );
  });

  it('光标不在图片行时只保留默认档位，不修改正文', () => {
    expect(resizeUpdateLogImageAtCursor('普通正文', 2, 'large')).toEqual({
      changed: false,
      markdown: '普通正文',
      selectionStart: 2,
    });
  });

  it('把图片作为独立块插入当前光标，而不是追加到长文末尾', () => {
    const source = '第一段\n\n第二段';
    const image = createUpdateLogImageHtml('/api/updateLog/image/log/a.png', '截图', 'medium');
    const cursor = source.indexOf('第二段');
    const result = insertUpdateLogImageAtSelection(source, cursor, cursor, image);

    expect(result.markdown).toBe(`第一段\n\n${image}\n\n第二段`);
    expect(result.selectionStart).toBe(`第一段\n\n${image}\n\n`.length);
  });

  it('插入图片时替换选区、规范空行并约束越界位置', () => {
    const image = createUpdateLogImageHtml('/image.png', '截图', 'small');

    expect(insertUpdateLogImageAtSelection('前缀-替换-后缀', 3, 5, image).markdown).toBe(`前缀-\n\n${image}\n\n-后缀`);
    expect(insertUpdateLogImageAtSelection('', 99, 120, image)).toEqual({
      markdown: `${image}\n`,
      selectionStart: `${image}\n`.length,
    });
  });
});
