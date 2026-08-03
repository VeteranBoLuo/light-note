import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router';
import type { ResourceRef } from '@/utils/noteResourceRefs';

export interface ReferencedFilePreviewInfo {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  category?: string;
}

/**
 * 跳出笔记查看被引用资源前，把当前引用写进原历史项。
 * 用户返回笔记并重新挂载编辑器后，可复用既有 focusRef 能力定位到刚才的引用。
 */
export function buildNoteReturnFocusLocation(
  route: RouteLocationNormalizedLoaded,
  ref: ResourceRef,
): RouteLocationRaw | null {
  if (String(route.name || '') !== 'noteDetail') return null;
  const focusRef = `${ref.type}:${ref.id}`;
  if (String(route.query.focusRef || '') === focusRef) return null;
  return {
    name: route.name,
    params: route.params,
    query: { ...route.query, focusRef },
    hash: route.hash,
  };
}

/** 云文件详情接口同时兼容历史 snake_case 字段，统一成 FilePreview 的输入结构。 */
export function normalizeReferencedFilePreviewInfo(
  value: unknown,
  fallback: Pick<ResourceRef, 'id'>,
): ReferencedFilePreviewInfo | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id || fallback.id || '').trim();
  if (!id) return null;
  const fileName = String(raw.fileName || raw.file_name || '').trim();
  const fileType = String(raw.fileType || raw.file_type || '').trim();
  const fileUrl = String(raw.fileUrl || raw.file_url || '').trim();
  const category = String(raw.category || '').trim();
  return {
    id,
    fileName,
    fileType,
    ...(fileUrl ? { fileUrl } : {}),
    ...(category ? { category } : {}),
  };
}
