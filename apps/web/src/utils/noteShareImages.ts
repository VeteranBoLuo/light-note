const MANAGED_UPLOAD_ORIGINS = new Set(['https://boluo66.top', 'http://boluo66.top']);
const NOTE_IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif)$/iu;

function managedPhotoName(value: string) {
  try {
    const image = new URL(value, window.location.origin);
    if (image.origin !== window.location.origin && !MANAGED_UPLOAD_ORIGINS.has(image.origin)) return '';
    const path = decodeURIComponent(image.pathname);
    if (!path.startsWith('/uploads/')) return '';
    const name = path.slice('/uploads/'.length);
    if (/[\\/]/u.test(name) || /^bookmark-/iu.test(name) || !NOTE_IMAGE_EXTENSION.test(name)) return '';
    return name;
  } catch {
    return '';
  }
}

export function bindSharedNoteImages(html: string, shareId: string, noteId: string) {
  if (!html || !shareId || !noteId || !/\/uploads\//i.test(html)) return html;
  // The template stays inert until the display URLs have been replaced.
  const template = document.createElement('template');
  template.innerHTML = html;
  const path = '/api/note/share/image/' + encodeURIComponent(shareId) + '/' + encodeURIComponent(noteId) + '/';
  for (const img of template.content.querySelectorAll('img[src]')) {
    const fileName = managedPhotoName(img.getAttribute('src') || '');
    if (!fileName) continue;
    img.setAttribute('src', path + encodeURIComponent(fileName));
    img.setAttribute('loading', 'lazy');
    img.removeAttribute('srcset');
    for (const pictureSource of img.closest('picture')?.querySelectorAll('source') || []) pictureSource.remove();
  }
  return template.innerHTML;
}
