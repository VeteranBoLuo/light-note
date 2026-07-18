import { describe, expect, it } from 'vitest';
import { buildPlannerPrompt } from './prompt.js';

describe('buildPlannerPrompt', () => {
  const tools = [
    { name: 'query_notes', description: '查询笔记' },
    { name: 'query_users', description: '查询用户', requireRoot: true },
  ];

  it('规划阶段只要求选择工具或返回短标记', () => {
    const prompt = buildPlannerPrompt(tools, 'user');

    expect(prompt).toContain('当前阶段：内部规划');
    expect(prompt).toContain('只输出 DIRECT_REPLY');
    expect(prompt).toContain('query_notes');
    expect(prompt).not.toContain('query_users');
  });

  it('最终回答阶段不再暴露本轮工具清单', () => {
    const prompt = buildPlannerPrompt(tools, 'root', { phase: 'final' });

    expect(prompt).toContain('当前阶段：最终回答');
    expect(prompt).not.toContain('- **query_notes**');
    expect(prompt).not.toContain('- **query_users**');
  });
});
