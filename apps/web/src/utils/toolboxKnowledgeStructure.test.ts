import { describe, expect, it } from 'vitest';
import type { ToolboxKnowledgeNode } from '@/api/toolbox';
import { collectKnowledgeSubtree, generateKnowledgeDirectoryIndex } from './toolboxKnowledgeStructure';

function node(partial: Partial<ToolboxKnowledgeNode>): ToolboxKnowledgeNode {
  return {
    id: 'n',
    parentId: null,
    effectiveParentId: null,
    title: '笔记',
    type: 'markdown',
    depth: 1,
    path: '笔记',
    childCount: 0,
    tagCount: 0,
    outgoingReferenceCount: 0,
    incomingReferenceCount: 0,
    contentLength: 10,
    contentEmpty: false,
    invalidParent: false,
    isTop: false,
    sort: 0,
    updatedAt: '2026-08-29T00:00:00.000Z',
    createdAt: '2026-08-29T00:00:00.000Z',
    ...partial,
  };
}

describe('toolboxKnowledgeStructure', () => {
  const nodes = [
    node({ id: 'root', title: '开发文档', childCount: 2 }),
    node({ id: 'b', parentId: 'root', effectiveParentId: 'root', title: 'B', depth: 2, path: '开发文档 / B', sort: 2 }),
    node({
      id: 'a',
      parentId: 'root',
      effectiveParentId: 'root',
      title: 'A',
      depth: 2,
      path: '开发文档 / A',
      sort: 1,
      tagCount: 2,
    }),
    node({ id: 'leaf', parentId: 'a', effectiveParentId: 'a', title: '叶子', depth: 3, path: '开发文档 / A / 叶子' }),
  ];

  it('按目录顺序和相对层级收集子树', () => {
    expect(collectKnowledgeSubtree(nodes, 'root', 2).map((item) => [item.node.id, item.relativeDepth])).toEqual([
      ['root', 1],
      ['a', 2],
      ['b', 2],
    ]);
  });

  it('生成带站内链接和可选元数据的 Markdown 索引', () => {
    const result = generateKnowledgeDirectoryIndex(nodes, {
      rootId: 'root',
      maxDepth: 3,
      includeStats: true,
      generatedAt: new Date('2026-08-29T00:00:00.000Z'),
    });
    expect(result.count).toBe(4);
    expect(result.markdown).toContain('- [开发文档](/noteLibrary/root)');
    expect(result.markdown).toContain('  - [A](/noteLibrary/a) · 0 子页 · 2 标签');
    expect(result.markdown.indexOf('[A]')).toBeLessThan(result.markdown.indexOf('[B]'));
  });

  it('允许调用方按当前界面语言生成目录文案与日期', () => {
    const messages: Record<string, string> = {
      untitled: 'Untitled note',
      indexTitle: 'Directory index',
      libraryTitle: 'Light Note knowledge base',
      generatedSummary: '{count} notes · Generated {date}',
      children: '{count} children',
      tags: '{count} tags',
      references: '{count} references',
      updated: 'Updated {date}',
      empty: 'No notes yet.',
    };
    const translate = (key: string, params: Record<string, string | number> = {}) =>
      Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), messages[key]);
    const result = generateKnowledgeDirectoryIndex([], {
      locale: 'en-US',
      generatedAt: new Date('2026-08-29T00:00:00.000Z'),
      translate,
    });
    expect(result.markdown).toContain('# Light Note knowledge base · Directory index');
    expect(result.markdown).toContain('0 notes · Generated');
    expect(result.markdown).toContain('_No notes yet._');
  });
});
