// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { noteContentToHtml } from './common';

describe('noteContentToHtml', () => {
  it.each([
    ['html', '<p><input type="checkbox" class="note-todo-checkbox"> 未完成</p>'],
    ['markdown', '- [x] 已完成'],
  ])('%s 阅读态中的待办只表达已保存状态', async (type, content) => {
    const html = await noteContentToHtml(content, type);
    const root = document.createElement('div');
    root.innerHTML = html;
    const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(checkbox).not.toBeNull();
    expect(checkbox?.disabled).toBe(true);
    expect(checkbox?.getAttribute('aria-disabled')).toBe('true');
    expect(checkbox?.tabIndex).toBe(-1);
    expect(checkbox?.checked).toBe(type === 'markdown');
  });

  it('Markdown 阅读预览保留下划线并继续消毒主动脚本', async () => {
    const html = await noteContentToHtml('普通 <u>重点</u><script>alert(1)</script>', 'markdown');

    expect(html).toContain('<u>重点</u>');
    expect(html).not.toContain('<script');
  });
});
