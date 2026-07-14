import { describe, expect, it } from 'vitest';
import {
  constrainSecondRoundToolCalls,
  selectSecondRoundTools,
  shouldRunSecondPlanner,
} from './secondRound.js';

describe('Agent 第二轮受限纠错', () => {
  it('仅在失败、空结果或信息不足且没有待确认写操作时触发', () => {
    expect(shouldRunSecondPlanner([{ result: { status: 'error', summary: '查询失败' } }])).toBe(true);
    expect(shouldRunSecondPlanner([{ result: { status: 'success', summary: '暂无匹配结果' } }])).toBe(true);
    expect(shouldRunSecondPlanner([{ result: { status: 'success', summary: '找到 2 条笔记' } }])).toBe(false);
    expect(shouldRunSecondPlanner([{ result: { status: 'error', summary: '失败' } }], [{ id: 'confirm' }])).toBe(false);
  });

  it('第二轮工具定义和调用都剔除写工具与越权工具', () => {
    const tools = [
      { name: 'query_notes', isWrite: false },
      { name: 'create_note', isWrite: true },
      { name: 'search_content', isWrite: false },
    ];
    const readonly = selectSecondRoundTools(tools);
    expect(readonly.map((tool) => tool.name)).toEqual(['query_notes', 'search_content']);
    const calls = constrainSecondRoundToolCalls([
      { id: '1', function: { name: 'create_note' } },
      { id: '2', function: { name: 'query_notes' } },
      { id: '3', function: { name: 'unknown_tool' } },
    ], readonly);
    expect(calls.map((call) => call.function.name)).toEqual(['query_notes']);
  });
});
