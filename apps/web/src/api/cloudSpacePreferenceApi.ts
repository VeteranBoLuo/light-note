import { apiBaseGet, apiBasePost } from '@/http/request';

export const getCloudSpacePreference = () =>
  apiBaseGet('/api/file/preferences', undefined, { silent: true, timeout: 5000 });
export const saveCloudSpacePreference = (includeDescendants: boolean) =>
  apiBasePost('/api/file/preferences', { includeDescendants }, { silent: true });
