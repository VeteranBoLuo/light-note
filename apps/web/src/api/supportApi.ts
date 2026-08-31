import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import { apiBaseGet, apiBasePost } from '@/http/request';

export interface AfdianSupportState {
  authenticated: boolean;
  oauthAvailable: boolean;
  orderSyncAvailable: boolean;
  linked: boolean;
  linkedAt?: string | null;
  providerAccount?: { name: string | null; avatarUrl: string | null } | null;
  orderCount: number;
  totalAmount: string;
  lastSupportAt?: string | null;
  publicPreference: AfdianPublicPreference;
  recentOrders: AfdianSupportOrder[];
}

export interface AfdianPublicPreference {
  participateInRanking: boolean;
  showIdentity: boolean;
  adminHidden: boolean;
  identityConsentedAt?: string | null;
  adminHiddenReason?: string | null;
}

export interface AfdianSupportOrder {
  id: string;
  amount: string;
  month: number;
  productType: number;
  optionKey: string | null;
  orderPurpose: 'unknown' | 'legacy_support' | 'donation' | 'entitlement_purchase';
  ownershipSource: string;
  confirmedAt: string | null;
  rewardStatus: string | null;
  rewardReasonCode: string | null;
  rewardTokens: number;
  grantedTokens: number;
  rewardStorageMb: number;
  grantedStorageMb: number;
  intentType: 'legacy' | 'donation' | 'permanent' | 'campaign';
  skuId: string | null;
  firstPurchaseApplied: boolean;
}

export type SupportPackageCategory = 'ai' | 'storage' | 'combo';
export type FirstPurchaseStatus = 'available' | 'used' | 'login_required';
export type SupportFirstPurchaseScope = 'ai_account' | 'sku';

export interface SupportBenefit {
  aiTokens: number;
  storageMb: number;
}

export interface SupportPackage {
  skuId: string;
  category: SupportPackageCategory;
  firstPurchaseScope: SupportFirstPurchaseScope;
  amount: number;
  base: SupportBenefit;
  firstPurchase: SupportBenefit;
  comboSavings: number;
  firstPurchaseStatus: FirstPurchaseStatus;
}

export interface SupportCampaignPackage {
  campaignId: string;
  campaignKey: string;
  campaignVersion: number;
  catalogVersion: string;
  campaignTitle: string;
  description: string;
  startsAt: string;
  endsAt: string;
  campaignSkuId: string;
  skuId: string;
  title: string;
  category: SupportPackageCategory;
  amount: number;
  benefit: SupportBenefit;
  perUserLimit: number;
  completedCount: number;
  remainingPurchases: number | null;
  limitReached: boolean;
  hasActiveCheckout: boolean;
}

export interface SupportCatalog {
  catalogVersion: string;
  catalogEnabled: boolean;
  checkoutEnabled: boolean;
  grantEnabled: boolean;
  campaignsEnabled: boolean;
  previewMode?: boolean;
  packages: SupportPackage[];
  campaigns: SupportCampaignPackage[];
}

export interface EntitlementStoreState {
  authenticated: boolean;
  orderSyncAvailable: boolean;
  orderCount: number;
  totalAmount: string;
  grantedTokens: number;
  grantedStorageMb: number;
  lastPurchaseAt?: string | null;
  recentOrders: AfdianSupportOrder[];
}

export interface AfdianLeaderboardItem {
  rank: number;
  anonymous: boolean;
  displayName: string | null;
  publicId: string | null;
  totalAmount: string;
  orderCount: number;
}

export interface AfdianLeaderboard {
  scope: 'all_time';
  items: AfdianLeaderboardItem[];
  mine: AfdianLeaderboardItem | null;
  totalParticipants: number;
}

const EMPTY_STATE: AfdianSupportState = {
  authenticated: false,
  oauthAvailable: false,
  orderSyncAvailable: false,
  linked: false,
  orderCount: 0,
  totalAmount: '0.00',
  publicPreference: { participateInRanking: true, showIdentity: false, adminHidden: false },
  recentOrders: [],
};

export async function getAfdianSupportState(): Promise<AfdianSupportState> {
  const response = await apiBaseGet('/api/support/state', undefined, { silent: true });
  if (response.status !== 200 || !response.data) throw new Error('AFDIAN_SUPPORT_STATE_UNAVAILABLE');
  return { ...EMPTY_STATE, ...(response.data as Partial<AfdianSupportState>) };
}

const EMPTY_STORE_STATE: EntitlementStoreState = {
  authenticated: false,
  orderSyncAvailable: false,
  orderCount: 0,
  totalAmount: '0.00',
  grantedTokens: 0,
  grantedStorageMb: 0,
  recentOrders: [],
};

export async function getEntitlementStoreState(): Promise<EntitlementStoreState> {
  const response = await apiBaseGet('/api/support/store/state', undefined, { silent: true });
  if (response.status !== 200 || !response.data) throw new Error('ENTITLEMENT_STORE_STATE_UNAVAILABLE');
  return { ...EMPTY_STORE_STATE, ...(response.data as Partial<EntitlementStoreState>) };
}

export function createLocalSupportCatalogPreview(): SupportCatalog {
  return {
    catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
    catalogEnabled: true,
    checkoutEnabled: false,
    grantEnabled: false,
    campaignsEnabled: false,
    previewMode: true,
    packages: SUPPORT_PACKAGE_CATALOG.map((item) => ({
      skuId: item.skuId,
      category: item.category,
      firstPurchaseScope: item.firstPurchaseScope,
      amount: item.amount,
      base: { ...item.base },
      firstPurchase: { ...item.firstPurchase },
      comboSavings: item.comboSavings,
      firstPurchaseStatus: 'login_required',
    })),
    campaigns: [],
  };
}

export async function getSupportCatalog({
  allowLocalPreview = import.meta.env.DEV,
}: { allowLocalPreview?: boolean } = {}): Promise<SupportCatalog> {
  try {
    const response = await apiBaseGet('/api/support/catalog', undefined, { silent: true });
    if (response.status === 200 && response.data) {
      const catalog = response.data as SupportCatalog;
      if (!allowLocalPreview || catalog.catalogEnabled) return catalog;
    } else if (!allowLocalPreview) {
      throw new Error('SUPPORT_CATALOG_UNAVAILABLE');
    }
  } catch (error) {
    if (!allowLocalPreview) throw error;
  }
  return createLocalSupportCatalogPreview();
}

/** 新页面语义名称；后端继续复用同一套爱发电目录接口。 */
export const getEntitlementStoreCatalog = getSupportCatalog;

export async function unlinkAfdianAccount(): Promise<void> {
  const response = await apiBasePost('/api/support/afdian/oauth/unlink');
  if (response.status !== 200) throw new Error('AFDIAN_UNLINK_FAILED');
}

export async function getAfdianLeaderboard(): Promise<AfdianLeaderboard> {
  const response = await apiBaseGet('/api/support/leaderboard', undefined, { silent: true });
  if (response.status !== 200 || !response.data) throw new Error('AFDIAN_LEADERBOARD_UNAVAILABLE');
  return response.data as AfdianLeaderboard;
}

export async function updateAfdianPublicPreference(preference: {
  participateInRanking: boolean;
  showIdentity: boolean;
}): Promise<AfdianPublicPreference> {
  const response = await apiBasePost('/api/support/public-preference', preference);
  if (response.status !== 200 || !response.data) throw new Error('AFDIAN_PREFERENCE_UPDATE_FAILED');
  return response.data as AfdianPublicPreference;
}

export function afdianLeaderboardAvatarUrl(publicId: string): string {
  return `/api/support/leaderboard/avatar/${encodeURIComponent(publicId)}`;
}
