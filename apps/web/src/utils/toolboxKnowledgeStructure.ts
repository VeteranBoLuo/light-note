import type { ToolboxKnowledgeNode } from '@/api/toolbox';

export type DirectoryIndexOptions = {
  rootId?: string | null;
  maxDepth?: number;
  includeStats?: boolean;
  includeUpdatedAt?: boolean;
  title?: string;
  generatedAt?: Date;
  locale?: string;
  translate?: (key: DirectoryIndexMessageKey, params?: Record<string, string | number>) => string;
};

type DirectoryIndexMessageKey =
  | 'untitled'
  | 'indexTitle'
  | 'libraryTitle'
  | 'generatedSummary'
  | 'children'
  | 'tags'
  | 'references'
  | 'updated'
  | 'empty';

function compareKnowledgeNodes(left: ToolboxKnowledgeNode, right: ToolboxKnowledgeNode, locale = 'zh-CN') {
  const pinned = Number(Boolean(right.isTop)) - Number(Boolean(left.isTop));
  if (pinned) return pinned;
  if (left.sort !== right.sort) return left.sort - right.sort;
  const time = new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  if (time) return time;
  return left.title.localeCompare(right.title, locale);
}

export function collectKnowledgeSubtree(
  nodes: ToolboxKnowledgeNode[],
  rootId: string | null = null,
  maxDepth = 8,
  locale = 'zh-CN',
) {
  const byParent = new Map<string, ToolboxKnowledgeNode[]>();
  for (const node of nodes) {
    const key = node.effectiveParentId || '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(node);
  }
  for (const children of byParent.values()) children.sort((left, right) => compareKnowledgeNodes(left, right, locale));

  const result: Array<{ node: ToolboxKnowledgeNode; relativeDepth: number }> = [];
  const visited = new Set<string>();
  const root = rootId ? nodes.find((node) => node.id === rootId) : null;
  const queue = root
    ? [{ node: root, relativeDepth: 1 }]
    : (byParent.get('') || []).map((node) => ({ node, relativeDepth: 1 }));
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.node.id) || current.relativeDepth > Math.max(1, maxDepth)) continue;
    visited.add(current.node.id);
    result.push(current);
    const children = byParent.get(current.node.id) || [];
    queue.unshift(...children.slice().map((node) => ({ node, relativeDepth: current.relativeDepth + 1 })));
  }
  return result;
}

function escapeMarkdownLabel(value: string, fallback = '未命名文档') {
  return String(value || fallback)
    .replace(/\\/gu, '\\\\')
    .replace(/([\[\]])/gu, '\\$1')
    .replace(/\r?\n/gu, ' ')
    .trim();
}

function formatIndexDate(value: string | null, locale: string) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function defaultDirectoryMessage(key: DirectoryIndexMessageKey, params: Record<string, string | number> = {}) {
  const messages: Record<DirectoryIndexMessageKey, string> = {
    untitled: '未命名文档',
    indexTitle: '目录索引',
    libraryTitle: '轻笺知识库',
    generatedSummary: `共 ${params.count || 0} 篇笔记 · 生成于 ${params.date || ''}`,
    children: `${params.count || 0} 子页`,
    tags: `${params.count || 0} 标签`,
    references: `${params.count || 0} 引用`,
    updated: `更新 ${params.date || ''}`,
    empty: '当前范围内还没有笔记。',
  };
  return messages[key];
}

export function generateKnowledgeDirectoryIndex(nodes: ToolboxKnowledgeNode[], options: DirectoryIndexOptions = {}) {
  const maxDepth = Math.min(8, Math.max(1, Number(options.maxDepth) || 8));
  const locale = String(options.locale || 'zh-CN');
  const translate = options.translate || defaultDirectoryMessage;
  const selected = collectKnowledgeSubtree(nodes, options.rootId || null, maxDepth, locale);
  const root = options.rootId ? nodes.find((node) => node.id === options.rootId) : null;
  const title = String(
    options.title ||
      (root
        ? `${root.title || translate('untitled')} · ${translate('indexTitle')}`
        : `${translate('libraryTitle')} · ${translate('indexTitle')}`),
  ).trim();
  const generatedAt = options.generatedAt || new Date();
  const generatedDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    generatedAt,
  );
  const lines = [
    `# ${escapeMarkdownLabel(title, translate('untitled'))}`,
    '',
    `> ${translate('generatedSummary', { count: selected.length, date: generatedDate })}`,
    '',
  ];
  for (const { node, relativeDepth } of selected) {
    const indent = '  '.repeat(Math.max(0, relativeDepth - 1));
    const metadata = [];
    if (options.includeStats) {
      metadata.push(translate('children', { count: node.childCount }), translate('tags', { count: node.tagCount }));
      if (node.incomingReferenceCount + node.outgoingReferenceCount > 0) {
        metadata.push(translate('references', { count: node.incomingReferenceCount + node.outgoingReferenceCount }));
      }
    }
    if (options.includeUpdatedAt) {
      const date = formatIndexDate(node.updatedAt, locale);
      if (date) metadata.push(translate('updated', { date }));
    }
    lines.push(
      `${indent}- [${escapeMarkdownLabel(node.title, translate('untitled'))}](/noteLibrary/${encodeURIComponent(node.id)})${metadata.length ? ` · ${metadata.join(' · ')}` : ''}`,
    );
  }
  if (!selected.length) lines.push(`_${translate('empty')}_`);
  return { markdown: lines.join('\n'), count: selected.length, nodes: selected };
}
