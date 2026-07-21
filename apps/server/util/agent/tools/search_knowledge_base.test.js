import { describe, expect, it } from 'vitest';
import tool from './search_knowledge_base.js';

describe('search_knowledge_base.toSources（内部知识不作为面向用户来源）', () => {
  const rows = [
    { id: 'pub-1', title: '标签怎么用', content: '在标签页...', category: '帮助中心', status: 'public' },
    { id: 'int-1', title: '内部运维手册', content: '仅内部...', category: '运维', status: 'internal' },
  ];

  it('过滤掉 status=internal 的内部知识，即使 root 也不展示', () => {
    const sources = tool.toSources(rows, {}, { userRole: 'root' });
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('pub-1');
    expect(sources.some((s) => s.status === 'internal')).toBe(false);
    // 不再对任何来源生成指向后台知识库管理页的 knowledge-admin 跳转
    expect(sources.some((s) => s.target === 'knowledge-admin')).toBe(false);
  });

  it('public 帮助中心来源保留，并解析为 help-article 跳转', () => {
    const [source] = tool.toSources(rows, {}, { userRole: 'user' });
    expect(source.type).toBe('knowledge');
    expect(source.id).toBe('pub-1');
    expect(source.target).toBe('help-article');
  });

  it('输入为空或非数组时安全返回空来源', () => {
    expect(tool.toSources(null, {}, { userRole: 'root' })).toEqual([]);
    expect(tool.toSources(undefined, {}, { userRole: 'user' })).toEqual([]);
  });
});
