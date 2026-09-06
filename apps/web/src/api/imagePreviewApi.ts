import { apiBasePost } from '@/http/request';
export type ImagePreviewSource = 'cloud' | 'chat';
export type ImagePreviewStrategy = 'image_thumbnail' | 'image_display';
export interface ImagePreviewState {
  id: string;
  strategy?: ImagePreviewStrategy;
  status: 'missing' | 'queued' | 'processing' | 'ready' | 'failed';
  mode?: 'source' | 'derived';
  previewUrl?: string;
  expiresIn?: number;
  width?: number;
  height?: number;
  animated?: boolean;
  errorCode?: string;
}
export const imagePreviewsEnabled = (source: ImagePreviewSource) =>
  String(
    source === 'chat'
      ? import.meta.env.VITE_CHAT_IMAGE_PREVIEWS_ENABLED
      : import.meta.env.VITE_CLOUD_IMAGE_PREVIEWS_ENABLED,
  ) !== 'false';
export async function fetchImagePreviews(
  source: ImagePreviewSource,
  ids: string[],
  strategy: ImagePreviewStrategy,
  prepare = false,
  retry = false,
) {
  const prefix = source === 'chat' ? '/api/community-chat' : '/api/file';
  const response = await apiBasePost(
    `${prefix}/image-previews/${prepare ? 'prepare' : 'resolve'}`,
    { ids, strategy, retry },
    { silent: true },
  );
  if (response.status !== 200) throw new Error('IMAGE_PREVIEW_UNAVAILABLE');
  return response.data as { enabled: boolean; items: ImagePreviewState[] };
}
// 无内容占位，不包含原件 URL，邻图预加载不会绕过派生策略。
export const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
