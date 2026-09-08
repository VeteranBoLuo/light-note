import { apiBasePost } from '@/http/request';
import type { ImagePreviewSource, ImagePreviewState } from '@lightnote/shared';
export type { ImagePreviewSource, ImagePreviewState } from '@lightnote/shared';
export async function resolveImagePreviews(items: ImagePreviewSource[]): Promise<ImagePreviewState[]> {
  const r = await apiBasePost('/api/image-previews/resolve', { items }, { silent: true, timeout: 10000 });
  if (r.status !== 200 || !Array.isArray(r.data)) throw new Error('IMAGE_PREVIEW_UNAVAILABLE');
  return r.data;
}
