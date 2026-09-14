import { copyTextToClipboard } from '@/utils/clipboard';

const STORAGE_KEY = 'light-note:file-share-owner-links';
type SavedLinks = Record<string, { token: string; tokenHint: string }>;

function readLinks(): SavedLinks {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function rememberFileShareToken(id: string, token: string, tokenHint: string) {
  if (!id || !token || !tokenHint) return;
  try {
    const links = readLinks();
    delete links[id];
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...Object.fromEntries(Object.entries(links).slice(-29)), [id]: { token, tokenHint } }),
    );
  } catch {
    // 禁用存储时仍通过本次生成的链接提供手动复制。
  }
}

export function readFileShareToken(id: string, tokenHint: string) {
  const saved = readLinks()[id];
  return saved?.tokenHint === tokenHint ? saved.token : '';
}

export function forgetFileShareToken(id: string) {
  try {
    const links = readLinks();
    delete links[id];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {}
}

export function buildFileShareUrl(token: string) {
  return `${window.location.origin}/share/${encodeURIComponent(token)}`;
}

export async function copyFileShareUrl(token: string) {
  return copyTextToClipboard(buildFileShareUrl(token));
}
