import { describe, expect, it } from 'vitest';
import {
  DEPENDENCY_ROUND_INSTRUCTION,
  FOLLOW_UP_ROUND_INSTRUCTION,
  isInternalPlanningInstruction,
  PLAN_COMPLETION_ROUND_INSTRUCTION,
  SEMANTIC_REPAIR_ROUND_INSTRUCTION,
  shouldContinueToolPlanning,
  shouldRunSecondPlanner,
} from './secondRound.js';

describe('Agent 第二轮受限纠错', () => {
  it('仅在失败、空结果或信息不足且没有待确认写操作时触发', () => {
    expect(shouldRunSecondPlanner([{ result: { status: 'error', summary: '查询失败' } }])).toBe(true);
    expect(shouldRunSecondPlanner([{ result: { status: 'success', summary: '暂无匹配结果' } }])).toBe(true);
    expect(shouldRunSecondPlanner([{ result: { status: 'success', summary: '找到 2 条笔记' } }])).toBe(false);
    expect(shouldRunSecondPlanner([{ result: { status: 'error', summary: '失败' } }], [{ id: 'confirm' }])).toBe(false);
  });

  it('成功工具声明后续能力时继续规划，否则直接进入最终回答', () => {
    expect(
      shouldContinueToolPlanning([
        {
          result: {
            status: 'success',
            summary: '笔记正文已读取',
            nextActions: [{ tool: 'analyze_resource_images', resourceId: 'note-1' }],
          },
        },
      ]),
    ).toBe(true);
    expect(
      shouldContinueToolPlanning([{ result: { status: 'success', summary: '图片已识别', nextActions: [] } }]),
    ).toBe(false);
  });

  it('依赖轮与只读恢复轮使用不同的内部提示且都能被最终回答过滤', () => {
    expect(DEPENDENCY_ROUND_INSTRUCTION).toContain('只从紧邻的真实工具结果提取目标');
    expect(DEPENDENCY_ROUND_INSTRUCTION).toContain('待确认卡');
    expect(FOLLOW_UP_ROUND_INSTRUCTION).toContain('只读工具');
    expect(PLAN_COMPLETION_ROUND_INSTRUCTION).toContain('缺失读取能力');
    expect(SEMANTIC_REPAIR_ROUND_INSTRUCTION).toContain('重新提交一份完整且自洽');
    expect(isInternalPlanningInstruction(DEPENDENCY_ROUND_INSTRUCTION)).toBe(true);
    expect(isInternalPlanningInstruction(FOLLOW_UP_ROUND_INSTRUCTION)).toBe(true);
    expect(isInternalPlanningInstruction(PLAN_COMPLETION_ROUND_INSTRUCTION)).toBe(true);
    expect(isInternalPlanningInstruction(SEMANTIC_REPAIR_ROUND_INSTRUCTION)).toBe(true);
    expect(isInternalPlanningInstruction('用户普通消息')).toBe(false);
  });
});
