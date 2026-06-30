import { apiBasePost } from '@/http/request.ts';

export function getHelpConfig() {
  return apiBasePost('/api/common/getHelpConfig');
}
