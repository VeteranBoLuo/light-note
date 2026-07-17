import { describe, expect, it } from 'vitest';
import {
  getGlobalShortcutKeys,
  getGlobalShortcutLabel,
  isEditableShortcutTarget,
  matchesGlobalShortcut,
  type ShortcutKeyboardEvent,
} from './keyboardShortcuts';

function keyboardEvent(overrides: Partial<ShortcutKeyboardEvent> = {}): ShortcutKeyboardEvent {
  return {
    key: '/',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    isComposing: false,
    keyCode: 191,
    ...overrides,
  };
}

describe('keyboardShortcuts', () => {
  it('区分单斜杠搜索与主修饰键 AI 快捷键', () => {
    expect(matchesGlobalShortcut(keyboardEvent(), 'globalSearch')).toBe(true);
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true }), 'globalSearch')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true }), 'aiAssistant')).toBe(true);
    expect(matchesGlobalShortcut(keyboardEvent({ metaKey: true }), 'aiAssistant')).toBe(true);
    expect(matchesGlobalShortcut(keyboardEvent(), 'aiAssistant')).toBe(false);
  });

  it('输入法、已消费事件与 Alt 组合不会触发', () => {
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true, isComposing: true }), 'aiAssistant')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true, keyCode: 229 }), 'aiAssistant')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true, defaultPrevented: true }), 'aiAssistant')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true, altKey: true }), 'aiAssistant')).toBe(false);
  });

  it('按当前平台生成设置页和提示所需的按键标签', () => {
    expect(getGlobalShortcutKeys('globalSearch', 'mac')).toEqual(['/']);
    expect(getGlobalShortcutKeys('aiAssistant', 'mac')).toEqual(['⌘', '/']);
    expect(getGlobalShortcutLabel('aiAssistant', 'mac')).toBe('⌘ + /');
    expect(getGlobalShortcutLabel('aiAssistant', 'other')).toBe('Ctrl + /');
  });

  it('识别输入控件与可编辑区域', () => {
    expect(isEditableShortcutTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(
      isEditableShortcutTarget({ tagName: 'SPAN', closest: () => ({}) as Element } as unknown as EventTarget),
    ).toBe(true);
    expect(isEditableShortcutTarget({ tagName: 'DIV', closest: () => null } as unknown as EventTarget)).toBe(false);
  });
});
