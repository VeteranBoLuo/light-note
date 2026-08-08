import { describe, expect, it } from 'vitest';
import { normalizeMarkdownBlockquoteEntities, resolveBookmarkUrlInput } from './index.js';

describe('resolveBookmarkUrlInput', () => {
  it.each([
    ['http://xhslink.cn/o/7rNw5RKnE8e', 'https://xhslink.cn/o/7rNw5RKnE8e'],
    ['http://xhslink.com/o/7rNw5RKnE8e', 'https://xhslink.com/o/7rNw5RKnE8e'],
  ])('把支持 HTTPS 的小红书分享短链从 HTTP 安全升级: %s', (input, canonicalUrl) => {
    expect(resolveBookmarkUrlInput(input, { allowTextExtraction: false })).toMatchObject({
      state: 'normalized',
      canonicalUrl,
    });
  });

  it('不擅自升级未知站点的 HTTP 地址', () => {
    expect(resolveBookmarkUrlInput('http://example.com/path', { allowTextExtraction: false })).toMatchObject({
      state: 'valid',
      canonicalUrl: 'http://example.com/path',
    });
  });

  it('从小红书整段分享文案提取候选时直接给出可在 App 内打开的 HTTPS 地址', () => {
    const resolution = resolveBookmarkUrlInput(
      'GPT5.6 过度防御给气笑了😅显着他会SHA256 最近真的被... http://xhslink.cn/o/7rNw5RKnE8e 复制后打开【小红书】查看笔记！',
      { allowTextExtraction: true },
    );

    expect(resolution).toMatchObject({
      state: 'needs_confirmation',
      candidates: [{ url: 'https://xhslink.cn/o/7rNw5RKnE8e', source: 'explicit' }],
    });
  });
});

describe('normalizeMarkdownBlockquoteEntities', () => {
  it('恢复行首和列表后的被转义引用标记', () => {
    expect(normalizeMarkdownBlockquoteEntities('&gt; 2026-07-24 星期五')).toBe('> 2026-07-24 星期五');
    expect(normalizeMarkdownBlockquoteEntities('&GT; 大小写实体同样恢复')).toBe('> 大小写实体同样恢复');
    expect(normalizeMarkdownBlockquoteEntities('- &gt; 列表中的引用')).toBe('- > 列表中的引用');
    expect(normalizeMarkdownBlockquoteEntities('&gt; &gt; 嵌套引用')).toBe('> > 嵌套引用');
  });

  it('保留非引用语法、缩进代码和围栏代码中的实体', () => {
    const source = [
      '说明中保留 &gt; 符号。',
      '    &gt; four-space code',
      '```md',
      '&gt; fenced code',
      '```',
      '&gt; 实际引用',
    ].join('\n');
    expect(normalizeMarkdownBlockquoteEntities(source)).toBe(
      [
        '说明中保留 &gt; 符号。',
        '    &gt; four-space code',
        '```md',
        '&gt; fenced code',
        '```',
        '> 实际引用',
      ].join('\n'),
    );
  });

  it('保持换行格式和已正确的 Markdown 不变', () => {
    expect(normalizeMarkdownBlockquoteEntities('> already correct\r\n\r\n&gt; repair')).toBe(
      '> already correct\r\n\r\n> repair',
    );
  });
});
