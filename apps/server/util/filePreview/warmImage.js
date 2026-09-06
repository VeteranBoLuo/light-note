import { prepareFilePreview } from './service.js';
import { imagePreviewsEnabled } from './image.js';
// 主事务成功后的可重建缓存；生成失败由可见区域的按需准备兜底。
export function warmImagePreview(ownerUserId, fileId, sourceType = 'cloud_file') {
  if (!fileId || !imagePreviewsEnabled(sourceType)) return;
  void prepareFilePreview({ ownerUserId, fileId, sourceType, strategy: 'image_thumbnail' }).catch(() => undefined);
}
