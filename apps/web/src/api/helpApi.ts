import { apiBasePost } from '@/http/request.ts';

export function getHelpConfig() {
  return apiBasePost('/api/common/getHelpConfig');
}

export function resolveHelpSources(titles: string[]) {
  return apiBasePost('/api/common/resolveHelpSources', { titles });
}
