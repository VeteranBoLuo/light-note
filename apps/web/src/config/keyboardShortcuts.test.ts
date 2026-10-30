import { describe, expect, it } from 'vitest';
import {
  getGlobalShortcutKeys,
  getGlobalShortcutLabel,
  getHeadingShortcutLabels,
  getRepeatLastActionShortcutLabels,
  getWorkspacePanelAriaKeyShortcut,
  getWorkspacePanelShortcutLabel,
  isEditableShortcutTarget,
  matchWorkspacePanelShortcut,
  matchesGlobalShortcut,
  matchEditorInlineFormatShortcut,
  matchHeadingShortcut,
  matchesRepeatLastActionShortcut,
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
  it('全局搜索同时支持主修饰键 F 与单斜杠', () => {
    expect(matchesGlobalShortcut(keyboardEvent(), 'globalSearch')).toBe(true);
    expect(matchesGlobalShortcut(keyboardEvent({ ctrlKey: true }), 'globalSearch')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ key: 'f', keyCode: 70, ctrlKey: true }), 'globalSearch')).toBe(true);
    expect(matchesGlobalShortcut(keyboardEvent({ key: 'F', keyCode: 70, metaKey: true }), 'globalSearch')).toBe(true);
    expect(matchesGlobalShortcut(keyboardEvent({ key: 'f', keyCode: 70 }), 'globalSearch')).toBe(false);
  });

  it('输入法、已消费事件与 Alt 组合不会触发', () => {
    expect(matchesGlobalShortcut(keyboardEvent({ isComposing: true }), 'globalSearch')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ keyCode: 229 }), 'globalSearch')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ defaultPrevented: true }), 'globalSearch')).toBe(false);
    expect(matchesGlobalShortcut(keyboardEvent({ altKey: true }), 'globalSearch')).toBe(false);
  });

  it('按当前平台生成设置页和提示所需的按键标签', () => {
    expect(getGlobalShortcutKeys('globalSearch', 'mac')).toEqual(['⌘', 'F']);
    expect(getGlobalShortcutKeys('globalSearch', 'other')).toEqual(['Ctrl', 'F']);
    expect(getGlobalShortcutLabel('globalSearch', 'mac')).toBe('⌘ + F');
    expect(getGlobalShortcutLabel('globalSearch', 'other')).toBe('Ctrl + F');
  });

  it('为“重复上一步”生成平台化标签，并识别 Mac Option 组合键', () => {
    expect(getRepeatLastActionShortcutLabels('mac')).toEqual(['⌘ + ⌥ + R', 'Fn + F4']);
    expect(getRepeatLastActionShortcutLabels('other')).toEqual(['Ctrl + Alt + R', 'F4']);
    expect(
      matchesRepeatLastActionShortcut(
        keyboardEvent({ key: '®', code: 'KeyR', keyCode: 82, metaKey: true, altKey: true }),
      ),
    ).toBe(true);
    expect(matchesRepeatLastActionShortcut(keyboardEvent({ key: 'R', keyCode: 82, ctrlKey: true, altKey: true }))).toBe(
      true,
    );
    expect(matchesRepeatLastActionShortcut(keyboardEvent({ key: 'F4', keyCode: 115 }))).toBe(true);
    expect(matchesRepeatLastActionShortcut(keyboardEvent({ key: 'r', keyCode: 82, metaKey: true }))).toBe(false);
    expect(
      matchesRepeatLastActionShortcut(
        keyboardEvent({ key: 'r', keyCode: 229, metaKey: true, altKey: true, isComposing: true }),
      ),
    ).toBe(false);
  });

  it('标题快捷键同时支持主修饰键数字与 Alt/Option 兼容组合', () => {
    expect(getHeadingShortcutLabels('mac')).toEqual(['⌘ + 1…6', '⌘ + ⌥ + 1…6']);
    expect(getHeadingShortcutLabels('other')).toEqual(['Ctrl + 1…6', 'Ctrl + Alt + 1…6']);
    expect(matchHeadingShortcut(keyboardEvent({ key: '1', code: 'Digit1', keyCode: 49, metaKey: true }))).toBe(1);
    expect(
      matchHeadingShortcut(keyboardEvent({ key: '¡', code: 'Digit1', keyCode: 49, metaKey: true, altKey: true })),
    ).toBe(1);
    expect(matchHeadingShortcut(keyboardEvent({ key: '6', code: 'Digit6', keyCode: 54, ctrlKey: true }))).toBe(6);
    expect(
      matchHeadingShortcut(keyboardEvent({ key: '1', code: 'Digit1', keyCode: 49, metaKey: true, shiftKey: true })),
    ).toBeNull();
    expect(matchHeadingShortcut(keyboardEvent({ key: '1', code: 'Digit1', keyCode: 49 }))).toBeNull();
  });

  it('富文本行内格式快捷键不依赖编辑器内置解析', () => {
    expect(matchEditorInlineFormatShortcut(keyboardEvent({ key: 'b', code: 'KeyB', keyCode: 66, metaKey: true }))).toBe(
      'bold',
    );
    expect(matchEditorInlineFormatShortcut(keyboardEvent({ key: 'i', code: 'KeyI', keyCode: 73, metaKey: true }))).toBe(
      'italic',
    );
    expect(matchEditorInlineFormatShortcut(keyboardEvent({ key: 'u', code: 'KeyU', keyCode: 85, ctrlKey: true }))).toBe(
      'underline',
    );
    expect(
      matchEditorInlineFormatShortcut(
        keyboardEvent({ key: 'i', code: 'KeyI', keyCode: 73, metaKey: true, altKey: true }),
      ),
    ).toBeNull();
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

describe('笔记工作区面板开关快捷键', () => {
  const event = (patch: Partial<ShortcutKeyboardEvent>): ShortcutKeyboardEvent => ({
    key: '\\',
    code: 'Backslash',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
    keyCode: 220,
    ...patch,
  });

  it('macOS：⌘ + \\ 开关页面树，⌃ + \\ 开关右侧面板，⌥ + \\ 留给输入字符', () => {
    expect(matchWorkspacePanelShortcut(event({ metaKey: true }), 'mac')).toBe('sidebar');
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true }), 'mac')).toBe('sidePanel');
    expect(matchWorkspacePanelShortcut(event({ altKey: true, key: '«' }), 'mac')).toBeNull();
  });

  it('Windows / Linux：Ctrl + \\ 开关页面树，Alt + \\ 开关右侧面板', () => {
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true }), 'other')).toBe('sidebar');
    expect(matchWorkspacePanelShortcut(event({ altKey: true }), 'other')).toBe('sidePanel');
    expect(matchWorkspacePanelShortcut(event({ metaKey: true }), 'other')).toBeNull();
  });

  it('多个修饰键、缺少修饰键、Shift、输入法组字或已被处理时不触发', () => {
    expect(matchWorkspacePanelShortcut(event({}), 'other')).toBeNull();
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true, altKey: true }), 'other')).toBeNull();
    expect(matchWorkspacePanelShortcut(event({ metaKey: true, ctrlKey: true }), 'mac')).toBeNull();
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true, shiftKey: true }), 'other')).toBeNull();
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true, isComposing: true }), 'other')).toBeNull();
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true, defaultPrevented: true }), 'other')).toBeNull();
    expect(matchWorkspacePanelShortcut(event({ ctrlKey: true, key: 'b', code: 'KeyB', keyCode: 66 }), 'other')).toBeNull();
  });

  it('提示文字与无障碍快捷键按平台生成', () => {
    expect(getWorkspacePanelShortcutLabel('sidebar', 'mac')).toBe('⌘ + \\');
    expect(getWorkspacePanelShortcutLabel('sidePanel', 'mac')).toBe('⌃ + \\');
    expect(getWorkspacePanelShortcutLabel('sidebar', 'other')).toBe('Ctrl + \\');
    expect(getWorkspacePanelShortcutLabel('sidePanel', 'other')).toBe('Alt + \\');
    expect(getWorkspacePanelAriaKeyShortcut('sidePanel', 'mac')).toBe('Control+\\');
    expect(getWorkspacePanelAriaKeyShortcut('sidePanel', 'other')).toBe('Alt+\\');
  });
});
