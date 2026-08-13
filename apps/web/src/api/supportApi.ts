import { apiBaseGet, apiBasePost } from '@/http/request';

export interface AfdianSupportState {
  authenticated: boolean;
  oauthAvailable: boolean;
  orderSyncAvailable: boolean;
  linked: boolean;
  linkedAt?: string | null;
  orderCount: number;
  totalAmount: string;
}

const EMPTY_STATE: AfdianSupportState = {
  authenticated: false,
  oauthAvailable: false,
  orderSyncAvailable: false,
  linked: false,
  orderCount: 0,
  totalAmount: '0.00',
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
