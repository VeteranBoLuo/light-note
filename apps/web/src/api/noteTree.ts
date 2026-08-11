import { apiBasePost } from '@/http/request';
import type { NoteTreeItem, NoteTreeQueryResult } from '@/types/noteTree';

export type NoteTreeFeatureName =
  | 'note_tree_read'
  | 'note_tree_write'
  | 'note_tree_mobile'
  | 'note_tree_subtree_trash'
  | 'ai_note_branch_scope'
  | 'ai_note_branch_analysis';

export type NoteTreeFeatures = Record<NoteTreeFeatureName, boolean>;

const NOTE_TREE_FEATURE_RESPONSE_KEYS = Object.freeze({
  note_tree_read: 'noteTreeRead',
  note_tree_write: 'noteTreeWrite',
  note_tree_mobile: 'noteTreeMobile',
  note_tree_subtree_trash: 'noteTreeSubtreeTrash',
  ai_note_branch_scope: 'aiNoteBranchScope',
  ai_note_branch_analysis: 'aiNoteBranchAnalysis',
} satisfies Record<NoteTreeFeatureName, string>);

export const DISABLED_NOTE_TREE_FEATURES: NoteTreeFeatures = Object.freeze({
  note_tree_read: false,
  note_tree_write: false,
  note_tree_mobile: false,
  note_tree_subtree_trash: false,
  ai_note_branch_scope: false,
  ai_note_branch_analysis: false,
});

export function normalizeNoteTreeFeatures(raw: Record<string, unknown> | null | undefined): NoteTreeFeatures {
  return Object.fromEntries(
    (Object.keys(DISABLED_NOTE_TREE_FEATURES) as NoteTreeFeatureName[]).map((key) => [
      key,
      raw?.[NOTE_TREE_FEATURE_RESPONSE_KEYS[key]] === true || raw?.[key] === true,
    ]),
  ) as NoteTreeFeatures;
}

export async function fetchNoteTreeFeatures(): Promise<NoteTreeFeatures> {
  const response = await apiBasePost('/api/note/getNoteTreeFeatures', {}, { silent: true });
  if (response.status !== 200 || !response.data?.features) {
    throw new Error(String(response.data?.code || 'NOTE_TREE_FEATURES_UNAVAILABLE'));
  }
  return normalizeNoteTreeFeatures(response.data.features as Record<string, unknown>);
}

export interface NoteDeletePreview {
  id: string;
  descendantIds: string[];
  descendantCount: number;
  totalCount: number;
}

function collectTreeIds(items: NoteTreeItem[], visited = new Set<string>()) {
  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id || '').trim();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    collectTreeIds(item.children || [], visited);
  }
  return visited;
}

export async function fetchNoteDeletePreview(noteId: string): Promise<NoteDeletePreview> {
  const id = String(noteId || '').trim();
  if (!id) throw new Error('NOTE_TREE_NODE_ID_REQUIRED');
  const response = await apiBasePost('/api/note/queryNoteTree', { parentId: id, depth: 'all' }, { silent: true });
  if (response.status !== 200) throw new Error(String(response.data?.code || 'NOTE_TREE_LOAD_FAILED'));
  const payload = (response.data || {}) as NoteTreeQueryResult;
  const descendantIds = [...collectTreeIds(payload.items || [])];
  return {
    id,
    descendantIds,
    descendantCount: descendantIds.length,
    totalCount: descendantIds.length + 1,
  };
}

export function collapseNoteDeletePreviews(previews: NoteDeletePreview[]) {
  const normalized = [
    ...new Map(previews.filter((preview) => preview?.id).map((preview) => [preview.id, preview])).values(),
  ];
  const selectedIds = new Set(normalized.map((preview) => preview.id));
  const nestedSelectedIds = new Set<string>();
  for (const preview of normalized) {
    for (const descendantId of preview.descendantIds) {
      if (selectedIds.has(descendantId)) nestedSelectedIds.add(descendantId);
    }
  }
  const items = normalized.filter((preview) => !nestedSelectedIds.has(preview.id));
  const affectedIds = new Set<string>();
  for (const item of items) {
    affectedIds.add(item.id);
    item.descendantIds.forEach((id) => affectedIds.add(id));
  }
  return { items, totalCount: affectedIds.size };
}
