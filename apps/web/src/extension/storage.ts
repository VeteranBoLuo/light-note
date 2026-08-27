import type { BookmarkDraft, ExtensionSession, NoteDraft } from './types';

const STORAGE_KEYS = Object.freeze({
  session: 'lightNoteExtensionSession',
  deviceId: 'lightNoteExtensionDeviceId',
  theme: 'lightNoteExtensionTheme',
  bookmarkDraft: 'lightNoteBookmarkDraft',
  noteDraft: 'lightNoteNoteDraft',
});

async function readLocal<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? null;
}

async function writeLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export function getExtensionSession(): Promise<ExtensionSession | null> {
  return readLocal<ExtensionSession>(STORAGE_KEYS.session);
}

export function saveExtensionSession(session: ExtensionSession): Promise<void> {
  return writeLocal(STORAGE_KEYS.session, session);
}

export async function clearExtensionSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.session);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await readLocal<string>(STORAGE_KEYS.deviceId);
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  await writeLocal(STORAGE_KEYS.deviceId, deviceId);
  return deviceId;
}

export function getExtensionTheme(): Promise<'day' | 'night' | null> {
  return readLocal<'day' | 'night'>(STORAGE_KEYS.theme);
}

export function saveExtensionTheme(theme: 'day' | 'night'): Promise<void> {
  return writeLocal(STORAGE_KEYS.theme, theme);
}

export function getBookmarkDraft(): Promise<BookmarkDraft | null> {
  return readLocal<BookmarkDraft>(STORAGE_KEYS.bookmarkDraft);
}

export function saveBookmarkDraft(draft: BookmarkDraft): Promise<void> {
  return writeLocal(STORAGE_KEYS.bookmarkDraft, draft);
}

export function clearBookmarkDraft(): Promise<void> {
  return chrome.storage.local.remove(STORAGE_KEYS.bookmarkDraft);
}

export function getNoteDraft(): Promise<NoteDraft | null> {
  return readLocal<NoteDraft>(STORAGE_KEYS.noteDraft);
}

export function saveNoteDraft(draft: NoteDraft): Promise<void> {
  return writeLocal(STORAGE_KEYS.noteDraft, draft);
}

export function clearNoteDraft(): Promise<void> {
  return chrome.storage.local.remove(STORAGE_KEYS.noteDraft);
}

export const extensionStorageKeys = STORAGE_KEYS;
