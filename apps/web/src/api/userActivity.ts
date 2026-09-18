import { apiBasePost } from '@/http/request';
export interface ActiveUserRow {
  id: string;
  name: string;
  userRemark: string;
  firstActiveAt: string;
  lastActiveAt: string;
}
export interface ActivityTrendPoint {
  date: string;
  total: number | null;
  partial: boolean;
}
export interface ActiveUsersPage {
  trend?: ActivityTrendPoint[];
  date: string;
  snapshotAt: string;
  hideInternal: boolean;
  total: number | null;
  partialDate: boolean;
  historyUnavailable: boolean;
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
  date?: string,
  trendDays?: number,
) =>
  apiBasePost(
    '/api/common/getAdminOverviewActiveUsers',
    { hideInternal, cursor, snapshotAt, date, trendDays },
    { silent: true, signal },
  );
