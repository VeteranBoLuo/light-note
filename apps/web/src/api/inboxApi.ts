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
  sort: 'newest' | 'oldest';
}) => apiBasePost('/api/inbox/list', params, { silent: true });

export const countInbox = () => apiBasePost('/api/inbox/count', {}, { silent: true });

export const enqueueInbox = (items: InboxResourceRef[], source = 'manual', options?: { silent?: boolean }) =>
  apiBasePost('/api/inbox/enqueue', { items, source }, options);

export const completeInbox = (items: InboxResourceRef[], options?: { silent?: boolean }) =>
  apiBasePost('/api/inbox/complete', { items }, options);
