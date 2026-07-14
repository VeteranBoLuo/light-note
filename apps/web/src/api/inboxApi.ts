import { apiBasePost } from '@/http/request';

export type InboxResourceType = 'bookmark' | 'note' | 'file';

export interface InboxResourceRef {
  resourceType: InboxResourceType;
  resourceId: string;
}

export interface InboxItem extends InboxResourceRef {
  title: string;
  summary: string;
  detail: string;
  source: string;
  collectedAt: string;
  resourceCreatedAt: string;
}

export const listInbox = (params: {
  type: 'all' | InboxResourceType;
  keyword: string;
  currentPage: number;
  pageSize: number;
  sort: 'newest' | 'oldest';
}) => apiBasePost('/api/inbox/list', params, { silent: true });

export const countInbox = () => apiBasePost('/api/inbox/count', {}, { silent: true });

export const enqueueInbox = (items: InboxResourceRef[], source = 'manual') =>
  apiBasePost('/api/inbox/enqueue', { items, source });

export const completeInbox = (items: InboxResourceRef[]) =>
  apiBasePost('/api/inbox/complete', { items });
