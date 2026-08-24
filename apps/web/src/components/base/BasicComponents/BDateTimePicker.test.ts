import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BDateTimePicker from './BDateTimePicker.vue';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span class="svg-icon-stub" />' },
}));

let cleanup: (() => void) | undefined;

function mountPicker(initialValue: string, props: { showTime?: boolean } = {}) {
  const value = ref(initialValue);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(BDateTimePicker, {
          ...props,
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
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          common: {
            previous: '上一个',
            next: '下一个',
            time: '时间',
            startTime: '开始时间',
            endTime: '结束时间',
            clear: '清除',
            cancel: '取消',
            confirm: '确定',
            selectDateTime: '选择日期时间',
            selectDate: '选择日期',
            selectRangeStart: '选择开始时间',
            selectRangeEnd: '选择结束时间',
            noMatch: '无匹配项',
            pleaseSelect: '请选择',
            searchPlaceholder: '搜索',
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

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.querySelectorAll('.b-datetime-popover, .select-dropdown').forEach((element) => element.remove());
});

describe('BDateTimePicker time input', () => {
  it('日期模式只提交日历日，不渲染会被忽略的时间输入', async () => {
    const { host, value } = mountPicker('2026-08-13', { showTime: false });
    host.querySelector<HTMLElement>('.b-datetime-trigger')?.click();
    await nextTick();

    expect(document.body.querySelector('.b-datetime-times')).toBeNull();
    const confirmButton = Array.from(
      document.body.querySelectorAll<HTMLElement>('.b-datetime-panel__footer .b_btn'),
    ).find((button) => button.textContent?.trim() === '确定');
    confirmButton?.click();
    await nextTick();

    expect(value.value).toBe('2026-08-13');
  });

  it('复用通用聚焦全选能力，让日期时间组合中的时分都有明确选中底色', async () => {
    const { host } = mountPicker('2026-08-13T16:17');
    host.querySelector<HTMLElement>('.b-datetime-trigger')?.click();
    await nextTick();

    const inputs = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('.b-datetime-popover .select-search-inline'),
    );
    expect(inputs).toHaveLength(2);
    expect(inputs.every((input) => input.classList.contains('is-select-on-focus'))).toBe(true);

    inputs[1]!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    inputs[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(inputs[1]!.value).toBe('17');
    expect(inputs[1]!.selectionStart).toBe(0);
    expect(inputs[1]!.selectionEnd).toBe(2);
    const minuteDropdownId = inputs[1]!.getAttribute('aria-controls');
    expect(minuteDropdownId).toBeTruthy();
    expect(document.getElementById(minuteDropdownId!)?.querySelectorAll('.select-option')).toHaveLength(60);
  });

  it('保留非五分钟档的原值，并允许直接输入任意合法时分', async () => {
    const { host, value } = mountPicker('2026-08-13T16:17');
    host.querySelector<HTMLElement>('.b-datetime-trigger')?.click();
    await nextTick();

    const inputs = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('.b-datetime-popover .select-search-inline'),
    );
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.placeholder).toBe('16');
    expect(inputs[1]?.placeholder).toBe('17');

    inputs[0]!.value = '9';
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    inputs[0]!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    inputs[1]!.value = '59';
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1]!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await nextTick();

    const confirmButton = Array.from(
      document.body.querySelectorAll<HTMLElement>('.b-datetime-panel__footer .b_btn'),
    ).find((button) => button.textContent?.trim() === '确定');
    confirmButton?.click();
    await nextTick();

    expect(value.value).toBe('2026-08-13T09:59');
  });

  it('非法时间输入会标记错误并阻止确认', async () => {
    const { host } = mountPicker('2026-08-13T16:30');
    host.querySelector<HTMLElement>('.b-datetime-trigger')?.click();
    await nextTick();

    const minuteInput = document.body.querySelectorAll<HTMLInputElement>(
      '.b-datetime-popover .select-search-inline',
    )[1];
    minuteInput!.value = '99';
    minuteInput!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    const confirmButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.b-datetime-panel__footer button'),
    ).find((button) => button.textContent?.trim() === '确定');
    expect(minuteInput!.getAttribute('aria-invalid')).toBe('true');
    expect(confirmButton?.disabled).toBe(true);
  });
});
