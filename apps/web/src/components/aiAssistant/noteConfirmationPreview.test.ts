import { describe, expect, it } from 'vitest';
import { buildNoteConfirmationContentPreview, MAX_RENDERED_NOTE_CONFIRMATION_LENGTH } from './noteConfirmationPreview';

function confirmation(toolName: string, args: Record<string, unknown>) {
  return {
    token: 'token',
    id: 'confirmation-1',
    sessionId: 'session-1',
    toolName,
    expiresIn: 300,
    args,
  };
}

describe('buildNoteConfirmationContentPreview', () => {
  it('只为创建笔记提供权威 Markdown 正文预览', () => {
    expect(
      buildNoteConfirmationContentPreview(
        confirmation('create_note', { title: '周报', content: '# 周报\n\n- 完成 A' }),
      ),
    ).toEqual({
      source: '# 周报\n\n- 完成 A',
      renderedSource: '# 周报\n\n- 完成 A',
      truncated: false,
    });
    expect(
      buildNoteConfirmationContentPreview(confirmation('create_bookmark', { content: '# 不应渲染' })),
    ).toBeUndefined();
  });

  it('兼容服务端支持的正文参数别名且不破坏前导缩进', () => {
    expect(
      buildNoteConfirmationContentPreview(confirmation('create_note', { markdown: '    const value = 1;' }))?.source,
    ).toBe('    const value = 1;');
  });

  it('渲染内容过长时只截断渲染副本，完整 Markdown 原文仍可核对', () => {
    const source = 'a'.repeat(MAX_RENDERED_NOTE_CONFIRMATION_LENGTH + 25);
    const preview = buildNoteConfirmationContentPreview(confirmation('create_note', { content: source }));
    expect(preview?.renderedSource).toHaveLength(MAX_RENDERED_NOTE_CONFIRMATION_LENGTH);
    expect(preview?.source).toBe(source);
    expect(preview?.truncated).toBe(true);
  });

  it('空白笔记不生成正文预览', () => {
    expect(buildNoteConfirmationContentPreview(confirmation('create_note', { content: '   ' }))).toBeUndefined();
  });
});
