import { afterEach, describe, expect, it, vi } from 'vitest';
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
  extraProps: Record<string, unknown> = {},
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
          ...extraProps,
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
  it('支持为 Teleport 下拉层附加业务样式类', async () => {
    const { host } = mountSelect(false, {}, 'single', { dropdownClassName: 'time-select-dropdown' });
    host.querySelector<HTMLElement>('.select-trigger')?.click();
    await nextTick();

    expect(document.body.querySelector('.select-dropdown.time-select-dropdown')).not.toBeNull();
  });

  it('鼠标打开时不把第一项伪装成悬停态', async () => {
    const { host } = mountSelect();
    const trigger = host.querySelector<HTMLElement>('.select-trigger');

    trigger?.click();
    await nextTick();

    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(trigger?.hasAttribute('aria-activedescendant')).toBe(false);
    expect(document.body.querySelector('.select-option.is-active')).toBeNull();
  });

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

  it('搜索输入变化时向业务层发送 search 事件', async () => {
    const onSearch = vi.fn();
    const { host } = mountSelect(true, {}, 'single', { onSearch, allowClear: true });
    const input = host.querySelector<HTMLInputElement>('.select-search-inline');
    expect(input).not.toBeNull();

    input!.value = 'second';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(onSearch).toHaveBeenCalledWith('second');
    expect(input!.getAttribute('aria-expanded')).toBe('true');

    host.querySelector<HTMLElement>('.select-clear')?.click();
    await nextTick();
    expect(onSearch).toHaveBeenLastCalledWith('');
    expect(input!.value).toBe('');
  });

  it('可输入单选支持精确输入、单数字补零，并拒绝选项范围外的值', async () => {
    const onValidityChange = vi.fn();
    const numericOptions = Array.from({ length: 24 }, (_, index) => {
      const value = String(index).padStart(2, '0');
      return { label: value, value };
    });
    const { host, value } = mountSelect(false, {}, 'single', {
      options: numericOptions,
      editable: true,
      inputmode: 'numeric',
      maxlength: 2,
      onValidityChange,
    });
    const input = host.querySelector<HTMLInputElement>('.select-search-inline');
    expect(input).not.toBeNull();
    expect(input!.inputMode).toBe('numeric');
    expect(input!.maxLength).toBe(2);

    input!.value = '16';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(value.value).toBe('16');
    expect(input!.getAttribute('aria-invalid')).toBeNull();
    expect(input!.getAttribute('aria-expanded')).toBe('false');

    input!.value = '99';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(value.value).toBe('16');
    expect(input!.getAttribute('aria-invalid')).toBe('true');
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    input!.value = '7';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input!.getAttribute('aria-invalid')).toBeNull();
    input!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await nextTick();
    expect(value.value).toBe('07');
    expect(input!.value).toBe('');
    expect(input!.getAttribute('aria-invalid')).toBeNull();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('按需在聚焦时把当前值写入输入框并完整选中，同时保留全部候选项', async () => {
    const numericOptions = Array.from({ length: 24 }, (_, index) => {
      const value = String(index).padStart(2, '0');
      return { label: value, value };
    });
    const { host, value } = mountSelect(false, {}, 'single', {
      options: numericOptions,
      editable: true,
      selectOnFocus: true,
    });
    value.value = '12';
    await nextTick();

    const input = host.querySelector<HTMLInputElement>('.select-search-inline');
    input!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(input!.value).toBe('12');
    expect(input!.selectionStart).toBe(0);
    expect(input!.selectionEnd).toBe(2);
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(24);
    expect(input!.classList.contains('is-select-on-focus')).toBe(true);
  });

  it('可输入单选按 Escape 放弃非法草稿并恢复当前选中值', async () => {
    const { host, value } = mountSelect(false, {}, 'single', {
      options: [
        { label: '00', value: '00' },
        { label: '30', value: '30' },
      ],
      editable: true,
    });
    value.value = '30';
    await nextTick();
    const input = host.querySelector<HTMLInputElement>('.select-search-inline');
    input!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input!.value = '99';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    pressKey(input!, 'Escape');
    await nextTick();
    expect(value.value).toBe('30');
    expect(input!.value).toBe('');
    expect(input!.placeholder).toBe('30');
    expect(input!.getAttribute('aria-invalid')).toBeNull();
  });

  it('阻止冒泡的弹层内切换兄弟选择器时只保留当前下拉', async () => {
    const timeOptions = Array.from({ length: 24 }, (_, index) => {
      const value = String(index).padStart(2, '0');
      return { label: value, value };
    });
    const firstValue = ref('10');
    const secondValue = ref('21');
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        const selectProps = { options: timeOptions, editable: true, inputmode: 'numeric' as const, maxlength: 2 };
        return () =>
          h(
            'div',
            {
              onClick: (event: MouseEvent) => event.stopPropagation(),
            },
            [
              h(BSelect, {
                ...selectProps,
                value: firstValue.value,
                'onUpdate:value': (value: string) => (firstValue.value = value),
              }),
              h(BSelect, {
                ...selectProps,
                value: secondValue.value,
                'onUpdate:value': (value: string) => (secondValue.value = value),
              }),
            ],
          );
      },
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'en',
        messages: {
          en: { common: { noMatch: 'No matches', pleaseSelect: 'Please select', searchPlaceholder: 'Search' } },
        },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const inputs = host.querySelectorAll<HTMLInputElement>('.select-search-inline');
    const suffixes = host.querySelectorAll<HTMLElement>('.select-suffix');
    suffixes[0]?.click();
    await nextTick();
    expect(inputs[0]?.getAttribute('aria-expanded')).toBe('true');

    suffixes[1]?.click();
    await nextTick();
    expect(inputs[0]?.getAttribute('aria-expanded')).toBe('false');
    expect(inputs[1]?.getAttribute('aria-expanded')).toBe('true');

    inputs[0]?.focus();
    await nextTick();
    expect(inputs[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(inputs[1]?.getAttribute('aria-expanded')).toBe('false');
  });

  it('加载时在控件后缀显示进度并暴露 busy 状态', async () => {
    const { host } = mountSelect(true, {}, 'single', { loading: true, allowClear: true });
    const trigger = host.querySelector<HTMLElement>('.select-trigger');
    const input = host.querySelector<HTMLInputElement>('.select-search-inline');

    expect(trigger?.getAttribute('aria-busy')).toBe('true');
    expect(input?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.select-loading')).not.toBeNull();
    expect(host.querySelector('.select-clear')).toBeNull();
  });

  it('does not select an active option when Enter confirms an IME candidate', async () => {
    const { host, value } = mountSelect(true, {}, 'multiple');
    host.querySelector<HTMLElement>('.select-trigger')?.click();
    await nextTick();
    const input = document.body.querySelector<HTMLInputElement>('.select-search-input');
    expect(input).not.toBeNull();

    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input!.hasAttribute('aria-activedescendant')).toBe(false);

    pressKey(input!, 'Enter', { isComposing: true });
    await nextTick();
    expect(value.value).toEqual([]);
  });

  it('forwards an aria-labelledby relationship to a non-searchable combobox', () => {
    const { host } = mountSelect(false, { ariaLabelledby: 'scope-label' });
    const trigger = host.querySelector<HTMLElement>('.select-trigger');
    expect(trigger?.getAttribute('aria-labelledby')).toBe('scope-label');
  });

  it('多选用户标签可显式启用 tag 语义色', async () => {
    const { host } = mountSelect(false, {}, 'multiple', { chipTone: 'tag' });
    const trigger = host.querySelector<HTMLElement>('.select-trigger');
    trigger?.click();
    await nextTick();
    document.body.querySelectorAll<HTMLElement>('.select-option')[1]?.click();
    await nextTick();

    expect(host.querySelector('.b-select')?.classList.contains('is-tag-tone')).toBe(true);
    expect(host.querySelector('.select-tag')?.textContent).toContain('First available');
  });

  it('disabled 时不进入焦点顺序、不打开下拉，也不允许清空或选择', async () => {
    const value = ref<string | string[]>('first');
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () =>
          h(BSelect, {
            options,
            disabled: true,
            allowClear: true,
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
          en: { common: { noMatch: 'No matches', pleaseSelect: 'Please select', searchPlaceholder: 'Search' } },
        },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const trigger = host.querySelector<HTMLElement>('.select-trigger');
    expect(trigger?.getAttribute('tabindex')).toBe('-1');
    expect(trigger?.getAttribute('aria-disabled')).toBe('true');
    trigger?.click();
    pressKey(trigger!, 'ArrowDown');
    host.querySelector<HTMLElement>('.clear-icon')?.click();
    await nextTick();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(value.value).toBe('first');
  });
});
