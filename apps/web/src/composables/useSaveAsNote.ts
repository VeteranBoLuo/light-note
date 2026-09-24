import { shallowRef } from 'vue';
import { useUserStore } from '@/store';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';

export interface SaveAsNoteOptions {
  saveFormat?: 'translationOnly' | 'bilingual';
  title: string;
  parentId: string | null;
  tags: string[];
  projectId: string;
  thoughts: string;
}
export interface SaveAsNoteResult {
  noteId: string;
  openAfterSave: boolean;
}
export interface SaveAsNoteRequest {
  sourceKey: string;
  title: string;
  type: 'markdown' | 'html';
  description?: string;
  notice?: string;
  projectId?: string;
  personalThoughts?: boolean;
  saveFormat?: 'translationOnly' | 'bilingual';
  isCurrent?: () => boolean;
  lookup?: () => Promise<{ noteId: string; unavailable?: boolean } | null>;
  save: (options: Readonly<SaveAsNoteOptions>) => Promise<{ noteId: string }>;
}
export interface SaveAsNoteSession {
  request: SaveAsNoteRequest;
  owner: string;
  resolve: (result: SaveAsNoteResult | null) => void;
}
export const saveAsNoteSession = shallowRef<SaveAsNoteSession | null>(null);
export function openSaveAsNote(request: SaveAsNoteRequest): Promise<SaveAsNoteResult | null> {
  const user = useUserStore();
  if (!user.id || user.role === 'visitor' || user.adminContext || saveAsNoteSession.value) return Promise.resolve(null);
  return new Promise((resolve) => {
    saveAsNoteSession.value = { request, owner: buildNoteDetailRequestScope(user), resolve };
  });
}
export function closeSaveAsNote(result: SaveAsNoteResult | null = null) {
  const session = saveAsNoteSession.value;
  saveAsNoteSession.value = null;
  session?.resolve(result);
}
