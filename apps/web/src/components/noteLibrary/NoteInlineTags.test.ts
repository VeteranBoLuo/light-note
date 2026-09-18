import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import NoteInlineTags from './NoteInlineTags.vue';
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.zoom = '';
});
it('opens full labels, navigates by tag ID and respects route guards', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/note/one');
  let allowLeave = false;
  router.beforeEach(() => allowLeave);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(NoteInlineTags, { compact: true, tags: [{ id: 'tag/one', name: '完整标签名称' }, { name: '无标识标签' }] }),
  });
  app.use(router);
  app.use(
    createI18n({ legacy: false, locale: 'zh', messages: { zh: { noteDetail: { tagsWithCount: '标签（{count}）' } } } }),
  );
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const trigger = host.querySelector<HTMLButtonElement>('.note-inline-tags__more')!;
  trigger.click();
  await nextTick();
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const list = document.querySelector('.note-inline-tags__list')!;
  expect(list.textContent).toContain('完整标签名称');
  expect(list.querySelectorAll('button')).toHaveLength(1);
  list.querySelector<HTMLButtonElement>('button')!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(router.currentRoute.value.path).toBe('/note/one');
  allowLeave = true;
  trigger.click();
  await nextTick();
  document.querySelector<HTMLButtonElement>('.note-inline-tags__list button')!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(router.currentRoute.value.path).toBe('/tag/tag%2Fone');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it.each([0.9, 1, 1.1])('reserves fractional chip widths in layout pixels at zoom %s', async (zoom) => {
  document.documentElement.style.zoom = String(zoom);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return { width: (this.classList.contains('resource-tag-chip') ? 60.2 : 30.2) * zoom } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(127);
  // The rounded DOM width used before the fix loses the fractional space.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60);
  const host = document.createElement('div');
  document.body.append(host);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  const app = createApp({
    render: () =>
      h(NoteInlineTags, {
        tags: [
          { id: 'one', name: '轻笺待办' },
          { id: 'two', name: '轻笺历史' },
        ],
      }),
  });
  app.use(router);
  app.use(
    createI18n({ legacy: false, locale: 'zh', messages: { zh: { noteDetail: { tagsWithCount: '标签（{count}）' } } } }),
  );
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await nextTick();
  await nextTick();
  expect(host.querySelector<HTMLElement>('.note-inline-tags')!.style.width).toBe('127px');
  expect(host.querySelectorAll('.note-inline-tags__chip')).toHaveLength(2);
});
