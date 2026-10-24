import { apiBaseGet, apiBasePost } from '@/http/request';
import { PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';
import type { GlobalSearchResponse, GlobalSearchQuery } from '@/api/search';
import type {
  PublicationMaterial,
  PublicationPreview,
  PublicationRecord,
  PublicationWorkspaceItem,
  PublicationOwnState,
  PublicResourceCapabilities,
  PublicResourceDetail,
  PublicResourceKind,
  PublicResourceReview,
} from '@lightnote/shared/public-resources';
export type {
  PublicationMaterial,
  PublicationPreview,
  PublicationRecord,
  PublicationWorkspaceItem,
  PublicationOwnState,
  PublicResourceCapabilities,
  PublicResourceDetail,
  PublicResourceKind,
};
export interface PublicPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
export interface PublicationRevision extends PublicationMaterial {
  fingerprint?: string;
  revision: number;
  status: string;
  reason: string;
  createdAt: string;
  aiStatus?: string;
  ai?: PublicResourceReview | null;
  aiReason?: string;
  aiPolicy?: string;
  aiRequestId?: string;
  aiCreatedAt?: string;
  aiFinishedAt?: string;
}
export interface PublicationOwnDetail {
  publicId: string;
  kind: PublicResourceKind;
  version: number;
  reason: string;
  revisions: PublicationRevision[];
}
export interface ModerationQueueItem {
  publicId: string;
  kind: PublicResourceKind;
  title: string;
  version: number;
  revision: number;
  authorName: string;
  createdAt: string;
  isUpdate: boolean;
  aiStatus: string;
  ai: PublicResourceReview | null;
  reportId?: string;
  reason?: string;
}
export interface ModerationAction {
  publicId: string;
  action: string;
  actorName: string;
  reason: string;
  version: number;
  revision: number | null;
  createdAt: string;
}
export interface PublicReport {
  reportId: string;
  reason: string;
  status: string;
  version: number;
  handledReason: string;
  createdAt: string;
  evidence: PublicationRevision;
}
export interface ModerationDetail {
  publicId: string;
  kind: PublicResourceKind;
  version: number;
  removed: boolean;
  withdrawn: boolean;
  hasPending: boolean;
  authorName: string;
  reason: string;
  latestRevision: number;
  publishedRevision: number | null;
  revisions: PublicationRevision[];
  actions: ModerationAction[];
  reports: PublicReport[];
}
function apiError(error: any) {
  return Object.assign(new Error('PUBLIC_RESOURCE_UNAVAILABLE'), {
    code: error?.data?.code || error?.response?.data?.data?.code || error?.code || 'PUBLIC_RESOURCE_UNAVAILABLE',
    status: Number(error?.response?.status || error?.status) || 0,
  });
}
export async function publicGet<T = any>(
  path: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await apiBaseGet('/api/public-resources/' + path, params, { silent: true, signal });
    if (response.status !== 200) throw apiError(response);
    return response.data;
  } catch (error) {
    throw apiError(error);
  }
}
/** A retry resolves the same operation receipt before attempting the same request ID again. */
export type PublicOperation<T = any> = (() => Promise<T>) & {
  resolve: () => Promise<{ found: boolean; result: T | null }>;
};
export function publicOperation<T = any>(
  path: string,
  body: Record<string, unknown>,
  requestId = crypto.randomUUID(),
): PublicOperation<T> {
  const input = { ...body, requestId };
  let attempted = false;
  const resolve = () => publicGet<{ found: boolean; result: T | null }>('operations/' + input.requestId);
  const perform = async (): Promise<T> => {
    if (attempted) {
      const receipt = await resolve();
      if (receipt.found) return receipt.result as T;
    }
    attempted = true;
    try {
      const response = await apiBasePost('/api/public-resources/' + path, input, { silent: true });
      if (response.status !== 200) throw apiError(response);
      return response.data;
    } catch (error) {
      const receipt = await resolve().catch(() => null);
      if (receipt?.found) return receipt.result as T;
      throw apiError(error);
    }
  };
  return Object.assign(perform, { resolve });
}
export interface PreparedPublication {
  kind: PublicResourceKind;
  sourceId: string;
  title?: string;
  fingerprint?: string;
  expectedVersion?: number;
  code: string;
}
export async function preparePublications(
  items: { kind: PublicResourceKind; sourceId: string }[],
  signal?: AbortSignal,
) {
  try {
    const response = await apiBasePost('/api/public-resources/batch/preview', { items }, { silent: true, signal });
    if (response.status !== 200) throw apiError(response);
    return response.data as { items: PreparedPublication[] };
  } catch (error) {
    throw apiError(error);
  }
}
export interface PublicBatchResponse {
  items: {
    requestId: string;
    state: 'success' | 'reused' | 'failed' | 'unknown';
    result?: { publicId: string; version: number; revision?: number; reused?: boolean };
    code?: string;
    status?: number;
  }[];
}
export async function sendPublicResourceBatch(
  entries: { requestId: string; path: string; body: Record<string, unknown> }[],
) {
  const normalized = entries.map(({ path, body, requestId }) => {
    if (path === 'submit') return { route: 'batch', action: 'submit', item: { ...body, requestId } };
    const withdraw = /^own\/([^/]+)\/withdraw$/.exec(path);
    if (withdraw) return { route: 'batch', action: 'withdraw', item: { ...body, requestId, publicId: withdraw[1] } };
    const moderate = /^moderation\/([^/]+)\/decide$/.exec(path);
    if (moderate && ['approve', 'reject'].includes(String(body.action))) {
      const { action, ...rest } = body;
      return { route: 'moderation/batch', action, item: { ...rest, requestId, publicId: moderate[1] } };
    }
    throw new Error('PUBLIC_RESOURCE_INVALID_BATCH');
  });
  if (
    !normalized.length ||
    normalized.some((i) => i.route !== normalized[0].route || i.action !== normalized[0].action)
  )
    throw new Error('PUBLIC_RESOURCE_INVALID_BATCH');
  return publicOperation<PublicBatchResponse>(normalized[0].route, {
    action: normalized[0].action,
    items: normalized.map((i) => i.item),
  })();
}
export async function resolvePublications(
  ids: string[],
  signal?: AbortSignal,
): Promise<{ items: PublicationOwnState[]; unavailableIds: string[] }> {
  try {
    const result: { items: PublicationOwnState[]; unavailableIds: string[] } = { items: [], unavailableIds: [] };
    for (let offset = 0; offset < ids.length; offset += PUBLIC_RESOURCE_LIMITS.batch) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = await apiBasePost(
        '/api/public-resources/own/resolve',
        { ids: ids.slice(offset, offset + PUBLIC_RESOURCE_LIMITS.batch) },
        { silent: true, signal },
      );
      if (response.status !== 200) throw apiError(response);
      result.items.push(...response.data.items);
      result.unavailableIds.push(...response.data.unavailableIds);
    }
    return result;
  } catch (error) {
    throw apiError(error);
  }
}
export async function previewPublication(
  kind: PublicResourceKind,
  sourceId: string,
  signal?: AbortSignal,
): Promise<PublicationPreview> {
  try {
    const response = await apiBasePost('/api/public-resources/preview', { kind, sourceId }, { silent: true, signal });
    if (response.status !== 200) throw apiError(response);
    return response.data;
  } catch (error) {
    throw apiError(error);
  }
}
export async function fetchCombinedSearch(
  keyword: string,
  options: GlobalSearchQuery & {
    mode?: 'full' | 'suggest';
    suggestLayout?: 'grouped' | 'compact';
    sourceType?: string;
    pageSize?: number;
    source?: string;
  } = {},
  signal?: AbortSignal,
): Promise<GlobalSearchResponse> {
  const { paginationMode: _, separateTagMatches: __, todoPriority, page: ___, ...query } = options;
  const response = await apiBasePost(
    '/api/public-resources/search/combined',
    { keyword, ...query, ...(todoPriority ? { todoPriorities: todoPriority } : {}) },
    { silent: true, signal },
  );
  if (response.status !== 200) throw apiError(response);
  return response.data;
}
