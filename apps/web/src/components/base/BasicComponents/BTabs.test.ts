import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BTabs from './BTabs.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountTabs() {
  const host = document.createElement('div');
  document.body.append(host);
  const active = ref('ask');
  const onChange = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h(BTabs, {
          options: [
            { key: 'ask', label: 'Ask' },
            { key: 'research', label: 'Research' },
            { key: 'organize', label: 'Organize' },
          ],
          activeTab: active.value,
          'onUpdate:activeTab': (value: string) => {
            active.value = value;
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
  return { host, active, onChange };
}

describe('BTabs keyboard navigation', () => {
  it('uses roving focus and activates the next tab with ArrowRight', async () => {
    const { host, active, onChange } = mountTabs();
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.tabIndex).toBe(0);
    expect(tabs[1]?.tabIndex).toBe(-1);

    tabs[0]?.focus();
    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();

    expect(active.value).toBe('research');
    expect(onChange).toHaveBeenCalledWith('research');
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('wraps focus and supports Home and End', async () => {
    const { host, active } = mountTabs();
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(active.value).toBe('organize');

    tabs[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await nextTick();
    expect(active.value).toBe('ask');

    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await nextTick();
    expect(active.value).toBe('organize');
  });
});
