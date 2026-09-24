import { useUserStore } from '@/store';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
let pending: { owner: string; text: string; title: string } | null = null;
export function stageTranslation(text: string, title: string) {
  pending = { owner: buildNoteDetailRequestScope(useUserStore()), text, title };
}
export function takeTranslation() {
  const value = pending;
  pending = null;
  return value?.owner === buildNoteDetailRequestScope(useUserStore()) ? value : null;
}
export function clearTranslationHandoff() {
  pending = null;
}
