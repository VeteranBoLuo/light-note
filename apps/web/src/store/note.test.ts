import { describe, expect, it } from 'vitest';
import { extractMdSourceHeadings } from './note';

describe('extractMdSourceHeadings', () => {
  it('提取 ATX 和 Setext 标题并保留源码偏移', () => {
    const markdown = ['# 一级标题', '', '正文', '', '二级标题', '---', '', '### 三级标题 ###'].join('\n');
    const headings = extractMdSourceHeadings(markdown);

    expect(headings.map(({ text, level }) => ({ text, level }))).toEqual([
      { text: '一级标题', level: 1 },
      { text: '二级标题', level: 2 },
      { text: '三级标题', level: 3 },
    ]);
    expect(headings.map((heading) => markdown.slice(heading.sourceOffset).split('\n')[0])).toEqual([
      '# 一级标题',
      '二级标题',
      '### 三级标题 ###',
    ]);
  });

  it('忽略 fenced code 中看似标题的内容', () => {
    const markdown = ['# 可见标题', '```md', '## 代码里的标题', '```', '## 第二个可见标题'].join('\n');

    expect(extractMdSourceHeadings(markdown).map((heading) => heading.text)).toEqual([
      '可见标题',
      '第二个可见标题',
    ]);
  });

  it('按出现顺序保留重复标题', () => {
    const markdown = ['## 重复', '正文', '## 重复'].join('\n');
    const headings = extractMdSourceHeadings(markdown);

    expect(headings).toHaveLength(2);
    expect(headings[1].sourceOffset).toBeGreaterThan(headings[0].sourceOffset);
  });
});
