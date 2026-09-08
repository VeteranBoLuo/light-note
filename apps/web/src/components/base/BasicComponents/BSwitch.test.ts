import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BSwitch from './BSwitch.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountSwitch(disabled = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const checked = ref(false);
  const onChange = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h(BSwitch, {
          checked: checked.value,
          disabled,
          'onUpdate:checked': (value: boolean) => {
            checked.value = value;
          },
          onChange,
        });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, checked, onChange };
}

describe('BSwitch semantics', () => {
  it('toggles with Enter and exposes switch state', async () => {
    const { host, checked, onChange } = mountSwitch();
    const control = host.querySelector<HTMLElement>('[role="switch"]');
    expect(control?.getAttribute('aria-checked')).toBe('false');

    control?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await nextTick();

    expect(checked.value).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(control?.getAttribute('aria-checked')).toBe('true');
  });

  it('is removed from tab order and inert when disabled', async () => {
    const { host, onChange } = mountSwitch(true);
    const control = host.querySelector<HTMLElement>('[role="switch"]');
    expect(control?.tabIndex).toBe(-1);
    control?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    control?.click();
    await nextTick();
    expect(onChange).not.toHaveBeenCalled();
  });
});

it('controlled mode emits intent without changing the displayed state before parent confirmation', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const checked = ref(false); const onChange = vi.fn();
  const app = createApp({ render: () => h(BSwitch, { checked: checked.value, controlled: true, onChange }) });
  app.mount(host); cleanup = () => { app.unmount(); host.remove(); };
  const control = host.querySelector<HTMLElement>('[role="switch"]')!;
  control.click(); await nextTick();
  expect(onChange).toHaveBeenCalledWith(true);
  expect(control.getAttribute('aria-checked')).toBe('false');
  checked.value = true; await nextTick();
  expect(control.getAttribute('aria-checked')).toBe('true');
});
