import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { configureMarkdownRenderer } from './markdownRenderer';

function render(markdown: string) {
  const parser = configureMarkdownRenderer(new Marked({ gfm: true }));
  return String(parser.parse(markdown));
}

describe('configureMarkdownRenderer', () => {
  it.each(['：', '-', '—', '。'])('标点“%s”位于闭合标记前且后接中文时仍渲染为加粗', (punctuation) => {
    const html = render(`**事情${punctuation}**学习正文`);
    expect(html).toContain(`<strong>事情${punctuation}</strong>学习正文`);
    expect(html).not.toContain('**');
  });

  it('列表项内的中文标点和连字符不会破坏加粗范围', () => {
    const html = render('- **事：—-**学习的目的本身就是解决问题');
    expect(html).toContain('<li><strong>事：—-</strong>学习的目的本身就是解决问题</li>');
    expect(html).not.toContain('**');
  });

  it('尊重用户明确放进标记内的首尾空格', () => {
    expect(render('** 事情： **学习正文')).toContain('<strong> 事情： </strong>学习正文');
  });

  it('不解析代码块、行内代码和转义后的星号', () => {
    expect(render('`**事情：**学习`')).toContain('<code>**事情：**学习</code>');
    expect(render('```md\n**事情：**学习\n```')).toContain('**事情：**学习');
    expect(render('\\**事情：\\**学习')).not.toContain('<strong>');
  });

  it('保留三星粗斜体等 marked 原生语义', () => {
    expect(render('***重点***')).toContain('<em><strong>重点</strong></em>');
  });

  it('重复配置同一 marked 实例不会重复注册扩展', () => {
    const parser = new Marked({ gfm: true });
    expect(configureMarkdownRenderer(configureMarkdownRenderer(parser))).toBe(parser);
    expect(String(parser.parse('**事情：**学习正文'))).toContain('<strong>事情：</strong>学习正文');
  });
});
