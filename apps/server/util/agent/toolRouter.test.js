import { describe, expect, it } from 'vitest';
import { selectAgentTools } from './toolRouter.js';

const tools = [
  { name: 'search_content' },
  { name: 'search_knowledge_base' },
  { name: 'get_user_info' },
  { name: 'get_ai_quota' },
  { name: 'query_bookmarks' },
  { name: 'create_bookmark', isWrite: true },
  { name: 'query_link_health' },
  { name: 'query_notes' },
  { name: 'create_note', isWrite: true },
  { name: 'query_users', requireRoot: true },
  { name: 'get_security_events', requireRoot: true },
];
const registry = new Map(tools.map((tool) => [tool.name, tool]));

describe('selectAgentTools', () => {
  it('按意图只选择相关工具并限制总数', () => {
    const selected = selectAgentTools(registry, {
      message: '帮我找一下最近收藏的书签',
      userRole: 'user',
      maxTools: 8,
    });
    const names = selected.map((tool) => tool.name);
    expect(names).toContain('query_bookmarks');
    expect(names).not.toContain('query_notes');
    expect(names.length).toBeLessThanOrEqual(8);
  });

  it('非 root 永远拿不到 root 工具 schema', () => {
    const selected = selectAgentTools(registry, {
      message: '查询用户和安全事件',
      userRole: 'user',
    });
    expect(selected.some((tool) => tool.requireRoot)).toBe(false);
  });

  it('游客和只读上下文不下发写工具 schema', () => {
    const visitor = selectAgentTools(registry, {
      message: '帮我收藏这个书签',
      userRole: 'visitor',
    });
    const readonly = selectAgentTools(registry, {
      message: '创建一篇笔记',
      userRole: 'user',
      allowWrite: false,
    });
    expect(visitor.some((tool) => tool.isWrite)).toBe(false);
    expect(readonly.some((tool) => tool.isWrite)).toBe(false);
  });

  it('仅管理员维护上下文可显式向游客下发写工具 schema', () => {
    const selected = selectAgentTools(registry, {
      message: '创建一篇笔记',
      userRole: 'visitor',
      allowWrite: true,
      allowVisitorWrite: true,
    });
    expect(selected.some((tool) => tool.name === 'create_note')).toBe(true);
  });
});
