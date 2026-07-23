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

  it('语义规划模式要求 Intent Envelope，并明确查询与修改边界', () => {
    const semanticCatalog = [
      {
        id: 'read.query_notes',
        effect: 'read',
        status: 'enabled',
        toolNames: ['query_notes'],
        description: '查询笔记',
      },
      {
        id: 'note.delete',
        effect: 'write',
        status: 'planned',
        toolNames: [],
        description: '删除笔记',
      },
    ];
    const prompt = buildPlannerPrompt(tools, 'user', {
      semanticCatalog,
      semanticCatalogText: '- read.query_notes｜read｜enabled｜查询笔记；工具=query_notes',
    });

    expect(prompt).toContain('结构化语义计划（强制）');
    expect(prompt).toContain('submit_agent_plan');
    expect(prompt).toContain('不能只看到');
    expect(prompt).toContain('询问已有状态、历史记录、统计、回顾');
    expect(prompt).toContain('planned、forbidden、unavailable 或 unknown');
    expect(prompt).toContain('dependsOn 只能引用');
    expect(prompt).toContain('“第一条”在用户未指定排序时使用 sort=smart、limit=1');
    expect(prompt).toContain('“最后一条”等无法由当前排序与分页可靠确定的说法必须先澄清');
    expect(prompt).not.toContain('不需要工具时只输出 DIRECT_REPLY');
  });
});
