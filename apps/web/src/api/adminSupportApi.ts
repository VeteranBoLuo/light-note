import { apiBaseGet, apiBasePost } from '@/http/request';

export interface AdminSupportOverview {
  verifiedOrders: number;
  assignedSupporters: number;
  totalAmount: string;
  supportOrders: number;
  supportAmount: string;
  purchaseOrders: number;
  purchaseAmount: string;
  monthAmount: string;
  linkedAccounts: number;
  pendingOrders: number;
  conflictOrders: number;
  unlinkedOrders: number;
  grantedTokens: number;
  grantedStorageMb: number;
  manualReviewRewards: number;
  reversalReviewRewards: number;
}

export interface AdminSupportOrder {
  providerOrderNo: string;
  totalAmount: string;
  providerStatus: number;
  verificationState: string;
  ownershipSource: string;
  orderPurpose: 'unknown' | 'legacy_support' | 'donation' | 'entitlement_purchase';
  lightNoteUserId: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  rankingObservedAt: string | null;
  verifiedAt: string | null;
  createTime: string;
  alias: string | null;
  providerName: string | null;
  grantStatus: string | null;
  reasonCode: string | null;
  calculatedTokens: number;
  grantedTokens: number;
  grantedStorageMb: number;
  calculatedStorageMb: number;
  intentType: string | null;
  skuId: string | null;
  reviewedAt: string | null;
  creditedAt: string | null;
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
  grantedTokens: number;
  grantedStorageMb: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSupportCampaignSkuInput {
  skuId: string;
  title: string;
  category?: 'ai' | 'storage' | 'combo';
  amount: number;
  aiTokens: number;
  storageMb: number;
  perUserLimit: number;
  sortOrder?: number;
}

export interface AdminSupportCampaignSku extends Omit<AdminSupportCampaignSkuInput, 'amount'> {
  campaignSkuId: string;
  amount: string;
  marginBps: number;
  sortOrder: number;
}

export interface AdminSupportCampaign {
  id: string;
  campaignKey: string;
  version: number;
  catalogVersion: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'suspended';
  startsAt: string;
  endsAt: string;
  costPolicyVersion: string;
  publishedAt: string | null;
  suspendedAt: string | null;
  createTime: string;
  updateTime: string;
  skus: AdminSupportCampaignSku[];
}

export interface AdminSupportCampaignCostItem {
  skuId: string;
  title: string;
  amount: string;
  aiTokens: number;
  storageMb: number;
  channelNet: number;
  directCost: number;
  margin: number;
  marginBps: number;
  passes: boolean;
}

export interface AdminSupportCampaignCostPreview {
  policyVersion: string;
  minimumMarginBps: number;
  passes: boolean;
  items: AdminSupportCampaignCostItem[];
}

export interface AdminSupportCampaignGrant {
  id: string;
  providerOrderNo: string;
  userId: string | null;
  skuId: string;
  paidAmount: string;
  calculatedAiTokens: number;
  calculatedStorageMb: number;
  grantedAiTokens: number;
  grantedStorageMb: number;
  status: string;
  reasonCode: string | null;
  creditedAt: string | null;
  createTime: string;
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
  const response = await apiBasePost(`/api/support/admin/orders/${encodeURIComponent(providerOrderNo)}/reconcile`);
  if (response.status !== 200) throw new Error('ADMIN_SUPPORT_RECONCILE_FAILED');
}

export async function approveAdminSupportReward(input: {
  providerOrderNo: string;
  expectedTokens: number;
  expectedUserId: string;
}): Promise<void> {
  const response = await apiBasePost(
    `/api/support/admin/orders/${encodeURIComponent(input.providerOrderNo)}/reward-approve`,
    { expectedTokens: input.expectedTokens, expectedUserId: input.expectedUserId },
  );
  if (response.status !== 200) throw new Error('ADMIN_SUPPORT_REWARD_APPROVE_FAILED');
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

export async function getAdminSupportCampaigns(): Promise<AdminSupportCampaign[]> {
  return requireData(await apiBaseGet('/api/support/admin/campaigns'), 'ADMIN_SUPPORT_CAMPAIGNS_FAILED');
}

export async function previewAdminSupportCampaignCosts(
  skus: AdminSupportCampaignSkuInput[],
): Promise<AdminSupportCampaignCostPreview> {
  return requireData(
    await apiBasePost('/api/support/admin/campaigns/cost-preview', { skus }),
    'ADMIN_SUPPORT_CAMPAIGN_COST_FAILED',
  );
}

export async function createAdminSupportCampaign(input: {
  campaignKey: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  skus: AdminSupportCampaignSkuInput[];
}): Promise<AdminSupportCampaign> {
  return requireData(await apiBasePost('/api/support/admin/campaigns', input), 'ADMIN_SUPPORT_CAMPAIGN_CREATE_FAILED');
}

export async function publishAdminSupportCampaign(campaignId: string): Promise<AdminSupportCampaign> {
  return requireData(
    await apiBasePost(`/api/support/admin/campaigns/${encodeURIComponent(campaignId)}/publish`),
    'ADMIN_SUPPORT_CAMPAIGN_PUBLISH_FAILED',
  );
}

export async function suspendAdminSupportCampaign(campaignId: string): Promise<AdminSupportCampaign> {
  return requireData(
    await apiBasePost(`/api/support/admin/campaigns/${encodeURIComponent(campaignId)}/suspend`),
    'ADMIN_SUPPORT_CAMPAIGN_SUSPEND_FAILED',
  );
}

export async function getAdminSupportCampaignGrants(campaignId: string): Promise<AdminSupportCampaignGrant[]> {
  return requireData(
    await apiBaseGet(`/api/support/admin/campaigns/${encodeURIComponent(campaignId)}/grants`),
    'ADMIN_SUPPORT_CAMPAIGN_GRANTS_FAILED',
  );
}
