import { apiBaseGet, apiBasePost } from '@/http/request';

export interface AdminSupportOverview {
  verifiedOrders: number;
  assignedSupporters: number;
  totalAmount: string;
  monthAmount: string;
  linkedAccounts: number;
  pendingOrders: number;
  conflictOrders: number;
  unlinkedOrders: number;
}

export interface AdminSupportOrder {
  providerOrderNo: string;
  totalAmount: string;
  providerStatus: number;
  verificationState: string;
  ownershipSource: string;
  lightNoteUserId: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  rankingObservedAt: string | null;
  verifiedAt: string | null;
  createTime: string;
  alias: string | null;
  providerName: string | null;
}

export interface AdminSupporter {
  userId: string;
  alias: string;
  providerName: string | null;
  linkedAt: string | null;
  orderCount: number;
  totalAmount: string;
  lastSupportAt: string | null;
  participateInRanking: number;
  showIdentity: number;
  adminHidden: number;
  adminHiddenReason: string | null;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

async function requireData<T>(response: { status: number; data?: unknown }, code: string): Promise<T> {
  if (response.status !== 200 || !response.data) throw new Error(code);
  return response.data as T;
}

export async function getAdminSupportOverview(): Promise<AdminSupportOverview> {
  return requireData(await apiBaseGet('/api/support/admin/overview'), 'ADMIN_SUPPORT_OVERVIEW_FAILED');
}

export async function getAdminSupportOrders(params: {
  page: number;
  pageSize: number;
  state?: string;
  search?: string;
}): Promise<PageResult<AdminSupportOrder>> {
  return requireData(await apiBaseGet('/api/support/admin/orders', params), 'ADMIN_SUPPORT_ORDERS_FAILED');
}

export async function getAdminSupporters(params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<PageResult<AdminSupporter>> {
  return requireData(await apiBaseGet('/api/support/admin/supporters', params), 'ADMIN_SUPPORTERS_FAILED');
}

export async function forceAdminSupportSync(): Promise<{ synced: number; truncated: boolean; skipped?: boolean }> {
  return requireData(await apiBasePost('/api/support/admin/sync'), 'ADMIN_SUPPORT_SYNC_FAILED');
}

export async function reconcileAdminSupportOrder(providerOrderNo: string): Promise<void> {
  const response = await apiBasePost(
    `/api/support/admin/orders/${encodeURIComponent(providerOrderNo)}/reconcile`,
  );
  if (response.status !== 200) throw new Error('ADMIN_SUPPORT_RECONCILE_FAILED');
}

export async function setAdminSupportIdentityHidden(input: {
  userId: string;
  hidden: boolean;
  reason?: string;
}): Promise<void> {
  const response = await apiBasePost(
    `/api/support/admin/supporters/${encodeURIComponent(input.userId)}/identity-visibility`,
    { hidden: input.hidden, reason: input.reason || '' },
  );
  if (response.status !== 200) throw new Error('ADMIN_SUPPORT_VISIBILITY_FAILED');
}
