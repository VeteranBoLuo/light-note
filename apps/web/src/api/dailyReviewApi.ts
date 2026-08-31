import { apiBaseGet, apiBasePost, type ApiResponse } from '@/http/request.ts';

export type DailyReviewResourceType = 'bookmark' | 'note' | 'file';
export type DailyReviewReasonCode = 'on_this_day' | 'active_tag' | 'buried';
export type DailyReviewItemAction = 'pending' | 'opened' | 'opened_tag_space' | 'snoozed' | 'dismissed';
export type DailyReviewItemWriteAction = 'open' | 'open_tag_space' | 'snooze_7d' | 'dismiss';
export type DailyReviewTodayAction = 'skip_today' | 'resume_today';

export interface DailyReviewReasonTag {
  id: string;
  name: string;
}

export interface DailyReviewItem {
  /** 当日会话条目 ID，不是资源 ID。 */
  id: string;
  slot: number;
  resourceType: DailyReviewResourceType;
  resourceId: string;
  title: string;
  url: string | null;
  time: string | null;
  /** 候选生成时按账号时区固化的资源自然日；旧会话可能为空。 */
  resourceDate: string | null;
  reasonCode: DailyReviewReasonCode;
  reasonTag: DailyReviewReasonTag | null;
  action: DailyReviewItemAction;
}

export interface DailyReviewSession {
  id: string;
  status: 'active' | 'completed' | 'empty' | 'skipped';
  itemCount: number;
  completedAt?: string | null;
  skippedAt?: string | null;
}

export interface DailyReviewSnapshot {
  generated: boolean;
  isVisitor?: boolean;
  date: string | null;
  timezone: string | null;
  session: DailyReviewSession | null;
  progress: {
    done: number;
    total: number;
    pending: number;
  };
  items: DailyReviewItem[];
}

export type DailyReviewSnapshotResponse = ApiResponse & { data: DailyReviewSnapshot };
export type DailyReviewMutationResponse = ApiResponse & {
  data: { ok: true; review: DailyReviewSnapshot };
};

export const getTodayDailyReview = () =>
  apiBaseGet('/api/daily-review/today', undefined, { silent: true }) as Promise<DailyReviewSnapshotResponse>;

export const ensureTodayDailyReview = () =>
  apiBasePost('/api/daily-review/today/ensure', undefined, { silent: true }) as Promise<DailyReviewSnapshotResponse>;

export const updateDailyReviewItem = (
  itemId: string,
  action: DailyReviewItemWriteAction,
  options: { keepalive?: boolean } = {},
) =>
  apiBasePost(
    `/api/daily-review/items/${encodeURIComponent(itemId)}/action`,
    { action },
    options.keepalive ? { silent: true, adapter: 'fetch', fetchOptions: { keepalive: true } } : { silent: true },
  ) as Promise<DailyReviewMutationResponse>;

export const updateDailyReviewToday = (action: DailyReviewTodayAction) =>
  apiBasePost('/api/daily-review/today/action', { action }, { silent: true }) as Promise<DailyReviewMutationResponse>;

export default {
  getTodayDailyReview,
  ensureTodayDailyReview,
  updateDailyReviewItem,
  updateDailyReviewToday,
};
