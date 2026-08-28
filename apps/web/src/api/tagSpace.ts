import { apiBasePost } from '@/http/request.ts';

export type TagSpaceFilter = 'all' | 'bookmark' | 'note' | 'file' | 'empty';
export type TagSpaceSort = 'default' | 'recent' | 'resourceDesc' | 'nameAsc';
export type TagSpaceResourceType = 'bookmark' | 'note' | 'file';
export type TagSpaceResourceFilter = 'all' | TagSpaceResourceType;
export type TagSpaceResourceSort = 'updated' | 'added';

export interface TagSpaceCounts {
  bookmark: number;
  note: number;
  file: number;
  total: number;
}

export interface TagSpacePreviewResource {
  type: TagSpaceResourceType;
  id: string;
  title: string;
  url?: string;
  iconUrl?: string;
  fileType?: string;
  fileSize?: number;
}

export interface TagSpaceSummary {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  sort: number;
  createTime: string | null;
  lastActivityTime: string | null;
  counts: TagSpaceCounts;
  previewResources: TagSpacePreviewResource[];
}

export interface TagSpaceListResponse {
  items: TagSpaceSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  filter: TagSpaceFilter;
  sort: TagSpaceSort;
  keyword: string;
  includeEmpty: boolean;
  facets: Record<TagSpaceFilter, number>;
  overview: {
    tagTotal: number;
    activeTagTotal: number;
    emptyTagTotal: number;
    covered: Pick<TagSpaceCounts, 'bookmark' | 'note' | 'file'>;
  };
}

export interface RelatedTagSummary {
  id: string;
  name: string;
  iconUrl?: string;
  sharedCount?: number;
  count?: number;
}

export interface TagSpaceDetailResponse {
  tag: TagSpaceSummary;
  relatedTags: RelatedTagSummary[];
}

export interface TagSpaceResourceItem {
  id: string;
  type: TagSpaceResourceType;
  title: string;
  description: string;
  url: string;
  iconUrl: string;
  fileType: string;
  fileSize: number;
  folderName: string;
  createTime: string | null;
  updateTime: string | null;
  addedTime: string | null;
  tags: Array<{ id: string; name: string }>;
}

export interface TagSpaceResourceListResponse {
  items: TagSpaceResourceItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  keyword: string;
  type: TagSpaceResourceFilter;
  sort: TagSpaceResourceSort;
}

function ensureSuccess<T>(response: any): T {
  if (response?.status !== 200) {
    throw new Error(String(response?.msg || 'TAG_SPACE_REQUEST_FAILED'));
  }
  return response.data as T;
}

export async function fetchTagSpaces(params: {
  keyword?: string;
  filter?: TagSpaceFilter;
  sort?: TagSpaceSort;
  includeEmpty?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<TagSpaceListResponse> {
  const response = await apiBasePost('/api/bookmark/queryTagSpaces', params, { silent: true, feedback: false });
  return ensureSuccess<TagSpaceListResponse>(response);
}

export async function fetchTagSpace(id: string, relatedLimit = 8): Promise<TagSpaceDetailResponse> {
  const response = await apiBasePost(
    '/api/bookmark/getTagSpace',
    { id, relatedLimit },
    { silent: true, feedback: false },
  );
  return ensureSuccess<TagSpaceDetailResponse>(response);
}

export async function fetchTagSpaceResources(params: {
  id: string;
  keyword?: string;
  type?: TagSpaceResourceFilter;
  sort?: TagSpaceResourceSort;
  page?: number;
  pageSize?: number;
}): Promise<TagSpaceResourceListResponse> {
  const response = await apiBasePost('/api/bookmark/queryTagSpaceResources', params, {
    silent: true,
    feedback: false,
  });
  return ensureSuccess<TagSpaceResourceListResponse>(response);
}
