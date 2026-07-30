import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BInput from './BInput.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('BInput change payload', () => {
  it('原生 change 时对外发送当前字符串值，并保持 v-model 同步', async () => {
    const value = ref('');
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () =>
          h(BInput, {
            value: value.value,
            'onUpdate:value': (nextValue: string) => {
              value.value = nextValue;
            },
            onChange,
          });
      },
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { placeholder: { input: '请输入' } } },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const input = host.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    input!.value = '22:30';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();

    expect(value.value).toBe('22:30');
    expect(onChange).toHaveBeenCalledWith('22:30');
  });
});
