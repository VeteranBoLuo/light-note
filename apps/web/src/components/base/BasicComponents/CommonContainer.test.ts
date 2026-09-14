import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import CommonContainer from './CommonContainer.vue';

vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: true }) }));
vi.mock('@/utils/common', () => ({ backRouterPage: vi.fn() }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe('自画移动页头返回', () => {
  it('系统返回与按钮执行同一动作，隐藏返回及离开页面时不消费事件', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/one', name: 'one', component: {} }, { path: '/two', name: 'two', component: {} }] });
    await router.push('/one');
    const back = vi.fn();
    const showBack = ref(true);
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp({ render: () => h(CommonContainer, { showBack: showBack.value, onBackClick: back }) });
    app.use(router); app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { common: { back: '返回' } } } })); app.mount(host);
    cleanup = () => { app.unmount(); host.remove(); };
    host.querySelector<HTMLButtonElement>('.common-container-back')!.click();
    expect(back).toHaveBeenCalledOnce();
    const event = new Event('light-note-system-back', { cancelable: true });
    window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(back).toHaveBeenCalledTimes(2);
    showBack.value = false; await nextTick();
    const hidden = new Event('light-note-system-back', { cancelable: true }); window.dispatchEvent(hidden); expect(hidden.defaultPrevented).toBe(false);
    showBack.value = true; await nextTick(); await router.push('/two');
    const inactive = new Event('light-note-system-back', { cancelable: true }); window.dispatchEvent(inactive); expect(inactive.defaultPrevented).toBe(false);
    expect(back).toHaveBeenCalledTimes(2);
  });
});
