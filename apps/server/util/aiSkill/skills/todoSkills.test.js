import { describe, expect, it } from 'vitest';
import { todoSkills, todoSkillInternals } from './todoSkills.js';

describe('todo skills', () => {
  it('待办解析只生成结构化预览，不直接写入', async () => {
    const skill = todoSkills.find((item) => item.id === 'todo.parse_draft');
    const prepared = await skill.prepare({
      input: skill.validateInput({ instruction: '明天 16 点交材料' }),
      context: { resourceRefs: [] },
      request: { client: { timezone: 'Asia/Shanghai' } },
      dependencies: { now: new Date('2026-08-23T04:00:00.000Z') },
    });
    expect(prepared.messages[1].content).toContain('2026-08-23 12:00:00');
    expect(prepared.availableActions[0]).toMatchObject({ requiresConfirmation: true });
    expect(
      prepared.validateArguments({
        title: '交材料',
        description: '',
        priority: 1,
        temporal: { dateExpression: '明天', timeExpression: '16 点' },
        checklist: [],
      }),
    ).toMatchObject({ kind: 'structured_draft', dueAt: '2026-08-24 16:00:00', writeCommitted: false });
  });

  it('模型只摘录时间表达式，不能自行填写绝对截止时间', async () => {
    const skill = todoSkills.find((item) => item.id === 'todo.parse_draft');
    const prepared = await skill.prepare({
      input: skill.validateInput({ instruction: '三天后下午 4 点交材料' }),
      context: { resourceRefs: [] },
      request: { client: { timezone: 'Asia/Shanghai' } },
      dependencies: { now: new Date('2026-08-23T04:00:00.000Z') },
    });
    expect(prepared.structuredTool.parameters.properties).not.toHaveProperty('dueAt');
    expect(prepared.messages[0].content).toContain('不得改写、归一化或计算绝对时间');
    expect(
      prepared.validateArguments({
        title: '交材料',
        description: '',
        priority: 1,
        temporal: { dateExpression: '三天后', timeExpression: '下午 4 点' },
        checklist: [],
      }),
    ).toMatchObject({ dueAt: '2026-08-26 16:00:00', overdue: false });
  });

  it('待办拆解按预设粒度限制步骤数量', () => {
    expect(() => todoSkillInternals.validateBreakdownArguments({ title: '任务', checklist: ['一步'] })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_TODO_CHECKLIST_INVALID' }),
    );
    expect(
      todoSkillInternals.validateBreakdownArguments(
        { title: '任务', checklist: ['一', '二', '三', '四', '五', '六'] },
        { detailLevel: 'detailed' },
      ),
    ).toBeTruthy();
  });

  it('详细拆解会同时读取当前说明并要求 6～10 步', async () => {
    const skill = todoSkills.find((item) => item.id === 'todo.breakdown');
    const input = skill.validateInput({ instruction: '当前说明：在 CSDN 和掘金写推广文章', detailLevel: 'detailed' });
    const prepared = await skill.prepare({
      input,
      context: { resourceRefs: [] },
      request: { client: { timezone: 'Asia/Shanghai' } },
      dependencies: {},
    });
    expect(prepared.messages[0].content).toContain('完整阅读标题、说明与现有清单');
    expect(prepared.messages[0].content).toContain('6～10 步');
    expect(() =>
      prepared.validateArguments({ title: '推广轻笺', checklist: ['一', '二', '三', '四', '五'] }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_TODO_CHECKLIST_INVALID' }));
  });
});
