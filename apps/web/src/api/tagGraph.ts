import { apiBasePost } from '@/http/request.ts';

export type GraphResourceType = 'bookmark' | 'note' | 'file';
export type GraphNodeType = GraphResourceType | 'tag';
export type GraphEdgeType = 'tag-tag' | 'tag-bookmark' | 'tag-note' | 'tag-file';

export interface TagGraphRequest {
  tagId: string;
  includeResources?: boolean;
  resourceTypes?: GraphResourceType[];
  limitRelatedTags?: number;
  limitPerResourceType?: number;
}

export interface TagGraphNode {
  id: string;
  rawId: string;
  type: GraphNodeType;
  label: string;
  size: number;
  weight: number;
  iconUrl?: string;
  meta?: {
    url?: string;
    fileType?: string;
    fileSize?: number;
    ext?: string;
    category?: string;
    updateTime?: string;
    description?: string;
    relatedCount?: number;
    resourceCount?: number;
    sharedCount?: number;
    isCenter?: boolean;
    isAggregate?: boolean;
  };
}

export interface TagGraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  weight: number;
  sharedCount?: number;
}

export interface TagGraphResponse {
  centerTag: {
    id: string;
    name: string;
    iconUrl?: string;
  };
  nodes: TagGraphNode[];
  edges: TagGraphEdge[];
  stats: {
    relatedTagCount: number;
    bookmarkCount: number;
    noteCount: number;
    fileCount: number;
  };
}

export function fetchTagGraph(params: TagGraphRequest) {
  return apiBasePost('/api/bookmark/getTagGraph', params) as Promise<{
    status: number;
    data: TagGraphResponse;
    msg: string;
  }>;
}

export interface GlobalGraphResponse {
  nodes: TagGraphNode[];
  edges: TagGraphEdge[];
  stats: {
    tagCount: number;
    shownTagCount: number;
    resourceCount: number;
    totalResourceCount: number;
    taggedResourceCount: number;
    untaggedResourceCount: number;
    emptyTagCount: number;
    isolatedTagCount: number;
    edgeCount: number;
    truncated: boolean;
  };
}

// 全局知识地图:全部标签 + 标签共现边;资源在聚焦标签后通过 fetchTagGraph 按需加载。
export function fetchGlobalGraph(params?: { minCoOccurrence?: number }) {
  return apiBasePost('/api/bookmark/getGlobalGraph', params || {}) as Promise<{
    status: number;
    data: GlobalGraphResponse;
    msg: string;
  }>;
}
