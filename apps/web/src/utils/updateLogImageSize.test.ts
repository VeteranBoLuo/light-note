import { describe, expect, it } from 'vitest';
import {
  createUpdateLogImageHtml,
  detectUpdateLogImageSizeAtCursor,
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
    expect(result.markdown).toContain(
      '<img src="/api/updateLog/image/log/a.png" alt="截图" data-ln-size="small" />',
    );
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
});
