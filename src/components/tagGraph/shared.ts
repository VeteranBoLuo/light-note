import { RESOURCE_COLOR_HEX } from '@/config/resourceColor.ts';
import type { GraphEdgeType, GraphNodeType, TagGraphEdge, TagGraphNode } from '@/api/tagGraph.ts';

export const GRAPH_NODE_COLOR: Record<GraphNodeType, string> = {
  tag: RESOURCE_COLOR_HEX.tag,
  bookmark: RESOURCE_COLOR_HEX.bookmark,
  note: RESOURCE_COLOR_HEX.note,
  file: RESOURCE_COLOR_HEX.file,
};

export const GRAPH_NODE_LABEL_KEY: Record<GraphNodeType, string> = {
  tag: 'tagGraph.nodeType.tag',
  bookmark: 'tagGraph.nodeType.bookmark',
  note: 'tagGraph.nodeType.note',
  file: 'tagGraph.nodeType.file',
};

export const GRAPH_RESOURCE_TYPE_OPTIONS: Array<{ value: Exclude<GraphNodeType, 'tag'>; labelKey: string }> = [
  { value: 'bookmark', labelKey: 'tagGraph.nodeType.bookmark' },
  { value: 'note', labelKey: 'tagGraph.nodeType.note' },
  { value: 'file', labelKey: 'tagGraph.nodeType.file' },
];

export function getEdgeColor(type: GraphEdgeType) {
  if (type === 'tag-tag') return 'rgba(236, 72, 153, 0.44)';
  if (type === 'tag-note') return 'rgba(0, 168, 132, 0.34)';
  if (type === 'tag-file') return 'rgba(255, 138, 0, 0.34)';
  return 'rgba(97, 92, 237, 0.34)';
}

export function isNeighbor(nodeId: string, activeId: string, edges: TagGraphEdge[]) {
  return edges.some(
    (edge) =>
      (edge.source === activeId && edge.target === nodeId) || (edge.target === activeId && edge.source === nodeId),
  );
}

export function getNodeLabel(node: TagGraphNode) {
  const label = String(node.label || '');
  const maxLength = node.type === 'tag' ? (node.meta?.isCenter ? 16 : 12) : 10;
  return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
}

export function formatGraphFileSize(bytes?: number) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
