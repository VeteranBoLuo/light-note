import { describe, expect, it } from 'vitest';
import { contentLikelyHasHeadings, extractMdSourceHeadings } from './note';

describe('contentLikelyHasHeadings', () => {
  // 这个粗判只决定首屏「要不要给目录留位置」，判错的代价是解析完成后平滑纠正一次
  it('富文本按标题标签判定，属性和大小写都要认', () => {
    expect(contentLikelyHasHeadings('<h2 id="a">标题</h2><p>正文</p>')).toBe(true);
    expect(contentLikelyHasHeadings('<H1>标题</H1>')).toBe(true);
    expect(contentLikelyHasHeadings('<p>只有正文</p>')).toBe(false);
  });

  it('富文本里被转义的标签不算标题（代码块里写 <h1> 的情况）', () => {
    expect(contentLikelyHasHeadings('<pre>&lt;h1&gt;示例&lt;/h1&gt;</pre>')).toBe(false);
  });

  it('不把 <header>/<hr> 这类同前缀标签误判成标题', () => {
    expect(contentLikelyHasHeadings('<header>页眉</header><hr />')).toBe(false);
  });

  it('markdown 走源码解析，跳过 fenced code 里看着像标题的行', () => {
    expect(contentLikelyHasHeadings('# 标题\n正文', 'markdown')).toBe(true);
    expect(contentLikelyHasHeadings('```\n# 这是代码\n```', 'markdown')).toBe(false);
    expect(contentLikelyHasHeadings('只有正文', 'markdown')).toBe(false);
  });

  it('空内容不留位置', () => {
    expect(contentLikelyHasHeadings('')).toBe(false);
    expect(contentLikelyHasHeadings(undefined, 'markdown')).toBe(false);
  });
});

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
