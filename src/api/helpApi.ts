import { apiBasePost } from '@/http/request.ts';

export function getHelpConfig() {
  return apiBasePost('/api/common/getHelpConfig');
}

export function getHelpDraftConfig() {
  return apiBasePost('/api/common/getHelpDraftConfig');
}

export function saveHelpDraft(data: { id?: string; title: string; content: string }) {
  return apiBasePost('/api/common/saveHelpDraft', data);
}

export function saveHelpDraftBatch(items: Array<{ id: string; title: string; content: string; sort?: number }>) {
  return apiBasePost('/api/common/saveHelpDraftBatch', { items });
}

export function syncHelpDraftFromPublished() {
  return apiBasePost('/api/common/syncHelpDraftFromPublished');
}

export function publishAllHelpDraft() {
  return apiBasePost('/api/common/publishAllHelpDraft');
}

export function deleteHelpDraft(id: string) {
  return apiBasePost('/api/common/deleteHelpDraft', { id });
}
