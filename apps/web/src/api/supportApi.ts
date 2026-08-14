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
  ownershipSource: string;
  confirmedAt: string | null;
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
