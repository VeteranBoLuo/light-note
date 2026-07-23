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

function mountSelect(
  showSearch = false,
  accessibility: { ariaLabel?: string; ariaLabelledby?: string } = {},
  mode: 'single' | 'multiple' = 'single',
) {
  const value = ref<string | string[]>(mode === 'multiple' ? [] : '');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(BSelect, {
          options,
          showSearch,
          mode,
          ...accessibility,
          value: value.value,
          'onUpdate:value': (nextValue: string | string[]) => {
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

function pressKey(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
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
    const { host, value } = mountSelect(true, { ariaLabel: 'Choose scope' });
    const input = host.querySelector<HTMLInputElement>('.select-search-inline');
    expect(input).not.toBeNull();
    expect(input!.getAttribute('role')).toBe('combobox');
    expect(input!.getAttribute('aria-label')).toBe('Choose scope');

    pressKey(input!, 'ArrowDown');
    await nextTick();
    expect(input!.getAttribute('aria-expanded')).toBe('true');
    expect(input!.getAttribute('aria-activedescendant')).toMatch(/-option-1$/);

    pressKey(input!, 'Enter');
    await nextTick();
    expect(value.value).toBe('first');
  });

  it('does not select an active option when Enter confirms an IME candidate', async () => {
    const { host, value } = mountSelect(true, {}, 'multiple');
    host.querySelector<HTMLElement>('.select-trigger')?.click();
    await nextTick();
    const input = document.body.querySelector<HTMLInputElement>('.select-search-input');
    expect(input).not.toBeNull();

    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input!.getAttribute('aria-activedescendant')).toMatch(/-option-1$/);

    pressKey(input!, 'Enter', { isComposing: true });
    await nextTick();
    expect(value.value).toEqual([]);
  });

  it('forwards an aria-labelledby relationship to a non-searchable combobox', () => {
    const { host } = mountSelect(false, { ariaLabelledby: 'scope-label' });
    const trigger = host.querySelector<HTMLElement>('.select-trigger');
    expect(trigger?.getAttribute('aria-labelledby')).toBe('scope-label');
  });
});
