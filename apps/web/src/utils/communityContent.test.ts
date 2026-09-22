import { describe, expect, it } from 'vitest';
import { communityHtmlToMarkdown, sanitizeCommunityHtml } from './communityContent';
import { renderCommunityMarkdown } from './communityMarkdown';

function roundTrip(html: string) {
  const container = document.createElement('div');
  container.innerHTML = renderCommunityMarkdown(communityHtmlToMarkdown(html));
  return container;
}

describe('community document round trips', () => {
  it('keeps the heading levels, inline formatting, links, quotes and separators', () => {
    const html =
      Array.from({ length: 6 }, (_, n) => `<h${n + 1}>标题 ${n + 1}</h${n + 1}>`).join('') +
      '<p><strong>粗体</strong> <em>斜体</em> <s>删除</s> <u>下划线</u> <code>inline()</code> <a href="https://example.com" title="说明">链接</a></p>' +
      '<blockquote><p>引用<br>换行</p></blockquote><hr>';
    const result = roundTrip(html);
    for (let n = 1; n <= 6; n++) expect(result.querySelector(`h${n}`)?.textContent).toBe(`标题 ${n}`);
    for (const tag of ['strong', 'em', 'del', 'u', 'code', 'a', 'blockquote', 'br', 'hr'])
      expect(result.querySelector(tag)).not.toBeNull();
    expect(result.querySelector('a')?.getAttribute('title')).toBe('说明');
  });

  it('keeps ordered list starting numbers, nested lists and read-only task states', () => {
    const result = roundTrip(renderCommunityMarkdown('3. 第三项\n4. 第四项\n   - 子项\n\n- [ ] 未完成\n- [x] 已完成'));
    expect(result.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(result.querySelector('ol li ul li')?.textContent).toBe('子项');
    const tasks = Array.from(result.querySelectorAll<HTMLInputElement>('input'));
    expect(tasks.map((input) => input.checked)).toEqual([false, true]);
    expect(tasks.every((input) => input.disabled && input.tabIndex === -1)).toBe(true);
  });

  it('keeps bare TinyMCE code blocks and whitespace instead of turning them into paragraphs', () => {
    const result = roundTrip('<pre>const value = 1;\n  next();\n\n&lt;tag&gt;</pre>');
    expect(result.querySelector('pre code')?.textContent).toBe('const value = 1;\n  next();\n\n<tag>\n');
  });

  it('keeps table alignment, headerless tables and merged cells', () => {
    expect(communityHtmlToMarkdown('<table><tr><th>名称</th></tr><tr><td>轻笺</td></tr></table>')).toContain(
      '| 名称 |',
    );
    const result = roundTrip(renderCommunityMarkdown('| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| A | B | C |'));
    expect(Array.from(result.querySelectorAll('th')).map((cell) => cell.getAttribute('align'))).toEqual([
      'left',
      'center',
      'right',
    ]);
    const complex = roundTrip(
      '<table><tr><td colspan="2" align="right">合并</td></tr><tr><td>A</td><td>B</td></tr></table>',
    );
    expect(complex.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(complex.querySelectorAll('tr')).toHaveLength(2);
  });

  it('keeps deliberate blank paragraphs between text blocks', () => {
    const result = roundTrip('<p>前</p><p><br></p><p>后</p>');
    expect(result.querySelectorAll('p')).toHaveLength(3);
    expect(result.querySelectorAll('p')[1].querySelector('br')).not.toBeNull();
  });

  it('does not allow media, scripts, arbitrary styles, handlers or interactive forms', () => {
    const html = sanitizeCommunityHtml(
      '<p style="color:red" onclick="alert(1)">正文</p><script>alert(1)</script><iframe src="https://example.com"></iframe><img src="https://example.com/x"><a href="javascript:alert(1)">bad</a><input type="text"><ul><li><input type="checkbox" onchange="alert(1)"></li></ul>',
    );
    expect(html).not.toMatch(/<script|<iframe|<img|style=|onclick|onchange|javascript:|type="text"/);
    expect(html).toContain('disabled=""');
    expect(html).toContain('tabindex="-1"');
    expect(sanitizeCommunityHtml('<p start="5" href="https://example.com">text</p>')).toBe('<p>text</p>');
  });
});
