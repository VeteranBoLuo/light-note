import { apiBaseGet, apiBasePost, apiBasePut } from '@/http/request';
export interface FeedResource {
  publicId: string;
  kind: 'note' | 'bookmark';
  title: string;
  createdAt: string;
  postId?: string;
  revision?: number;
}
export interface FeedResourceContent extends FeedResource {
  body: string;
  url: string;
}
export async function discardFeedResource(publicId: string) {
  return apiBasePost('/api/community/resources/' + publicId + '/discard', {}, { silent: true });
}
export interface FeedImage {
  publicId: string;
  url: string;
  width: number;
  height: number;
  fileSize: number;
  contentType: string;
}
export interface FeedAuthor {
  userPublicId: string;
  name: string;
  communityId?: string;
  avatar?: string;
  level?: number;
  levelName?: string;
}
export interface FeedPost {
  images?: FeedImage[];
  resources?: FeedResource[];
  publicId: string;
  kind: string;
  title: string;
  body: string;
  revision: number;
  status: string;
  revisionStatus?: string;
  pending: boolean;
  hasPublishedVersion?: boolean;
  locked: boolean;
  resolved: boolean;
  publishedAt: string;
  topics: any[];
  mentions: string[];
  commentCount?: number;
  likeCount: number;
  liked: boolean;
  subscription: string;
  isOwn: boolean;
  author: FeedAuthor;
}
export interface FeedComment {
  publicId: string;
  body: string;
  status: string;
  revision: number;
  createdAt: string;
  isOwn: boolean;
  author: FeedAuthor | null;
  replyTo: { publicId: string; name: string } | null;
  replyCount: number;
  liked?: boolean;
  likeCount?: number;
  isSolution: boolean;
}
export interface FeedPage<T> {
  items: T[];
  nextCursor: string | null;
}
export async function feedGet<T = any>(path: string, params: Record<string, any> = {}): Promise<T> {
  const response = await apiBaseGet('/api/community/' + path, params, { silent: true });
  if (response.status !== 200) throw Object.assign(new Error('COMMUNITY_UNAVAILABLE'), { code: response.data?.code });
  return response.data;
}
/** Keep one request ID for an exact retry, including after an uncertain commit. */
export function feedOperation(path: string, body: Record<string, any>, method: 'post' | 'put' = 'post') {
  const input = { ...body, requestId: crypto.randomUUID() };
  return async () => {
    try {
      const response = await (method === 'put' ? apiBasePut : apiBasePost)('/api/community/' + path, input, {
        silent: true,
      });
      if (response.status !== 200)
        throw Object.assign(new Error('COMMUNITY_UNAVAILABLE'), { code: response.data?.code });
      return response.data;
    } catch (error) {
      const receipt = await feedGet<{ found: boolean; result: any }>('operations/' + input.requestId).catch(() => null);
      if (receipt?.found) return receipt.result;
      throw error;
    }
  };
}

export async function uploadFeedImage(file: File, requestId: string): Promise<FeedImage> {
  const form = new FormData();
  form.append('requestId', requestId);
  form.append('file', file);
  const result = await apiBasePost('/api/community/images', form, { silent: true });
  if (result.status !== 200) throw new Error(result.data?.code || 'COMMUNITY_UPLOAD_FAILED');
  return result.data;
}
export async function discardFeedImage(publicId: string) {
  return apiBasePost('/api/community/images/' + publicId + '/discard', {}, { silent: true });
}

export interface FeedTaskReward {
  key?: string;
  startsAt: string;
  endsAt: string;
  exp: number;
  points: number;
  configuredExp?: number;
  configuredPoints?: number;
  locked?: boolean;
  state?: 'active' | 'pending' | 'upcoming' | 'ended' | 'paused' | 'claimable' | 'claimed' | 'unavailable';
}
export interface FeedTopic {
  reward?: FeedTaskReward | null;
  slug: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  enabled: boolean;
  officialPinned: boolean;
  postTask: boolean;
  sortOrder: number;
  revision: number;
  postCount?: number;
  participation?: 'not_started' | 'pending_review' | 'completed';
  participationPostId?: string | null;
}
