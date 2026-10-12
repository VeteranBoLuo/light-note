import { useUserStore } from '@/store';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
let pending: { owner: string; resources: ToolboxSelectedResource[] } | null = null;
export function stageExtraction(resources: readonly ToolboxSelectedResource[]) {
  if (
    !resources.length ||
    resources.length > 20 ||
    resources.some((r) => !['note', 'bookmark', 'file'].includes(r.type))
  )
    throw new Error('EXTRACTION_SELECTION_INVALID');
  pending = {
    owner: buildNoteDetailRequestScope(useUserStore()),
    resources: resources.map(({ type, id, title }) => ({ type, id, title })),
  };
}
export function takeExtraction() {
  const value = pending;
  pending = null;
  return value?.owner === buildNoteDetailRequestScope(useUserStore()) ? value.resources : null;
}
