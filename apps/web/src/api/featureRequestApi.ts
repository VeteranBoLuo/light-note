import { apiBasePost } from '@/http/request';

export type FeatureRequestCategory = 'bookmark' | 'note' | 'cloud' | 'tag' | 'ai' | 'experience' | 'other';
export type FeatureRequestModerationStatus = 'pending_review' | 'published' | 'rejected' | 'merged' | 'hidden';
export type FeatureRequestProgressStatus = 'evaluating' | 'planned' | 'in_progress' | 'released' | 'declined';
export type FeatureRequestSourceType = 'user' | 'official';

export interface FeatureRequestItem {
  id: string;
  title: string;
  content: string;
  category: FeatureRequestCategory;
  sourceType: FeatureRequestSourceType;
  showIdentity: boolean | number;
  moderationStatus: FeatureRequestModerationStatus;
  progressStatus: FeatureRequestProgressStatus;
  mergedToId?: string;
  developerReply?: string;
  releaseUrl?: string;
  voteCount: number;
  publishedAt?: string;
  releasedAt?: string;
  createTime: string;
  updateTime: string;
  submitterAlias?: string;
  submitterAvatar?: string;
  ownerAlias?: string;
  viewerIsOwner: boolean | number;
  viewerVoted: boolean | number;
}

export interface FeatureRequestUpdate {
  id: string;
  type: string;
  content?: string;
  fromStatus?: string;
  toStatus?: string;
  actorType: 'developer' | 'submitter';
  createTime: string;
}

export interface FeatureRequestDetail extends FeatureRequestItem {
  updates: FeatureRequestUpdate[];
  mergedTo?: { id: string; title: string } | null;
}

export type FeatureRequestSummaryResponse = Partial<Record<FeatureRequestProgressStatus, number>> & {
  inProgress?: number;
};

export interface FeatureRequestListResult {
  items: FeatureRequestItem[];
  total: number;
  currentPage: number;
  pageSize: number;
  summary?: FeatureRequestSummaryResponse;
}

export function normalizeFeatureRequestSummary(
  summary?: FeatureRequestSummaryResponse | null,
): Record<FeatureRequestProgressStatus, number> {
  return {
    evaluating: Number(summary?.evaluating ?? 0),
    planned: Number(summary?.planned ?? 0),
    in_progress: Number(summary?.inProgress ?? summary?.in_progress ?? 0),
    released: Number(summary?.released ?? 0),
    declined: Number(summary?.declined ?? 0),
  };
}

export interface FeatureRequestDraft {
  title: string;
  content: string;
  category: FeatureRequestCategory;
  showIdentity?: boolean;
}

export const listPublicFeatureRequests = (params: {
  currentPage: number;
  pageSize: number;
  filters: {
    keyword?: string;
    category?: string;
    progressStatus?: string;
    sort?: 'updated' | 'newest' | 'popular';
  };
}) => apiBasePost('/api/featureRequest/listPublic', params, { silent: true });

export const getFeatureRequestDetail = (id: string) =>
  apiBasePost('/api/featureRequest/getPublicDetail', { id }, { silent: true });

export const createFeatureRequest = (draft: FeatureRequestDraft) => apiBasePost('/api/featureRequest/create', draft);

export const listMyFeatureRequests = (params: { currentPage: number; pageSize: number }) =>
  apiBasePost('/api/featureRequest/listMine', params, { silent: true });

export const toggleFeatureRequestVote = (id: string) => apiBasePost('/api/featureRequest/toggleVote', { id });

export const addFeatureRequestUpdate = (id: string, content: string) =>
  apiBasePost('/api/featureRequest/addSubmitterUpdate', { id, content });

export const listAdminFeatureRequests = (params: {
  currentPage: number;
  pageSize: number;
  filters: { keyword?: string; moderationStatus?: string; progressStatus?: string };
}) => apiBasePost('/api/featureRequest/admin/list', params, { silent: true });

export const createOfficialFeatureRequest = (draft: FeatureRequestDraft) =>
  apiBasePost('/api/featureRequest/admin/create', draft);

export const reviewFeatureRequest = (id: string, moderationStatus: FeatureRequestModerationStatus, reply = '') =>
  apiBasePost('/api/featureRequest/admin/review', { id, moderationStatus, reply });

export const replyFeatureRequest = (id: string, content: string) =>
  apiBasePost('/api/featureRequest/admin/reply', { id, content });

export const updateFeatureRequestProgress = (
  id: string,
  progressStatus: FeatureRequestProgressStatus,
  releaseUrl = '',
) => apiBasePost('/api/featureRequest/admin/updateStatus', { id, progressStatus, releaseUrl });

export const mergeFeatureRequest = (id: string, targetRequestId: string, content = '') =>
  apiBasePost('/api/featureRequest/admin/merge', { id, targetRequestId, content });

export const editFeatureRequest = (id: string, draft: FeatureRequestDraft) =>
  apiBasePost('/api/featureRequest/admin/edit', { id, ...draft });
