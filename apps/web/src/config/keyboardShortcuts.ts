export const GLOBAL_SHORTCUT_IDS = ['globalSearch', 'aiAssistant'] as const;

export type GlobalShortcutId = (typeof GLOBAL_SHORTCUT_IDS)[number];
export type ShortcutPlatform = 'mac' | 'other';
export type EditorInlineFormatShortcut = 'bold' | 'italic' | 'underline';

export interface ShortcutKeyboardEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
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

export function getRepeatLastActionShortcutLabels(platform: ShortcutPlatform = getShortcutPlatform()): string[] {
  return platform === 'mac' ? ['⌘ + ⌥ + R', 'Fn + F4'] : ['Ctrl + Alt + R', 'F4'];
}

export function getHeadingShortcutLabels(platform: ShortcutPlatform = getShortcutPlatform()): string[] {
  return platform === 'mac' ? ['⌘ + 1…6', '⌘ + ⌥ + 1…6'] : ['Ctrl + 1…6', 'Ctrl + Alt + 1…6'];
}

export function matchHeadingShortcut(event: ShortcutKeyboardEvent): number | null {
  if (event.isComposing || event.keyCode === 229 || event.shiftKey || (!event.ctrlKey && !event.metaKey)) return null;
  const codeMatch = event.code?.match(/^Digit([1-6])$/u);
  const keyMatch = event.key.match(/^([1-6])$/u);
  const legacyLevel = event.keyCode >= 49 && event.keyCode <= 54 ? event.keyCode - 48 : 0;
  const level = Number(codeMatch?.[1] || keyMatch?.[1] || legacyLevel);
  return level >= 1 && level <= 6 ? level : null;
}

export function matchEditorInlineFormatShortcut(event: ShortcutKeyboardEvent): EditorInlineFormatShortcut | null {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.shiftKey ||
    (!event.ctrlKey && !event.metaKey)
  ) {
    return null;
  }
  const pressedCode = event.code?.toLowerCase();
  const pressedKey = event.key.toLowerCase();
  if (pressedKey === 'b' || pressedCode === 'keyb' || event.keyCode === 66) return 'bold';
  if (pressedKey === 'i' || pressedCode === 'keyi' || event.keyCode === 73) return 'italic';
  if (pressedKey === 'u' || pressedCode === 'keyu' || event.keyCode === 85) return 'underline';
  return null;
}

export function matchesRepeatLastActionShortcut(event: ShortcutKeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  const pressedKey = event.key.toLowerCase();
  const pressedCode = event.code?.toLowerCase();
  if (pressedKey === 'f4' || pressedCode === 'f4' || event.keyCode === 115) {
    return !event.ctrlKey && !event.metaKey && !event.altKey;
  }
  const isRKey = pressedKey === 'r' || pressedCode === 'keyr' || event.keyCode === 82;
  return isRKey && event.altKey && (event.ctrlKey || event.metaKey);
}

export function matchesGlobalShortcut(event: ShortcutKeyboardEvent, id: GlobalShortcutId): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
  if (event.altKey) return false;
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const pressedKey = event.key.toLowerCase();
  return [SHORTCUT_DEFINITIONS[id], ...(SHORTCUT_ALIASES[id] || [])].some(
    (definition) =>
      pressedKey === definition.key && (definition.primaryModifier ? hasPrimaryModifier : !hasPrimaryModifier),
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
