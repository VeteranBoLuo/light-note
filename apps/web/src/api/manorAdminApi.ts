import { apiBaseGet, apiBasePost } from '@/http/request';

export interface ManorRuntime {
  mode: 'open' | 'maintenance';
  message: string;
  revision: number;
  deploymentEnabled: boolean;
  /** internal：仅 Root 与 test；all：全部登录账号。由部署环境决定。 */
  audience: 'internal' | 'all';
  updatedAt?: string;
  updatedBy?: string | null;
  coverageStartedAt: string | null;
  rules: { version: string; dailyWater: number; freeCasts: number; pityCasts: number; targetWeight: number };
}
export interface ManorOperation {
  userId: string;
  alias: string;
  requestId: string;
  action: string | null;
  effectful: boolean | null;
  deltas: Array<{ key: string; delta: number }>;
  pointsDelta: number;
  revision: number;
  version: string;
  createdAt: string;
}
export interface ManorPlayerRow {
  userId: string;
  alias: string;
  revision: number;
  updatedAt: string;
  level: number;
  discoveries: number;
}
export interface ManorPlayer {
  userId: string;
  alias: string;
  revision: number;
  points: number;
  snapshotAt: string;
  version?: string;
  level?: number;
  state: Record<string, any> | null;
  unavailable?: string;
  plots?: Array<{ crop: string | null; status: string; remaining?: number | null }>;
  facilities?: Record<string, any>;
}
export interface ManorEarner {
  userId: string;
  alias: string | null;
  income: number;
  spent: number;
  net: number;
  flagged: boolean;
}
export interface ManorEarners {
  /** 固定滚动窗口天数，不跟随总览的范围选择。 */
  windowDays: number;
  since: string;
  threshold: number;
  items: ManorEarner[];
}
export interface ManorOverview {
  range: { days: number; start: string; end: string; hideInternal: boolean };
  runtime: ManorRuntime;
  opened: number | null;
  finances: { issued: number; spent: number; trend: Array<{ day: string; issued: number; spent: number }> } | null;
  activity: Record<string, number> | null;
  earners: ManorEarners | null;
  recent: ManorOperation[] | null;
  failures: string[];
}
export interface ManorAdminFilters {
  days?: number;
  hideInternal?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  cursor?: string | null;
}
async function read<T>(path: string, query?: ManorAdminFilters, signal?: AbortSignal): Promise<T> {
  const response = await apiBaseGet(`/api/growth/admin/manor/${path}`, query, { silent: true, signal });
  if (response.status !== 200 || response.data == null) throw { code: response.data?.code, status: response.status };
  return response.data as T;
}
export const getManorAdminStatus = (signal?: AbortSignal) => read<ManorRuntime>('status', undefined, signal);
export const getManorAdminOverview = (query: ManorAdminFilters, signal?: AbortSignal) =>
  read<ManorOverview>('overview', query, signal);
export const getManorAdminPlayers = (query: ManorAdminFilters, signal?: AbortSignal) =>
  read<{ items: ManorPlayerRow[]; total: number; page: number }>('players', query, signal);
export const getManorAdminPlayer = (id: string, signal?: AbortSignal) =>
  read<ManorPlayer>(`players/${encodeURIComponent(id)}`, undefined, signal);
export const getManorAdminOperations = (query: ManorAdminFilters, signal?: AbortSignal) =>
  read<{ items: ManorOperation[]; nextCursor: string | null }>('operations', query, signal);
export async function setManorAdminRuntime(input: {
  mode: ManorRuntime['mode'];
  message: string;
  expectedRevision: number;
  reason: string;
  confirmed: true;
}) {
  const response = await apiBasePost('/api/growth/admin/manor/runtime', input, { silent: true });
  if (response.status !== 200 || !response.data) throw { code: response.data?.code, status: response.status };
  return response.data as ManorRuntime;
}
