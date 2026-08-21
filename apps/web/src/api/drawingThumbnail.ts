import { apiBaseHead, apiBasePost } from '@/http/request';
import { createDrawingThumbnailDataUrl } from '@/utils/drawingThumbnail';
import { DRAWING_THUMBNAIL_RENDERER_VERSION } from '@lightnote/shared/drawing-note';

export function drawingThumbnailUrl(noteId: string, revision?: number | null) {
  const id = String(noteId || '').trim();
  const normalizedRevision = Math.max(0, Math.trunc(Number(revision) || 0));
  if (!id || normalizedRevision < 1) return '';
  return `/api/note/drawing-thumbnail/${encodeURIComponent(id)}/v${DRAWING_THUMBNAIL_RENDERER_VERSION}-${normalizedRevision}.webp`;
}

export async function uploadDrawingThumbnail(noteId: string, revision: number, content: string) {
  const thumbnail = createDrawingThumbnailDataUrl(content);
  if (!thumbnail) return false;
  const response = await apiBasePost(
    '/api/note/uploadDrawingThumbnail',
    { id: noteId, revision, rendererVersion: DRAWING_THUMBNAIL_RENDERER_VERSION, thumbnail },
    { silent: true, feedback: false },
  );
  return response?.status === 200;
}

const ensureTasks = new Map<string, Promise<boolean>>();

/** 旧笔记打开时只探测一次；缺图才从已经加载的完整 scene 补传，不修改正文或 revision。 */
export function ensureDrawingThumbnail(noteId: string, revision: number, content: string) {
  const url = drawingThumbnailUrl(noteId, revision);
  if (!url || !content) return Promise.resolve(false);
  const key = `${noteId}:${revision}:v${DRAWING_THUMBNAIL_RENDERER_VERSION}`;
  const existing = ensureTasks.get(key);
  if (existing) return existing;
  const task = (async () => {
    try {
      if ((await apiBaseHead(url, undefined, { silent: true, feedback: false })) === 200) return true;
    } catch (error: any) {
      const status = Number(error?.status || error?.response?.status || 0);
      if (status !== 404) return false;
    }
    try {
      return await uploadDrawingThumbnail(noteId, revision, content);
    } catch {
      return false;
    }
  })();
  ensureTasks.set(key, task);
  void task.then((ok) => {
    if (!ok) ensureTasks.delete(key);
  });
  return task;
}
