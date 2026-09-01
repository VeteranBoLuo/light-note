import type { CloudFolderNode } from '@/types/cloudFolder';

/**
 * 全局上传只有在用户正浏览云空间文件夹时继承该筛选；其它入口一律回到根级“全部文件”。
 * 文件夹已被删除或尚未出现在权威列表时也回退根级，避免把上传交给失效 ID。
 */
export function resolveMobileUploadDefaultFolderId(
  routeName: unknown,
  currentFolderId: unknown,
  folders: readonly CloudFolderNode[],
): string | null {
  if (String(routeName || '') !== 'cloudSpace') return null;
  const folderId = String(currentFolderId || '').trim();
  if (!folderId || folderId === 'all') return null;
  return folders.some((folder) => folder.id === folderId) ? folderId : null;
}
