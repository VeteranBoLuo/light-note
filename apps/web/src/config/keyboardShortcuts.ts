export const GLOBAL_SHORTCUT_IDS = ['globalSearch', 'aiAssistant'] as const;

export type GlobalShortcutId = (typeof GLOBAL_SHORTCUT_IDS)[number];
export type ShortcutPlatform = 'mac' | 'other';

export interface ShortcutKeyboardEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  keyCode: number;
}

const SHORTCUT_DEFINITIONS: Record<GlobalShortcutId, { key: string; primaryModifier: boolean }> = {
  globalSearch: { key: '/', primaryModifier: false },
  aiAssistant: { key: '/', primaryModifier: true },
};

export function getShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const browserNavigator = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = browserNavigator.userAgentData?.platform || browserNavigator.platform || browserNavigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform) ? 'mac' : 'other';
}

export function getGlobalShortcutKeys(
  id: GlobalShortcutId,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string[] {
  const definition = SHORTCUT_DEFINITIONS[id];
  if (!definition.primaryModifier) return [definition.key];
  return [platform === 'mac' ? '⌘' : 'Ctrl', definition.key];
}

export function getGlobalShortcutLabel(
  id: GlobalShortcutId,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string {
  return getGlobalShortcutKeys(id, platform).join(' + ');
}

export function matchesGlobalShortcut(event: ShortcutKeyboardEvent, id: GlobalShortcutId): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;

  const definition = SHORTCUT_DEFINITIONS[id];
  if (event.key !== definition.key || event.altKey) return false;

  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  return definition.primaryModifier ? hasPrimaryModifier : !hasPrimaryModifier;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => Element | null;
  };
  const tagName = String(element.tagName || '').toUpperCase();
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || element.isContentEditable) return true;
  return Boolean(element.closest?.('[contenteditable="true"], [contenteditable="plaintext-only"]'));
}
