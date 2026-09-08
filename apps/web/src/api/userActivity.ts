import { apiBasePost } from '@/http/request';
export interface ActiveUserRow {
  id: string;
  name: string;
  userRemark: string;
  firstActiveAt: string;
  lastActiveAt: string;
}
export interface ActiveUsersPage {
  date: string;
  snapshotAt: string;
  hideInternal: boolean;
  total: number;
  items: ActiveUserRow[];
  hasMore: boolean;
  nextCursor: string | null;
  partialToday: boolean;
  startedAt: string;
}
export const getActiveUsers = (
  hideInternal: boolean,
  cursor: string | null,
  snapshotAt: string | null,
  signal?: AbortSignal,
) =>
  apiBasePost(
    '/api/common/getAdminOverviewActiveUsers',
    { hideInternal, cursor, snapshotAt },
    { silent: true, signal },
  );
