import type { CloudFolderNode } from '@/types/cloudFolder';

export type CloudFolderDropPosition = 'before' | 'inside' | 'after';
export type CloudFolderNestBlockReason = 'invalid' | 'unchanged' | 'cycle' | 'depth' | 'duplicate' | null;

export function normalizeCloudFolderNode(value: any): CloudFolderNode | null {
  const id = String(value?.id || '').trim();
  const name = String(value?.name || '').trim();
  if (!id || !name) return null;
  const parentId = value?.parentId == null || String(value.parentId).trim() === '' ? null : String(value.parentId);
  const path = Array.isArray(value?.path) ? value.path.map((item: unknown) => String(item || '')).filter(Boolean) : [];
  const childCount = Math.max(0, Number(value?.childCount || 0));
  return {
    id,
    name,
    parentId,
    depth: Math.max(1, Number(value?.depth || path.length || 1)),
    sort: Number(value?.sort || 0),
    childCount,
    directFileCount: Math.max(0, Number(value?.directFileCount || 0)),
    hasChildren: Boolean(value?.hasChildren || childCount > 0),
    path: path.length ? path : [name],
    fullPath: String(value?.fullPath || path.join(' / ') || name),
    createTime: value?.createTime ? String(value.createTime) : undefined,
  };
}

export function normalizeCloudFolderList(values: unknown): CloudFolderNode[] {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeCloudFolderNode).filter((item): item is CloudFolderNode => Boolean(item));
}

export function cloudFolderChildrenByParent(folders: CloudFolderNode[]) {
  const result = new Map<string, CloudFolderNode[]>();
  const sourceIndex = new Map(folders.map((folder, index) => [folder.id, index]));
  folders.forEach((folder) => {
    const key = folder.parentId || '';
    const siblings = result.get(key) || [];
    siblings.push(folder);
    result.set(key, siblings);
  });
  for (const siblings of result.values()) {
    siblings.sort(
      (left, right) =>
        left.sort - right.sort || Number(sourceIndex.get(left.id) || 0) - Number(sourceIndex.get(right.id) || 0),
    );
  }
  return result;
}

export function flattenCloudFolderTree(folders: CloudFolderNode[], expandedIds?: Set<string>) {
  const children = cloudFolderChildrenByParent(folders);
  const result: CloudFolderNode[] = [];
  const visited = new Set<string>();
  const visit = (parentId = '') => {
    for (const folder of children.get(parentId) || []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      result.push(folder);
      if (!expandedIds || expandedIds.has(folder.id)) visit(folder.id);
    }
  };
  visit();
  return result;
}

export function collectCloudFolderDescendantIds(folders: CloudFolderNode[], folderId: string) {
  const children = cloudFolderChildrenByParent(folders);
  const result = new Set<string>();
  const queue = [...(children.get(String(folderId)) || [])];
  while (queue.length) {
    const folder = queue.shift();
    if (!folder || result.has(folder.id)) continue;
    result.add(folder.id);
    queue.push(...(children.get(folder.id) || []));
  }
  return result;
}

export function cloudFolderAncestors(folders: CloudFolderNode[], folderId: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: CloudFolderNode[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(String(folderId)) || null;
  while (cursor && !seen.has(cursor.id)) {
    result.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return result;
}

export function cloudFolderSubtreeRelativeDepth(folders: CloudFolderNode[], folderId: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const sourceDepth = byId.get(String(folderId))?.depth || 1;
  let maximum = 0;
  for (const id of collectCloudFolderDescendantIds(folders, folderId)) {
    maximum = Math.max(maximum, (byId.get(id)?.depth || sourceDepth) - sourceDepth);
  }
  return maximum;
}

export function resolveCloudFolderDropPosition(
  _source: CloudFolderNode,
  _target: CloudFolderNode,
  pointerRatio: number,
): CloudFolderDropPosition {
  const numericRatio = Number(pointerRatio);
  const ratio = Number.isFinite(numericRatio) ? Math.max(0, Math.min(1, numericRatio)) : 0.5;
  if (ratio < 0.28) return 'before';
  if (ratio > 0.72) return 'after';
  return 'inside';
}

export function cloudFolderDropBlockReason(
  folders: CloudFolderNode[],
  sourceId: string,
  parentId: string | null,
  maxDepth: number,
  anchorId: string | null = null,
  position: Exclude<CloudFolderDropPosition, 'inside'> | null = null,
): CloudFolderNestBlockReason {
  const source = folders.find((folder) => folder.id === String(sourceId));
  const normalizedParentId = parentId == null || String(parentId).trim() === '' ? null : String(parentId);
  const parent = normalizedParentId ? folders.find((folder) => folder.id === normalizedParentId) : null;
  if (!source || (normalizedParentId && !parent)) return 'invalid';
  if ((anchorId == null) !== (position == null)) return 'invalid';

  const descendants = collectCloudFolderDescendantIds(folders, source.id);
  if (normalizedParentId === source.id || (normalizedParentId && descendants.has(normalizedParentId))) return 'cycle';
  if (source.parentId === normalizedParentId && anchorId == null) return 'unchanged';

  const targetParentDepth = parent?.depth || 0;
  if (targetParentDepth + 1 + cloudFolderSubtreeRelativeDepth(folders, source.id) > maxDepth) return 'depth';

  const duplicate = folders.some(
    (folder) =>
      folder.id !== source.id &&
      folder.parentId === normalizedParentId &&
      folder.name.normalize('NFC').localeCompare(source.name.normalize('NFC'), 'zh-CN', {
        sensitivity: 'base',
        usage: 'search',
      }) === 0,
  );
  if (duplicate) return 'duplicate';

  if (anchorId != null) {
    const anchor = folders.find((folder) => folder.id === String(anchorId));
    if (!anchor || anchor.id === source.id || anchor.parentId !== normalizedParentId) return 'invalid';
    if (source.parentId === normalizedParentId) {
      const siblings = cloudFolderChildrenByParent(folders).get(normalizedParentId || '') || [];
      const sourceIndex = siblings.findIndex((folder) => folder.id === source.id);
      const anchorIndex = siblings.findIndex((folder) => folder.id === anchor.id);
      if (
        sourceIndex >= 0 &&
        anchorIndex >= 0 &&
        ((position === 'before' && sourceIndex === anchorIndex - 1) ||
          (position === 'after' && sourceIndex === anchorIndex + 1))
      ) {
        return 'unchanged';
      }
    }
  }
  return null;
}

export function cloudFolderNestBlockReason(
  folders: CloudFolderNode[],
  sourceId: string,
  targetId: string,
  maxDepth: number,
): CloudFolderNestBlockReason {
  const target = folders.find((folder) => folder.id === String(targetId));
  if (!target) return 'invalid';
  return cloudFolderDropBlockReason(folders, sourceId, target.id, maxDepth);
}
