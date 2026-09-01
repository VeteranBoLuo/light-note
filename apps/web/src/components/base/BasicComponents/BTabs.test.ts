import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BTabs from './BTabs.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountTabs(variant: 'line' | 'solid' = 'line') {
  const host = document.createElement('div');
  document.body.append(host);
  const active = ref('ask');
  const onChange = vi.fn();
  const onSelect = vi.fn();
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
          variant,
          'onUpdate:activeTab': (value: string) => {
            active.value = value;
          },
          onChange,
          onSelect,
        });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, active, onChange, onSelect };
}

describe('BTabs keyboard navigation', () => {
  it('exposes the solid variant through the shared component root', () => {
    const { host } = mountTabs('solid');
    expect(host.querySelector('[role="tablist"]')?.classList.contains('is-solid')).toBe(true);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Ask');
  });

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

  it('emits select when the active tab is clicked again without emitting a false change', async () => {
    const { host, active, onChange, onSelect } = mountTabs();
    host.querySelectorAll<HTMLElement>('[role="tab"]')[0]?.click();
    await nextTick();

    expect(active.value).toBe('ask');
    expect(onSelect).toHaveBeenCalledWith('ask');
    expect(onChange).not.toHaveBeenCalled();
  });
});
