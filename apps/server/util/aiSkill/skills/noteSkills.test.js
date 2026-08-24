import { describe, expect, it } from 'vitest';
import { noteSkills } from './noteSkills.js';

const createNoteSkill = noteSkills.find((skill) => skill.id === 'note.create_from_sources');

function context() {
  return {
    identity: { subjectUserId: 'u1' },
    resourceRefs: [{ type: 'note', id: 'n1', version: 'v1' }],
  };
}

describe('note.create_from_sources', () => {
  it('有可读笔记时只返回未写入预览，并显式提供二次确认动作', async () => {
    const prepared = await createNoteSkill.prepare({
      input: createNoteSkill.validateInput({ title: '今日总结' }),
      context: context(),
      request: { requestId: 'request-1' },
      dependencies: {
        loadExplicitResourceEvidence: async () => ({
          evidence: '[1] 笔记正文',
          sources: [{ id: 'note:n1', title: '来源笔记' }],
          coverage: { complete: true, warnings: [] },
        }),
      },
    });

    expect(prepared.availableActions).toEqual([
      { id: 'create_note_from_preview', label: '确认生成笔记', requiresConfirmation: true },
    ]);
    expect(prepared.mapResult({ content: '# 今日总结\n正文 [1]' })).toMatchObject({
      kind: 'artifact_preview',
      artifactType: 'note',
      title: '今日总结',
      contentType: 'markdown',
      writeCommitted: false,
    });
  });

  it('没有可读正文时不调用模型，也不展示无效的确认创建动作', async () => {
    const prepared = await createNoteSkill.prepare({
      input: createNoteSkill.validateInput({}),
      context: context(),
      request: { requestId: 'request-2' },
      dependencies: {
        loadExplicitResourceEvidence: async () => ({
          evidence: '',
          sources: [],
          coverage: { complete: false, warnings: ['note_empty'], resources: [{ status: 'empty' }] },
        }),
      },
    });

    expect(prepared.modelCalled).toBe(false);
    expect(prepared.availableActions).toEqual([]);
    expect(prepared.result.content).toContain('没有可供处理的可读正文');
  });
});
