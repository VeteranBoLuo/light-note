import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BTimePicker from './BTimePicker.vue';

const source = readFileSync(resolve(process.cwd(), 'src/components/base/BasicComponents/BTimePicker.vue'), 'utf8');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.querySelectorAll('.b-popover-panel, .select-dropdown').forEach((item) => item.remove());
});

describe('BTimePicker', () => {
  it('整块触发器可打开统一时间面板，且内部控件不会突破面板宽度', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const changed = vi.fn();
    const app = createApp({
      setup() {
        const value = ref('09:00');
        return () =>
          h(BTimePicker, {
            value: value.value,
            'onUpdate:value': (next: string) => (value.value = next),
            onChange: changed,
            ariaLabel: '每日提醒时间',
            block: true,
          });
      },
    });
    app.component('OriginalIcon', { render: () => h('span') });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: {
          'zh-CN': {
            common: {
              cancel: '取消',
              confirm: '确定',
              hour: '小时',
              minute: '分钟',
              noMatch: '无匹配项',
              pleaseSelect: '请选择',
              searchPlaceholder: '搜索',
              selectTime: '选择时间',
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

    const trigger = host.querySelector<HTMLButtonElement>('.b-time-trigger');
    expect(trigger).not.toBeNull();
    expect(host.querySelector('.b-time-picker.is-block')).not.toBeNull();
    trigger!.click();
    await nextTick();

    const panel = document.body.querySelector<HTMLElement>('.b-time-panel');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('09:00');
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');

    expect(source).toMatch(
      /\.b-time-panel__fields :deep\(\.b-select\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/,
    );
    expect(source).toMatch(
      /\.b-time-panel__fields :deep\(\.select-trigger\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/,
    );
    expect(source).toContain('dropdown-class-name="b-time-select-dropdown"');
    expect(source).toContain('select-on-focus');
    expect(source).toMatch(/select-dropdown\.b-time-select-dropdown[\s\S]*?border-radius:\s*12px;/);
    expect(source).toMatch(
      /\.b-time-picker\.is-block :deep\(\.b-time-trigger\)[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/,
    );
  });
});
