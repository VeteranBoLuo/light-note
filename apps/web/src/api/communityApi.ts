import { apiBaseGet, apiBasePut } from '@/http/request';
export interface CommunityPreferences {
  defaultView: 'chat' | 'feed';
  revision: number;
  protocolVersion: number;
  availableViews: ('chat' | 'feed')[];
  feedEnabled: boolean;
}
export const getCommunityPreferences = () =>
  apiBaseGet('/api/community/preferences/me', undefined, { silent: true, timeout: 5000 });
export const saveCommunityPreferences = (defaultView: 'chat' | 'feed', expectedRevision: number) =>
  apiBasePut('/api/community/preferences/me', { defaultView, expectedRevision }, { silent: true });
