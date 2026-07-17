import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BSelect from './BSelect.vue';

const options = [
  { label: 'Disabled', value: 'disabled', disabled: true },
  { label: 'First available', value: 'first' },
  { label: 'Second available', value: 'second' },
];

let cleanup: (() => void) | undefined;

function mountSelect(showSearch = false) {
  const value = ref('');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(BSelect, {
          options,
          showSearch,
          value: value.value,
          'onUpdate:value': (nextValue: string) => {
            value.value = nextValue;
          },
        });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: {
          common: {
            noMatch: 'No matches',
            pleaseSelect: 'Please select',
            searchPlaceholder: 'Search',
          },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, value };
}

function pressKey(target: HTMLElement, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('BSelect keyboard interaction', () => {
  it('opens with ArrowDown, skips disabled options, and selects the active option with Enter', async () => {
    const { host, value } = mountSelect();
    const trigger = host.querySelector<HTMLElement>('.select-trigger');
    expect(trigger).not.toBeNull();

    pressKey(trigger!, 'ArrowDown');
    await nextTick();
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');
    expect(trigger!.getAttribute('aria-activedescendant')).toMatch(/-option-1$/);

    pressKey(trigger!, 'ArrowDown');
    await nextTick();
    expect(trigger!.getAttribute('aria-activedescendant')).toMatch(/-option-2$/);

    pressKey(trigger!, 'Enter');
    await nextTick();
    expect(value.value).toBe('second');
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes the searchable trigger as a combobox and supports keyboard selection', async () => {
    const { host, value } = mountSelect(true);
    const input = host.querySelector<HTMLInputElement>('.select-search-inline');
    expect(input).not.toBeNull();
    expect(input!.getAttribute('role')).toBe('combobox');

    pressKey(input!, 'ArrowDown');
    await nextTick();
    expect(input!.getAttribute('aria-expanded')).toBe('true');
    expect(input!.getAttribute('aria-activedescendant')).toMatch(/-option-1$/);

    pressKey(input!, 'Enter');
    await nextTick();
    expect(value.value).toBe('first');
  });
});
