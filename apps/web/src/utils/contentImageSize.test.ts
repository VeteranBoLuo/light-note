// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyContentImageSizeToElement,
  applyContentImageSizeToHtmlTag,
  createSizedContentImageHtml,
  decorateRenderedMarkdownImageIndexes,
  locateMarkdownContentImages,
  resizeMarkdownContentImage,
} from './contentImageSize';

describe('笔记正文图片尺寸', () => {
  it('生成经过属性转义且带尺寸档位的安全图片 HTML', () => {
    expect(createSizedContentImageHtml('/a.png?x=1&y=2', 'A "图"', 'medium')).toBe(
      '<img src="/a.png?x=1&amp;y=2" alt="A &quot;图&quot;" data-ln-size="medium" />',
    );
  });

  it('调整 HTML 图片时清理旧宽高但保留无关样式和属性', () => {
    const source = '<img src="/a.png" width="60%" height=300 style="width:60%; height:auto; border-radius:8px">';
    expect(applyContentImageSizeToHtmlTag(source, 'large')).toBe(
      '<img src="/a.png" style="border-radius:8px" data-ln-size="large" />',
    );
  });

  it('直接调整富文本图片元素时清理冲突尺寸', () => {
    const image = document.createElement('img');
    image.setAttribute('width', '320');
    image.setAttribute('height', '180');
    image.style.cssText = 'width: 320px; height: 180px; border-radius: 8px';

    applyContentImageSizeToElement(image, 'full');

    expect(image.getAttribute('data-ln-size')).toBe('full');
    expect(image.hasAttribute('width')).toBe(false);
    expect(image.hasAttribute('height')).toBe(false);
    expect(image.style.width).toBe('');
    expect(image.style.height).toBe('');
    expect(image.style.borderRadius).toBe('8px');
  });

  it('按渲染顺序把 Markdown 图片转换成可持久化尺寸的 HTML 图片', () => {
    const source = '第一张 ![A](/a.png)\n\n第二张 ![B](/b.png "标题")';
    const result = resizeMarkdownContentImage(source, 1, 'small');

    expect(result.changed).toBe(true);
    expect(result.markdown).toContain('第一张 ![A](/a.png)');
    expect(result.markdown).toContain(
      '<img src="/b.png" alt="B" title="标题" data-ln-size="small" />',
    );
  });

  it('忽略代码块和行内代码里的伪图片，避免点错真实图片', () => {
    const source = '```md\n![代码](/code.png)\n```\n`![行内](/inline.png)`\n![真实](/real.png)';
    const images = locateMarkdownContentImages(source);

    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/real.png');
  });

  it('给预览图片补稳定的源码顺序索引', () => {
    const html = decorateRenderedMarkdownImageIndexes('<p><img src="/a.png"><img src="/b.png"></p>');
    expect(html).toContain('data-ln-source-image-index="0"');
    expect(html).toContain('data-ln-source-image-index="1"');
  });
});
