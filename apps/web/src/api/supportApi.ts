import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import { apiBaseGet, apiBasePost } from '@/http/request';

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
export type FirstPurchaseStatus = 'available' | 'used' | 'login_required' | 'not_applicable';
export type SupportFirstPurchaseScope = 'ai_account' | 'sku' | 'none';

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
  checkoutAvailable?: boolean;
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
  checkoutAvailable?: boolean;
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

export async function getEntitlementOrders(page: number) {
  const response = await apiBaseGet('/api/support/store/orders', { page }, { silent: true });
  if (response.status !== 200 || !response.data) throw new Error('SUPPORT_ORDERS_UNAVAILABLE');
  return response.data as { items: AfdianSupportOrder[]; total: number; page: number; pageSize: number };
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
      firstPurchaseStatus: item.firstPurchaseScope === 'none' ? 'not_applicable' : 'login_required',
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
      if (!allowLocalPreview || (catalog.catalogEnabled && catalog.catalogVersion === SUPPORT_PACKAGE_CATALOG_VERSION))
        return catalog;
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

export interface CampaignPresentation {
  campaignKey: string;
  campaignVersion: number;
  title: string;
  description: string;
  serverNow: string;
  startsAt: string;
  endsAt: string;
  lifecycle: 'upcoming' | 'active' | 'paused' | 'ended';
  checkoutEnabled: boolean;
  themeKey: 'autumn-desk-v1';
  packages?: SupportCampaignPackage[];
}
export interface CheckoutStatus {
  intentId: string;
  status: 'pending' | 'processing' | 'credited' | 'expired' | 'review';
  expiresAt: string;
  amount: number;
  benefit: SupportBenefit;
}
export async function getCampaignEntry(): Promise<CampaignPresentation | null> {
  const response = await apiBaseGet('/api/support/campaign-entry', undefined, { silent: true });
  if (response.status !== 200) throw new Error('CAMPAIGN_ENTRY_FAILED');
  return response.data as CampaignPresentation | null;
}
export async function getCampaignPresentation(key: string): Promise<CampaignPresentation> {
  const response = await apiBaseGet(`/api/support/campaigns/${encodeURIComponent(key)}`, undefined, { silent: true });
  if (response.status !== 200 || !response.data)
    throw new Error(response.status === 404 ? 'CAMPAIGN_HIDDEN' : 'CAMPAIGN_FAILED');
  return response.data as CampaignPresentation;
}
export async function createCheckoutIntent(
  skuId: string,
  catalogVersion: string,
  flowId?: string,
): Promise<{ intentId: string; url: string }> {
  const response = await apiBasePost('/api/support/checkout-intents', { skuId, catalogVersion, flowId });
  if (response.status !== 200 || !response.data) throw new Error('CHECKOUT_FAILED');
  return response.data as { intentId: string; url: string };
}
export async function queryCheckoutIntent(id: string): Promise<CheckoutStatus> {
  const response = await apiBaseGet(`/api/support/checkout-intents/${encodeURIComponent(id)}`, undefined, {
    silent: true,
  });
  if (response.status !== 200 || !response.data) throw new Error('CHECKOUT_QUERY_FAILED');
  return response.data as CheckoutStatus;
}
