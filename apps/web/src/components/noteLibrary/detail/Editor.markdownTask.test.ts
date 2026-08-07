import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/Editor.vue'), 'utf8');

describe('Markdown 待办预览契约', () => {
  it('统一使用空待办 token 修复器', () => {
    expect(source).toContain('walkTokens: promoteEmptyMarkdownTaskToken');
  });

  it('任务项显式清除列表 marker，避免复选框前出现圆点', () => {
    expect(source).toContain('.note-task-list-item::marker');
    expect(source).not.toContain(':deep(.note-task-list-item');
    expect(source).toContain("content: '';");
  });
});
