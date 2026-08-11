import { bookmarkStore } from '@/store';

const NOTE_IMAGE_VIEWER_OPTIONS = {
  navbar: false,
  toolbar: true,
  title: false,
  // BViewer 的默认 viewed 会把图片限制到 200px，笔记正文需要交给 viewer.js
  // 按视口适配，并保留工具栏继续缩放小图。
  viewed: () => {},
};

export function resolveNoteContentImage(target: EventTarget | null): HTMLImageElement | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  return target.closest<HTMLImageElement>('img');
}

export function openNoteContentImagePreview(source: string | HTMLImageElement): boolean {
  const src =
    typeof source === 'string'
      ? source.trim()
      : String(source.currentSrc || source.getAttribute('src') || '').trim();
  if (!src) return false;
  bookmarkStore().refreshViewer(src, NOTE_IMAGE_VIEWER_OPTIONS);
  return true;
}

export function handleNoteContentImagePreviewEvent(event: MouseEvent | KeyboardEvent): boolean {
  if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return false;
  const image = resolveNoteContentImage(event.target);
  if (!image || !openNoteContentImagePreview(image)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function prepareNoteContentPreviewImages(container: HTMLElement | null, accessibleLabel: string): void {
  if (!container) return;
  container.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', accessibleLabel);
  });
}
