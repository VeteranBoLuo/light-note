import { describe, expect, it } from 'vitest';
import { createRichMediaTextBlockHtml, createRichMediaTextItemHtml, normalizeRichMediaTextHtml } from './richMediaText';

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
});
