import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installEscapeFocusRing } from './escapeFocusRing';

const root = document.documentElement;
const hidden = () => root.classList.contains('light-note-hide-escape-focus-ring');

describe('Escape 焦点环', () => {
  let trigger: HTMLButtonElement;
  let dialog: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    trigger = document.createElement('button');
    dialog = document.createElement('div');
    dialog.tabIndex = -1;
    document.body.append(trigger, dialog);
    dispose = installEscapeFocusRing();
  });

  afterEach(() => {
    dispose();
    trigger.remove();
    dialog.remove();
  });

  function press(key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
  }

  it('在浮层消费 Escape 并恢复焦点前隐藏焦点环，下次 Tab 恢复', () => {
    dialog.focus();
    dialog.addEventListener('keydown', (event) => {
      expect(hidden()).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
      event.stopPropagation();
      trigger.focus();
    });

    expect(press('Escape').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(hidden()).toBe(true);
    press('Shift', { shiftKey: true });
    expect(hidden()).toBe(true);
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(hidden()).toBe(false);
  });

  it('输入法使用 Escape 时保留焦点样式，真实按键后可用指针恢复普通焦点反馈', () => {
    trigger.focus();
    press('Escape', { isComposing: true });
    expect(hidden()).toBe(false);
    expect(press('Escape').defaultPrevented).toBe(false);
    expect(hidden()).toBe(true);
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(hidden()).toBe(false);
  });
});
