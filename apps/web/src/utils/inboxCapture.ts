export type InboxCaptureType = 'bookmark' | 'note' | 'file';

export function normalizeCaptureUrl(input: string): URL | null {
  let value = String(input || '').trim();
  if (value && !/^[a-z][a-z\d+.-]*:\/\//i.test(value) && /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) {
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
  const lines = content.split(/\r?\n/);
  const cleanTitleLine = (line: string) => {
    const value = line.trim();
    if (
      !value ||
      /^(?:`{3,}|~{3,}|[-*_]{3,})\s*$/.test(value) ||
      /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(value) ||
      /^https?:\/\/\S+$/i.test(value)
    ) {
      return '';
    }
    return value
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*(?:>\s*)?(?:[-+*]|\d+[.)])\s+/, '')
      .replace(/^\[[ xX]\]\s+/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  };
  const headingLine = lines.find((line) => /^\s*#{1,6}\s+\S/.test(line));
  const title = cleanTitleLine(headingLine || '') || lines.map(cleanTitleLine).find(Boolean) || untitled;
  return { title, content, type: 'markdown' as const };
}

export function buildCaptureFileMeta(files: File[]) {
  return files.map((file) => ({
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  }));
}
