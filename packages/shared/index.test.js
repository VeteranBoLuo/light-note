import { describe, expect, it } from 'vitest';
import { normalizeMarkdownBlockquoteEntities } from './index.js';

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
