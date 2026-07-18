import { apiBasePost } from '@/http/request.ts';

export function getHelpConfig() {
  return apiBasePost('/api/common/getHelpConfig');
}

export type ResolvedHelpSource = {
  id: string;
  title: string;
  category: string;
  status: 'public' | 'internal';
  target: 'help-article' | 'public-knowledge' | 'knowledge-admin';
};

export function resolveHelpSources(titles: string[]) {
  return apiBasePost('/api/common/resolveHelpSources', { titles });
}
