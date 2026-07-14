export type InboxCaptureType = 'bookmark' | 'note' | 'file';

export function normalizeCaptureUrl(input: string): URL | null {
  let value = String(input || '').trim();
  if (
    value &&
    !/^[a-z][a-z\d+.-]*:\/\//i.test(value) &&
    /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)
  ) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function detectInboxCaptureType(input: string, files: File[] | ArrayLike<File> = []): InboxCaptureType {
  if (files.length > 0) return 'file';
  return normalizeCaptureUrl(input) ? 'bookmark' : 'note';
}

export function buildMarkdownNotePayload(input: string, untitled: string) {
  const content = String(input || '');
  const firstLine = content.split(/\r?\n/).find((line) => line.trim()) || untitled;
  const title =
    firstLine
      .replace(/^#{1,6}\s*/, '')
      .replace(/[*_`~\[\]()>]/g, '')
      .trim()
      .slice(0, 100) || untitled;
  return { title, content, type: 'markdown' as const };
}

export function buildCaptureFileMeta(files: File[]) {
  return files.map((file) => ({
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  }));
}
