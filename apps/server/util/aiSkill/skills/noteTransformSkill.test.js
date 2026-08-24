import { describe, expect, it } from 'vitest';
import noteTransformSkill from './noteTransformSkill.js';

describe('note.transform_text', () => {
  it('只处理本轮文字，零资源、零历史并返回应用预览', async () => {
    const input = noteTransformSkill.validateInput({
      text: '原始文字',
      operation: 'expand',
      instruction: '增加结构',
      targetLength: 500,
    });
    const prepared = await noteTransformSkill.prepare({ input });
    expect(noteTransformSkill.contextPolicy).toMatchObject({ maxResources: 0, allowConversation: false, historyTurns: 0 });
    expect(prepared.messages[1].content).toContain('原始文字');
    expect(prepared.outputPolicy.minimumChars).toBe(500);
    expect(prepared.availableActions[0]).toMatchObject({ requiresConfirmation: true });
  });

  it('翻译必须明确目标语言', () => {
    expect(() => noteTransformSkill.validateInput({ text: 'hello', operation: 'translate' })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_TARGET_LANGUAGE_REQUIRED' }),
    );
  });
});
