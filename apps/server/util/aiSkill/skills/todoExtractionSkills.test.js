import { describe, expect, it, vi } from 'vitest';
import { todoExtractionSkills, todoExtractionSkillInternals } from './todoExtractionSkills.js';

describe('todo extraction skills', () => {
  it('只从显式材料提取带有效引用的预览，不直接创建待办', async () => {
    const skill = todoExtractionSkills.find((item) => item.id === 'note.extract_todos');
    const loadEvidence = vi.fn().mockResolvedValue({
      evidence: '[1] 笔记\n明天下午提交周报。',
      sources: [{ key: 1, type: 'note', id: 'n-1', title: '工作' }],
      coverage: { complete: true, warnings: [] },
    });
    const prepared = await skill.prepare({
      input: skill.validateInput({ instruction: '提取待办' }),
      context: { identity: { subjectUserId: 'u-1' }, resourceRefs: [{ type: 'note', id: 'n-1' }] },
      dependencies: { loadExplicitResourceEvidence: loadEvidence, now: new Date('2026-08-23T00:00:00Z') },
    });
    const result = prepared.validateArguments({
      candidates: [{ title: '提交周报', description: '', priority: 1, dueAt: '', sourceCitation: 1 }],
    });
    expect(loadEvidence).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: 'structured_draft', writeCommitted: false });
    expect(prepared.availableActions).toEqual([]);
  });

  it('拒绝引用不存在材料的候选', () => {
    expect(() =>
      todoExtractionSkillInternals.validateCandidates(
        { candidates: [{ title: '任务', description: '', priority: 0, dueAt: '', sourceCitation: 2 }] },
        [{ key: 1 }],
        new Date('2026-08-23T00:00:00Z'),
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' }));
  });
});
