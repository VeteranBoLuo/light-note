import { describe, expect, it } from 'vitest';
import {
  createMarkdownRichMediaTextBlockHtml,
  createRichMediaTextBlockHtml,
  createRichMediaTextItemHtml,
  createRichMediaTextFromImage,
  normalizeRichMediaTextHtml,
} from './richMediaText';

describe('richMediaText', () => {
  it('creates one image paired with one editable caption', () => {
    const html = createRichMediaTextBlockHtml('https://example.com/a.png?x=1&y=2', '窗户 "主卧"');

    expect(html).toContain('class="ln-media-text"');
    expect(html).toContain('data-ln-media-position="left"');
    expect(html).toContain('data-ln-media-width="36"');
    expect(html).toContain('src="https://example.com/a.png?x=1&amp;y=2"');
    expect(html).toContain('alt="窗户 &quot;主卧&quot;"');
    expect(html).toContain('<figcaption class="ln-media-text__content"><p><br></p></figcaption>');
  });

  it('creates an additional row without another outer block', () => {
    const html = createRichMediaTextItemHtml('/images/second.png', '第二张');
    expect(html.match(/ln-media-text__item/gu)).toHaveLength(1);
    expect(html).not.toContain('class="ln-media-text"');
  });

  it('creates a Markdown raw HTML block with an escaped editable caption', () => {
    const html = createMarkdownRichMediaTextBlockHtml('/images/a.png?x=1&y=2', '图 "1"', '说明 <一>\n第二行');
    expect(html).toContain('class="ln-media-text"');
    expect(html).toContain('src="/images/a.png?x=1&amp;y=2"');
    expect(html).toContain('alt="图 &quot;1&quot;"');
    expect(html).toContain('<p>说明 &lt;一&gt;<br>第二行</p>');
    expect(html).not.toContain('<p><br></p>');
  });

  it('normalizes invalid layout values and strips ordinary image layout state', () => {
    const html = normalizeRichMediaTextHtml(`
      <section class="ln-media-text" data-ln-media-position="center" data-ln-media-width="99" data-ln-media-selected="1">
        <figure class="ln-media-text__item" data-ln-media-item-selected="1">
          <div class="ln-media-text__media">
            <img src="/a.png" width="400" height="300" align="left" data-ln-size="small"
              style="float:left; width:40%; height:300px; border-radius:8px" data-mce-selected="1">
          </div>
          <figcaption class="ln-media-text__content"><p>说明</p></figcaption>
        </figure>
      </section>
    `);

    expect(html).toContain('data-ln-media-position="left"');
    expect(html).toContain('data-ln-media-width="36"');
    expect(html).not.toContain('data-ln-media-selected');
    expect(html).not.toContain('data-ln-media-item-selected');
    expect(html).not.toContain('data-mce-selected');
    expect(html).not.toContain('data-ln-size');
    expect(html).not.toContain('float:');
    expect(html).not.toContain('width="400"');
    expect(html).toContain('border-radius: 8px');
    expect(html).toContain('<p>说明</p>');
  });

  it('converts the existing image without losing its source, description or title', () => {
    const original = document.createElement('div');
    original.innerHTML =
      '<p>之前<img src="/a.png?x=1&amp;y=2" alt="窗户 &quot;一&quot;" title="原图" class="photo mce-object-selected" width="400" height="300" data-ln-size="small" data-mce-selected="1" style="float:right;width:40%;border-radius:8px">之后</p>';
    const image = original.querySelector('img')!;
    const conversion = createRichMediaTextFromImage(image)!;
    const converted = conversion.block.querySelector('img')!;

    expect(conversion.target).toBe(image);
    expect(converted.getAttribute('src')).toBe('/a.png?x=1&y=2');
    expect(converted.alt).toBe('窗户 "一"');
    expect(converted.title).toBe('原图');
    expect(converted.className).toBe('photo');
    expect(converted.style.borderRadius).toBe('8px');
    expect(converted.hasAttribute('width')).toBe(false);
    expect(converted.hasAttribute('height')).toBe(false);
    expect(converted.hasAttribute('data-ln-size')).toBe(false);
    expect(converted.hasAttribute('data-mce-selected')).toBe(false);
    expect(converted.style.float).toBe('');
    expect(conversion.block.querySelector('.ln-media-text__content p')).not.toBeNull();
    expect(original.textContent).toBe('之前之后');
    expect(original.contains(image)).toBe(true);
  });

  it('retains a linked image and an existing formatted caption', () => {
    const original = document.createElement('div');
    original.innerHTML =
      '<figure class="image"><a href="https://example.com/original" target="_blank"><img src="/a.png"></a><figcaption>已有<strong>图注</strong></figcaption></figure>';
    const conversion = createRichMediaTextFromImage(original.querySelector('img')!)!;
    expect(conversion.target).toBe(original.firstElementChild);
    expect(conversion.block.querySelector('.ln-media-text__media a')?.getAttribute('href')).toBe(
      'https://example.com/original',
    );
    expect(conversion.block.querySelector('.ln-media-text__content')?.innerHTML).toBe('已有<strong>图注</strong>');
    expect(conversion.block.querySelectorAll('img')).toHaveLength(1);
  });

  it('replaces an image-only link as a whole and rejects unsupported image targets', () => {
    const original = document.createElement('div');
    original.innerHTML = '<p><a href="/original"><img src="/a.png"></a></p>';
    expect(createRichMediaTextFromImage(original.querySelector('img')!)?.target).toBe(original.querySelector('a'));
    original.innerHTML = '<p><a href="/original">链接前<img src="/a.png">链接后</a></p>';
    const conversion = createRichMediaTextFromImage(original.querySelector('img')!)!;
    expect(conversion.target).toBe(original.querySelector('img'));
    expect(conversion.block.querySelector('.ln-media-text__media a')?.getAttribute('href')).toBe('/original');
    expect(original.textContent).toBe('链接前链接后');
    original.innerHTML =
      '<section class="ln-media-text"><img src="/a.png"></section><figure class="mermaid-figure--companion"><img src="/chart.png"></figure><img>';
    for (const image of original.querySelectorAll('img')) expect(createRichMediaTextFromImage(image)).toBeNull();
  });
});
