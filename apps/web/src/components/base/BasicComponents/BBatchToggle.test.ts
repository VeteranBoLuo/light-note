import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import BBatchToggle from './BBatchToggle.vue';
import icon from '@/config/icon';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mountToggle(initial: Record<string, unknown> = {}) {
  const props = reactive({ active: false, ...initial });
  const onClick = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    messages: {
      zh: { common: { batchActions: '批量操作', exitBatch: '退出批量' } },
      en: { common: { batchActions: 'Batch actions', exitBatch: 'Exit batch' } },
    },
  });
  const app = createApp(() => h(BBatchToggle, { ...props, onClick })).use(i18n);
  app.component('SvgIcon', SvgIcon);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { props, onClick, host, i18n, button: host.querySelector('button')! };
}

describe('BBatchToggle 模式入口', () => {
  it('由调用方控制模式，点击只派发一次事件，进入与退出保留自然宽度所需的双文案', async () => {
    const x = mountToggle();
    expect(x.button.type).toBe('button');
    expect(x.button.getAttribute('aria-label')).toBe('批量操作');
    expect(x.button.getAttribute('aria-pressed')).toBe('false');
    x.button.click();
    expect(x.onClick).toHaveBeenCalledTimes(1);
    expect(x.button.getAttribute('aria-pressed')).toBe('false');
    x.props.active = true;
    await nextTick();
    expect(x.button.getAttribute('aria-label')).toBe('退出批量');
    expect(x.button.getAttribute('aria-pressed')).toBe('true');
    expect(x.host.querySelector('.is-visible')?.textContent).toBe('退出批量');
    expect(x.host.querySelectorAll('.b-batch-toggle__labels > span')).toHaveLength(2);
    x.button.click();
    expect(x.onClick).toHaveBeenCalledTimes(2);
  });

  it.each([{ disabled: true }, { loading: true }])('禁用或加载时阻止模式切换：%j', (props) => {
    const x = mountToggle(props);
    expect(x.button.disabled).toBe(true);
    x.button.click();
    expect(x.onClick).not.toHaveBeenCalled();
    if ('loading' in props) expect(x.button.getAttribute('aria-busy')).toBe('true');
  });

  it('语言切换与自定义标签同步更新可访问名称', async () => {
    const x = mountToggle();
    x.i18n.global.locale.value = 'en';
    await nextTick();
    expect(x.button.getAttribute('aria-label')).toBe('Batch actions');
    Object.assign(x.props, { active: true, exitLabel: '结束选择' });
    await nextTick();
    expect(x.button.getAttribute('aria-label')).toBe('结束选择');
  });

  it('各尺寸保留调用方布局变量，默认图标与退出图标都有真实资源', () => {
    const x = mountToggle({ size: 'small', style: '--batch-toggle-height: 30px', class: 'toolbar-batch' });
    expect(x.button.classList.contains('b-batch-toggle--small')).toBe(true);
    expect(x.button.classList.contains('toolbar-batch')).toBe(true);
    expect(x.button.style.getPropertyValue('--batch-toggle-height')).toBe('30px');
    expect(icon.common.batchSelect).toContain('currentColor');
    expect(icon.common.batchSelect).not.toBe(icon.nullImg);
    expect(icon.common.close).toBeTruthy();
    expect(x.host.querySelector('.b-batch-toggle__icon')?.getAttribute('style')).toContain('1.25em');
  });
});
