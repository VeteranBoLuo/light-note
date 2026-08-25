import { describe, expect, it } from 'vitest';
import { createGroundedResourceSkill, mapGroundedMarkdownToNotePreview } from './resourceSkillFactory.js';

const skill = createGroundedResourceSkill({
  id: 'note.test_summary',
  domain: 'note',
  resourceTypes: ['note'],
  minResources: 1,
  maxResources: 2,
  taskLabel: '测试总结',
  defaultInstruction: '总结',
  systemRole: '测试 Skill。',
});

describe('resource skill factory', () => {
  it('没有可读材料时确定性结束且不调用模型', async () => {
    const prepared = await skill.prepare({
      input: skill.validateInput({}),
      context: { identity: { subjectUserId: 'u1' }, resourceRefs: [{ type: 'note', id: 'n1', version: 'v1' }] },
      dependencies: {
        prepareExplicitResourceEvidence: async () => [],
        loadExplicitResourceEvidence: async () => ({
          evidence: '',
          sources: [],
          coverage: { complete: false, warnings: ['note_empty'], resources: [{ status: 'empty' }] },
        }),
      },
    });
    expect(prepared.modelCalled).toBe(false);
    expect(prepared.result.content).toContain('没有可供处理');
  });

  it('把资源类目标字数作为软偏好，不为凑字触发协议修复', async () => {
    const prepared = await skill.prepare({
      input: skill.validateInput({ targetLength: 2000, detailLevel: 'detailed' }),
      context: { identity: { subjectUserId: 'u1' }, resourceRefs: [{ type: 'note', id: 'n1', version: 'v1' }] },
      dependencies: {
        prepareExplicitResourceEvidence: async () => [],
        loadExplicitResourceEvidence: async () => ({
          evidence: '[1] 内容',
          sources: [{ id: 'note:n1' }],
          coverage: { complete: true, warnings: [] },
        }),
      },
    });
    expect(prepared.outputPolicy).toEqual({ targetChars: 2000 });
    expect(prepared.messages[1].content).toContain('约 2000');
  });

  it('新笔记始终返回未写入的 artifact preview', () => {
    expect(
      mapGroundedMarkdownToNotePreview({ result: { content: '# 草稿\n正文 [1]' }, input: { title: '标题' } }),
    ).toMatchObject({ kind: 'artifact_preview', artifactType: 'note', title: '标题', writeCommitted: false });
  });
});
