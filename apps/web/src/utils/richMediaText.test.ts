import { describe, expect, it } from 'vitest';
import {
  createMarkdownRichMediaTextBlockHtml,
  createRichMediaTextBlockHtml,
  createRichMediaTextItemHtml,
  createRichMediaTextFromImage,
  liftRichMediaTextOutOfLists,
  normalizeRichMediaTextHtml,
  getRichMediaTextClipboardImage,
} from './richMediaText';

describe('richMediaText', () => {
  it('reads a copied HTML image without accepting its HTML attributes or surrounding text', () => {
    expect(
      getRichMediaTextClipboardImage(
        '<p>剪贴板说明</p><a href="/link"><img src=" /image.png " alt="原图" onerror="alert(1)"></a>',
        'https://example.com/note',
      ),
    ).toEqual({ url: '/image.png', alt: '原图' });
  });

  it('accepts data images copied from an editor', () => {
    expect(getRichMediaTextClipboardImage('<img src="data:image/png;base64,AAAA">', 'https://example.com')).toEqual({
      url: 'data:image/png;base64,AAAA',
      alt: '',
    });
  });

  it('ignores non-images, ambiguous images and unsupported clipboard URLs', () => {
    for (const html of [
      '',
      '<p>普通文字</p>',
      '<img>',
      '<img src="/a"><img src="/b">',
      '<img src="javascript:alert(1)">',
      '<img src="data:text/html,hello">',
      '<img src="file:///local.png">',
      '<img src="blob:https://example.com/transient">',
    ])
      expect(getRichMediaTextClipboardImage(html, 'https://example.com')).toBeNull();
  });

  const mediaBlock =
    '<section class="ln-media-text"><figure class="ln-media-text__item"><div class="ln-media-text__media"><a href="/original"><img src="/a.png" alt="原图"></a></div><figcaption class="ln-media-text__content"><p>说明<strong>加粗</strong></p><ul><li>图注列表</li></ul></figcaption></figure></section>';
  const parse = (html: string) => {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return holder;
  };

  it('lifts a legacy media block out of a list without losing surrounding text or caption lists', () => {
    const source = `<ul><li>前一项</li><li><div><p>图前<a href="/link">链接</a></p>${mediaBlock}<p>图后</p></div></li><li>后一项</li></ul>`;
    const normalized = normalizeRichMediaTextHtml(source);
    const holder = parse(normalized);
    expect(Array.from(holder.children).map((node) => node.tagName)).toEqual(['UL', 'SECTION', 'UL']);
    expect(holder.textContent).toBe(parse(source).textContent);
    expect(holder.querySelectorAll('img')).toHaveLength(1);
    expect(holder.querySelector('section')?.closest('li')).toBeNull();
    expect(holder.querySelector('figcaption ul li')?.textContent).toBe('图注列表');
    expect(holder.querySelector('a[href="/link"]')?.textContent).toBe('链接');
    expect(holder.querySelector('section a')?.getAttribute('href')).toBe('/original');
    expect(normalizeRichMediaTextHtml(normalized)).toBe(normalized);
  });

  it.each([
    { attributes: 'start="5"', item: '', expectedBefore: '5', expectedAfter: '7' },
    { attributes: 'start="5"', item: 'value="12"', expectedBefore: '5', expectedAfter: '13' },
    { attributes: 'reversed', item: '', expectedBefore: '3', expectedAfter: '1' },
    { attributes: 'reversed start="9"', item: '', expectedBefore: '9', expectedAfter: '7' },
  ])('preserves ordered-list numbering when extracting an image-only item: $attributes / $item', (item) => {
    const holder = parse(
      normalizeRichMediaTextHtml(
        `<ol ${item.attributes}><li>之前</li><li ${item.item}>${mediaBlock}</li><li>之后</li></ol>`,
      ),
    );
    const lists = Array.from(holder.children).filter((node) => node.tagName === 'OL');
    expect(lists.map((list) => list.getAttribute('start'))).toEqual([item.expectedBefore, item.expectedAfter]);
    expect(holder.querySelectorAll('section')).toHaveLength(1);
    expect(holder.querySelectorAll(':scope > ol > li')).toHaveLength(2);
  });

  it.each([
    { list: 'ul', attrs: '', item: '', starts: [] },
    { list: 'ol', attrs: 'start="5"', item: 'value="12"', starts: ['5', '13'] },
    { list: 'ol', attrs: 'reversed', item: '', starts: ['3', '1'] },
  ])('repairs media blocks whose section became a list item: $list/$attrs', ({ list, attrs, item, starts }) => {
    const oldBlock = mediaBlock
      .replace(
        '<section class="ln-media-text">',
        `<li class="ln-media-text" id="media-id" ${item} data-ln-media-width="42" data-ln-media-position="right">`,
      )
      .replace('</section>', '</li>');
    const source = `<${list} ${attrs}><li>前项</li>${oldBlock}<li>后项</li></${list}>`;
    const normalized = normalizeRichMediaTextHtml(source);
    const holder = parse(normalized);
    expect(holder.textContent).toBe(parse(source).textContent);
    expect(Array.from(holder.children).map((node) => node.tagName)).toEqual([
      list.toUpperCase(),
      'SECTION',
      list.toUpperCase(),
    ]);
    expect(holder.querySelectorAll('img')).toHaveLength(1);
    expect(holder.querySelector('section a')?.getAttribute('href')).toBe('/original');
    expect(holder.querySelector('section')?.getAttribute('data-ln-media-width')).toBe('42');
    expect(holder.querySelector('section')?.getAttribute('data-ln-media-position')).toBe('right');
    expect(holder.querySelector('figcaption li')?.textContent).toBe('图注列表');
    expect(holder.querySelectorAll('#media-id')).toHaveLength(1);
    expect(holder.querySelector('.ln-media-text')?.tagName).toBe('SECTION');
    expect(Array.from(holder.querySelectorAll(':scope > ol')).map((node) => node.getAttribute('start'))).toEqual(
      starts,
    );
    expect(normalizeRichMediaTextHtml(normalized)).toBe(normalized);
  });

  it('repairs a changed block tag without touching unrelated elements or losing sibling text', () => {
    const source = `<p>前文</p>${mediaBlock.replace('<section', '<div').replace('</section>', '</div>')}<div class="ln-media-text">普通文字</div><p>后文</p>`;
    const holder = parse(normalizeRichMediaTextHtml(source));
    expect(holder.textContent).toBe(parse(source).textContent);
    expect(holder.querySelectorAll('section')).toHaveLength(1);
    expect(holder.querySelector('div.ln-media-text')?.textContent).toBe('普通文字');
  });

  it('retains the original item number on text split across a media block', () => {
    const holder = parse(
      normalizeRichMediaTextHtml(`<ol start="5"><li>前一项</li><li>前半${mediaBlock}后半</li><li>后一项</li></ol>`),
    );
    const lists = holder.querySelectorAll(':scope > ol');
    expect(lists[0].getAttribute('start')).toBe('5');
    expect(lists[1].getAttribute('start')).toBe('6');
    expect(lists[1].firstElementChild?.getAttribute('value')).toBe('6');
    expect(lists[1].textContent).toBe('后半后一项');
  });

  it('lifts through nested lists while preserving media nodes, task items, empty siblings and container boundaries', () => {
    const holder = parse(
      `<blockquote><ol id="original" start="3"><li>父项<ul><li><input type="checkbox" checked>任务</li><li>${mediaBlock}</li><li></li></ul>父项后文</li><li>下项</li></ol></blockquote>`,
    );
    const block = holder.querySelector<HTMLElement>('section')!;
    const image = block.querySelector('img');
    const text = holder.textContent;
    expect(liftRichMediaTextOutOfLists(block)).toBe(true);
    expect(block.parentElement?.tagName).toBe('BLOCKQUOTE');
    expect(block.querySelector('img')).toBe(image);
    expect(holder.textContent).toBe(text);
    expect(holder.querySelectorAll('#original')).toHaveLength(1);
    expect(holder.querySelector('input')?.checked).toBe(true);
    expect(holder.querySelector('ul > li:empty')).not.toBeNull();
    expect(liftRichMediaTextOutOfLists(block)).toBe(false);
  });

  it('preserves multiple blocks in one list item and drops only the emptied wrappers', () => {
    const source = `<ul><li><p><br></p>${mediaBlock}${mediaBlock}<p>&nbsp;</p></li></ul>`;
    const holder = parse(normalizeRichMediaTextHtml(source));
    expect(Array.from(holder.children).map((node) => node.tagName)).toEqual(['SECTION', 'SECTION']);
    expect(holder.querySelectorAll('img')).toHaveLength(2);
    expect(holder.querySelectorAll('figcaption ul')).toHaveLength(2);
  });

  it('keeps editor content inside its boundary when the host UI also uses a list', () => {
    const holder = parse(
      `<ul><li>外层界面<div class="editor-body"><ol start="3"><li>${mediaBlock}</li><li>正文后项</li></ol></div>界面后文</li></ul>`,
    );
    const body = holder.querySelector<HTMLElement>('.editor-body')!;
    const host = body.parentElement;
    const block = body.querySelector<HTMLElement>('section')!;
    expect(liftRichMediaTextOutOfLists(block, body)).toBe(true);
    expect(block.parentElement).toBe(body);
    expect(body.parentElement).toBe(host);
    expect(holder.querySelector(':scope > ul > li')).toBe(host);
    expect(holder.textContent).toBe('外层界面说明加粗图注列表正文后项界面后文');
  });

  it('keeps the table and its outer list intact while extracting lists inside a cell', () => {
    const source = `<ul><li>表格项<table><tbody><tr><td>单元格前<ul><li>图前${mediaBlock}图后</li><li>后项</li></ul></td><td>相邻内容<img src="/other.png"></td></tr></tbody></table>表格后</li></ul>`;
    const holder = parse(normalizeRichMediaTextHtml(source));
    expect(holder.textContent).toBe(parse(source).textContent);
    expect(holder.querySelectorAll('table')).toHaveLength(1);
    expect(holder.querySelectorAll('tr')).toHaveLength(1);
    expect(holder.querySelectorAll('td')).toHaveLength(2);
    expect(holder.querySelector('section')?.parentElement?.tagName).toBe('TD');
    expect(holder.querySelector('td:last-child')?.innerHTML).toBe('相邻内容<img src="/other.png">');
    expect(holder.querySelectorAll('img')).toHaveLength(2);
  });

  it('removes the temporary block-after caret from serialized content', () => {
    const holder = parse(
      normalizeRichMediaTextHtml(
        mediaBlock.replace('class="ln-media-text"', 'class="ln-media-text" data-ln-media-after-caret="true"'),
      ),
    );
    expect(holder.querySelector('[data-ln-media-after-caret]')).toBeNull();
  });

  it('restores an absent image container without changing caption formatting or lists', () => {
    const source =
      '<section class="ln-media-text"><figure class="ln-media-text__item"><figcaption class="ln-media-text__content"><p>原文<strong>加粗</strong><a href="/link">链接</a></p><ul><li>列表</li></ul></figcaption></figure></section>';
    const normalized = normalizeRichMediaTextHtml(source);
    const holder = parse(normalized);
    expect(holder.querySelector('.ln-media-text__media')?.innerHTML).toBe('');
    expect(holder.querySelector('figcaption')?.innerHTML).toBe(parse(source).querySelector('figcaption')?.innerHTML);
    expect(normalizeRichMediaTextHtml(normalized)).toBe(normalized);
  });

  it('never serializes the temporary empty-image button or upload progress into content', () => {
    const source = mediaBlock.replace(
      '<a href="/original"><img src="/a.png" alt="原图"></a>',
      '<div data-ln-media-image-placeholder="true" data-mce-bogus="all" contenteditable="false"><button>点击添加图片</button><div role="progressbar">50%</div></div>',
    );
    const normalized = normalizeRichMediaTextHtml(source);
    expect(normalized).not.toContain('点击添加图片');
    expect(normalized).not.toContain('progressbar');
    expect(normalized).not.toContain('data-ln-media-image-placeholder');
    expect(parse(normalized).querySelector('figcaption')?.innerHTML).toBe(
      parse(mediaBlock).querySelector('figcaption')?.innerHTML,
    );
    expect(parse(normalized).querySelector('.ln-media-text__media')?.innerHTML).toBe('');
  });

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
