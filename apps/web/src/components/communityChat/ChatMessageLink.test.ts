import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ChatInlineEmojiText from './ChatInlineEmojiText.vue';
import { chatMessageLinkNavigatorKey } from './chatMessageLinks';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function mount(content: string, links = true, navigator?: (path: string) => void) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/community/chat', component: { render: () => null } },
      { path: '/updateLogs', name: 'updateLogs', component: { render: () => null } },
      { path: '/:catchAll(.*)', name: 'not-found', component: { render: () => null } },
    ],
  });
  await router.push('/community/chat');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatInlineEmojiText, { content, links });
  app.use(router).use(createI18n({ legacy: false, locale: 'zh-CN', missingWarn: false, fallbackWarn: false }));
  if (navigator) app.provide(chatMessageLinkNavigatorKey, navigator);
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, router };
}

function click(link: Element | null, init: MouseEventInit = {}) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  link?.dispatchEvent(event);
  return event;
}

it('opens Light Note pages inside the app and leaves other links to a new browser page', async () => {
  const { host, router } = await mount(
    '日志 https://boluo66.top/updateLogs 文件 https://boluo66.top/uploads/a.pdf 外站 https://example.com/x',
  );
  const [page, file, external] = Array.from(host.querySelectorAll('a'));
  expect(external.getAttribute('target')).toBe('_blank');
  expect(external.getAttribute('rel')).toContain('noopener');

  expect(click(external).defaultPrevented).toBe(false);
  expect(click(file).defaultPrevented).toBe(false);
  expect(click(page, { metaKey: true }).defaultPrevented).toBe(false);
  expect(router.currentRoute.value.path).toBe('/community/chat');

  expect(click(page).defaultPrevented).toBe(true);
  await router.isReady();
  await new Promise((resolve) => setTimeout(resolve));
  expect(router.currentRoute.value.path).toBe('/updateLogs');
});

it('renders links only where the caller enables them', async () => {
  const { host } = await mount('https://example.com', false);
  expect(host.querySelector('a')).toBeNull();
  expect(host.textContent).toBe('https://example.com');
});

it('lets an overlay close itself before an in-app link navigates', async () => {
  const navigator = vi.fn();
  const { host, router } = await mount('https://boluo66.top/updateLogs', true, navigator);
  expect(click(host.querySelector('a')).defaultPrevented).toBe(true);
  expect(navigator).toHaveBeenCalledWith('/updateLogs');
  expect(router.currentRoute.value.path).toBe('/community/chat');
});
