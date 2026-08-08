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
  globalSearch: { key: 'f', primaryModifier: true },
  aiAssistant: { key: '/', primaryModifier: true },
};

const SHORTCUT_ALIASES: Partial<Record<GlobalShortcutId, Array<{ key: string; primaryModifier: boolean }>>> = {
  globalSearch: [{ key: '/', primaryModifier: false }],
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
  const keyLabel = definition.key.length === 1 ? definition.key.toUpperCase() : definition.key;
  if (!definition.primaryModifier) return [keyLabel];
  return [platform === 'mac' ? '⌘' : 'Ctrl', keyLabel];
}

export function getGlobalShortcutLabel(
  id: GlobalShortcutId,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string {
  return getGlobalShortcutKeys(id, platform).join(' + ');
}

export function matchesGlobalShortcut(event: ShortcutKeyboardEvent, id: GlobalShortcutId): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
  if (event.altKey) return false;
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const pressedKey = event.key.toLowerCase();
  return [SHORTCUT_DEFINITIONS[id], ...(SHORTCUT_ALIASES[id] || [])].some(
    (definition) =>
      pressedKey === definition.key &&
      (definition.primaryModifier ? hasPrimaryModifier : !hasPrimaryModifier),
  );
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
