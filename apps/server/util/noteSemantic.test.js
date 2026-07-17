import { describe, expect, it } from 'vitest';
import { noteQuestionNeedsImageOcr, parseNoteContent, renderNoteForAi } from './noteSemantic.js';

describe('笔记 AI 语义解析', () => {
  it('保留富文本复选框状态并给出权威统计', () => {
    const document = parseNoteContent({
      type: 'html',
      content: [
        '<h1>开发计划</h1>',
        '<p><input type="checkbox" class="note-todo-checkbox" checked="checked"> 已完成的修复</p>',
        '<p><input type="checkbox" class="note-todo-checkbox"> 尚未完成的修复</p>',
      ].join(''),
    });

    expect(document.checklist).toMatchObject({ total: 2, completed: 1, pending: 1 });
    expect(document.checklist.pendingItems).toEqual(['尚未完成的修复']);
    expect(renderNoteForAi(document, { question: '有哪些未完成的？', taskStatus: 'pending' })).toContain(
      '- [ ] 尚未完成的修复',
    );
    expect(renderNoteForAi(document, { question: '有哪些未完成的？', taskStatus: 'pending' })).not.toContain(
      '- [x] 已完成的修复',
    );
  });

  it('统一解析 Markdown 任务、嵌套列表、表格、引用和代码块', () => {
    const document = parseNoteContent({
      type: 'markdown',
      content: `# 周报

- [x] 已上线
- [ ] 待验证
  - 子任务

| 模块 | 状态 |
| --- | --- |
| 笔记 | 完成 |

> 风险提示

\`\`\`js
const ready = true;
\`\`\``,
    });
    const text = renderNoteForAi(document);

    expect(document.format).toBe('markdown');
    expect(document.checklist).toMatchObject({ total: 2, completed: 1, pending: 1 });
    expect(text).toContain('# 周报');
    expect(text).toContain('| 模块 | 状态 |');
    expect(text).toContain('> 风险提示');
    expect(text).toContain('```js\nconst ready = true;\n```');
  });

  it('兼容历史 type=md 但正文实际为 HTML 的笔记', () => {
    const document = parseNoteContent({
      type: 'md',
      content: '<h2>历史笔记</h2><p><strong>仍可读取</strong></p>',
    });

    expect(document.format).toBe('html');
    expect(renderNoteForAi(document)).toContain('## 历史笔记');
    expect(renderNoteForAi(document)).toContain('**仍可读取**');
  });

  it('保留链接、图片说明和图片顺序', () => {
    const document = parseNoteContent({
      type: 'html',
      content:
        '<p>查看 <a href="https://example.com/docs">文档</a></p>' +
        '<p><img src="https://boluo66.top/uploads/note-a.png" alt="接口报错截图"></p>',
    });
    const text = renderNoteForAi(document);

    expect(text).toContain('文档（https://example.com/docs）');
    expect(document.images).toEqual([
      expect.objectContaining({
        url: 'https://boluo66.top/uploads/note-a.png',
        alt: '接口报错截图',
        order: 1,
      }),
    ]);
    expect(noteQuestionNeedsImageOcr('截图里写了什么？', document)).toBe(true);
  });

  it('表格单元格中的复选框状态不会被抹掉', () => {
    const document = parseNoteContent({
      type: 'html',
      content:
        '<table><tr><th>事项</th><th>状态</th></tr>' +
        '<tr><td>发布</td><td><input type="checkbox" checked> 已完成</td></tr></table>',
    });

    expect(renderNoteForAi(document)).toContain('| 发布 | [x] 已完成 |');
    expect(document.checklist).toMatchObject({ total: 1, completed: 1, pending: 0 });
  });

  it('普通列表保留层级但绝不误判为未完成任务', () => {
    const document = parseNoteContent({
      type: 'html',
      content: '<ul><li>笔记优化</li><li>书签优化<ul><li>卡片布局</li></ul></li></ul>',
    });

    expect(document.checklist).toMatchObject({ total: 0, completed: 0, pending: 0 });
    expect(renderNoteForAi(document)).toContain('- 笔记优化');
    expect(renderNoteForAi(document)).toContain('  - 卡片布局');
  });

  it('按语义块截断，明确标记内容并保留任务统计', () => {
    const document = parseNoteContent({
      type: 'html',
      content: `<p><input type="checkbox" checked> 完成</p><p>${'很长的正文'.repeat(400)}</p>`,
    });
    const text = renderNoteForAi(document, { maxChars: 600 });

    expect(text).toContain('[任务统计] 共 1 项；已完成 1 项；未完成 0 项');
    expect(text.length).toBeLessThanOrEqual(600);
    expect(text).toContain('[内容已截断]');
  });
});
