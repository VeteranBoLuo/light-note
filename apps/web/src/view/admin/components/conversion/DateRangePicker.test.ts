import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import DateRangePicker from './DateRangePicker.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountPicker(initialPreset: 'today' | 'all' = 'all') {
  const host = document.createElement('div');
  document.body.append(host);
  const range = reactive({ start: '', end: '' });
  const onChange = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h(DateRangePicker, {
          start: range.start,
          end: range.end,
          initialPreset,
          onChange,
        });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, range, onChange };
}

describe('DateRangePicker', () => {
  it('supports an all-time initial state without forcing log pages to today', async () => {
    const { host, onChange } = mountPicker('all');
    await nextTick();

    expect(host.querySelector('.drp-trigger')?.textContent).toContain('全期');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stays in sync when a parent applies and resets a controlled range', async () => {
    const { host, range } = mountPicker('all');
    range.start = '2026-08-06';
    range.end = '2026-08-21';
    await nextTick();
    expect(host.querySelector('.drp-trigger')?.textContent).toContain('2026-08-06 ~ 2026-08-21');

    range.start = '';
    range.end = '';
    await nextTick();
    expect(host.querySelector('.drp-trigger')?.textContent).toContain('全期');
  });
});
