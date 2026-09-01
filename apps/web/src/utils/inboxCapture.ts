import { resolveBookmarkUrlInput } from '@lightnote/shared';
import { isMobileResourceInboxTab } from '@/config/mobileNavigation';

export type InboxCaptureType = 'bookmark' | 'note' | 'file';
export type QuickCaptureType = InboxCaptureType | 'todo';

type QuickCaptureRefreshTarget = {
  refreshList: () => Promise<unknown>;
  refreshCount: () => Promise<unknown>;
};

const RESOURCE_CAPTURE_TYPES: readonly InboxCaptureType[] = ['bookmark', 'note', 'file'];
const ALL_CAPTURE_TYPES: readonly QuickCaptureType[] = [...RESOURCE_CAPTURE_TYPES, 'todo'];

export function getAvailableQuickCaptureTypes(_isMobile: boolean): readonly QuickCaptureType[] {
  return ALL_CAPTURE_TYPES;
}

export function normalizeQuickCaptureType(type: QuickCaptureType, _isMobile: boolean): QuickCaptureType {
  return type;
}

export function getQuickCaptureInboxTarget(type: QuickCaptureType, _isMobile: boolean) {
  if (type === 'todo') return { path: '/inbox' as const, query: { tab: 'todo' as const } };
  return { path: '/organize' as const, query: { issue: 'pending' as const } };
}

export function isQuickCaptureWorkspaceActive(
  type: QuickCaptureType,
  path: string,
  query: Record<string, unknown> = {},
) {
  if (type === 'todo') {
    return path === '/inbox' && !isMobileResourceInboxTab(query.tab);
  }
  return (
    (path === '/organize' && String(query.issue || 'overview') === 'pending') ||
    (path === '/inbox' && isMobileResourceInboxTab(query.tab))
  );
}

export async function refreshQuickCaptureStores(
  type: QuickCaptureType,
  isInboxRoute: boolean,
  inbox: QuickCaptureRefreshTarget,
  todo: QuickCaptureRefreshTarget,
) {
  if (!isInboxRoute) {
    await Promise.all([inbox.refreshCount(), todo.refreshCount()]);
    return;
  }
  if (type === 'todo') {
    await Promise.all([inbox.refreshCount(), todo.refreshList()]);
    return;
  }
  await Promise.all([inbox.refreshList(), todo.refreshCount()]);
}

export function normalizeCaptureUrl(input: string): URL | null {
  const resolution = resolveBookmarkUrlInput(input, { allowTextExtraction: false });
  if (!resolution.canonicalUrl) return null;
  try {
    return new URL(resolution.canonicalUrl);
  } catch {
    return null;
  }
}

export function hasCaptureBookmarkCandidate(input: string): boolean {
  return resolveBookmarkUrlInput(input, { allowTextExtraction: true }).state !== 'invalid';
}

export function detectInboxCaptureType(input: string, files: File[] | ArrayLike<File> = []): InboxCaptureType {
  if (files.length > 0) return 'file';
  return hasCaptureBookmarkCandidate(input) ? 'bookmark' : 'note';
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
