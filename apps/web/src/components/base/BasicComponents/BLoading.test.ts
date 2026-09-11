import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BLoading from './BLoading.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountLoading(initialLoading: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const loading = ref(initialLoading);
  const app = createApp({
    setup() {
      return () => h(BLoading, { loading: loading.value, bar: true, title: 'Loading page' });
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, loading };
}

describe('BLoading bar', () => {
  it('提供不会阻塞页面操作的全局进度反馈', () => {
    const { host } = mountLoading(true);
    const bar = host.querySelector<HTMLElement>('.b-loading-bar');

    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-label')).toBe('Loading page');
    expect(bar?.getAttribute('aria-valuetext')).toBe('Loading page');
    expect(bar?.style.display).not.toBe('none');
  });

  it('导航完成后隐藏进度条', async () => {
    const { host, loading } = mountLoading(true);
    loading.value = false;
    await nextTick();

    expect(host.querySelector<HTMLElement>('.b-loading-bar')?.style.display).toBe('none');
  });
});

describe('BLoading shared data feedback', () => {
  it('hides an idle standalone layer and restores it only while loading', async () => {
    const host = document.createElement('div');
    const loading = ref(false);
    const app = createApp({
      render: () => h(BLoading, { loading: loading.value, class: 'both-center' }),
    });
    app.mount(host);
    cleanup = () => app.unmount();
    const layer = host.querySelector<HTMLElement>('.loader-container')!;
    expect(layer.style.display).toBe('none');
    loading.value = true;
    await nextTick();
    expect(layer.style.display).not.toBe('none');
    expect(layer.querySelector('[role="status"]')).not.toBeNull();
    loading.value = false;
    await nextTick();
    expect(layer.style.display).toBe('none');
    expect(layer.querySelector('[role="status"]')).toBeNull();
  });

  it('shows a standalone status and preserves mounted content across loading changes', async () => {
    const host = document.createElement('div');
    const loading = ref(true);
    const app = createApp({
      render: () =>
        h(
          BLoading,
          { loading: loading.value, title: '正在加载' },
          {
            default: () => h('input', { value: '保留内容' }),
          },
        ),
    });
    app.mount(host);
    cleanup = () => app.unmount();
    const input = host.querySelector('input');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('正在加载');
    expect(host.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('true');
    loading.value = false;
    await nextTick();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('input')).toBe(input);
    expect(host.querySelector<HTMLElement>('.loader-container')?.style.display).not.toBe('none');
    expect(input?.value).toBe('保留内容');
  });

  it('renders the same three-dot indicator in inline and standalone modes', () => {
    const host = document.createElement('div');
    const app = createApp({
      render: () => h('div', [h(BLoading, { loading: true }), h(BLoading, { loading: true, inline: true })]),
    });
    app.mount(host);
    cleanup = () => app.unmount();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(2);
    expect(host.querySelectorAll('.b-loading-inline__indicator')).toHaveLength(2);
    expect(host.querySelectorAll('.b-loading-inline__indicator i')).toHaveLength(6);
    expect(host.querySelector('.loader-container')?.classList.contains('is-standalone')).toBe(true);
  });
});

it('居中加载提供本地化默认说明，行内提示移除重复省略号', async () => {
  const host = document.createElement('div');
  const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    messages: { zh: { common: { loading: '正在加载…' } }, en: { common: { loading: 'Loading...' } } },
  });
  const app = createApp({
    render: () =>
      h('div', [h(BLoading, { loading: true }), h(BLoading, { loading: true, inline: true, title: '加载更多...' })]),
  });
  app.use(i18n);
  app.mount(host);
  cleanup = () => app.unmount();
  expect(host.querySelector('.b-loading-overlay')?.textContent?.trim()).toBe('正在加载');
  expect(host.querySelector('.b-loading-inline__title')?.textContent?.trim()).toBe('正在加载');
  expect(host.querySelector('.b-loading-inline .b-loading-inline__title')?.textContent).toBe('加载更多');
  i18n.global.locale.value = 'en';
  await nextTick();
  expect(host.querySelector('.b-loading-overlay')?.textContent?.trim()).toBe('Loading');
});
