import { afterEach, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import NoteInlineTags from './NoteInlineTags.vue';
import type { NoteTag } from '@/composables/useNoteTags';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function mountTags(
  path = '/note/one',
  tags: NoteTag[] = [{ id: 'tag/one', name: '完整标签名称' }, { name: '无标识标签' }],
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push(path);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(NoteInlineTags, { compact: true, tags }) });
  app.use(router);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh',
      messages: { zh: { noteDetail: { tagsWithCount: '标签（{count}）' }, common: { detail: '详情' } } },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span') });
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const trigger = host.querySelector<HTMLButtonElement>('.note-inline-tags__more')!;
  async function open() {
    trigger.click();
    await nextTick();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    return document.querySelector<HTMLElement>(
      '.b-popover-panel:not(.b-popover-fade-leave-active) .note-inline-tags__list',
    )!;
  }
  return { router, trigger, open };
}

const settleNavigation = () => new Promise((resolve) => setTimeout(resolve, 0));

it('标签名称按 ID 筛选笔记，保留当前范围并关闭预览', async () => {
  const { router, trigger, open } = await mountTags(
    '/noteLibrary?parent=folder&pending=1&preview=one&_rt=old&tag=previous',
  );
  const list = await open();
  expect(list.textContent).toContain('完整标签名称');
  expect(list.querySelectorAll('button')).toHaveLength(2);
  expect(list.querySelectorAll('.resource-tag-chip')).toHaveLength(2);
  list.querySelector<HTMLButtonElement>('.resource-tag-chip__label')!.click();
  await settleNavigation();
  expect(router.currentRoute.value.path).toBe('/noteLibrary');
  expect(router.currentRoute.value.query).toEqual({ parent: 'folder', pending: '1', tag: 'tag/one' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('详情角标独立跳转，路由守卫仍能阻止离开', async () => {
  const { router, trigger, open } = await mountTags();
  let allowLeave = false;
  router.beforeEach(() => allowLeave);
  let list = await open();
  list.querySelector<HTMLButtonElement>('.resource-tag-chip__detail')!.click();
  await settleNavigation();
  expect(router.currentRoute.value.path).toBe('/note/one');
  allowLeave = true;
  list = await open();
  list.querySelector<HTMLButtonElement>('.resource-tag-chip__detail')!.click();
  await settleNavigation();
  expect(router.currentRoute.value.path).toBe('/tag/tag%2Fone');
  expect(router.currentRoute.value.query).toEqual({});
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('详情页筛选不携带编辑参数，筛选也遵守离页守卫并兼容数字 ID', async () => {
  const { router, open } = await mountTags('/noteLibrary/one?from=/inbox&edit=1', [{ id: 0, name: '数字标签' }]);
  let allowLeave = false;
  router.beforeEach(() => allowLeave);
  let list = await open();
  list.querySelector<HTMLButtonElement>('.resource-tag-chip__label')!.click();
  await settleNavigation();
  expect(router.currentRoute.value.path).toBe('/noteLibrary/one');
  allowLeave = true;
  list = await open();
  list.querySelector<HTMLButtonElement>('.resource-tag-chip__label')!.click();
  await settleNavigation();
  expect(router.currentRoute.value.path).toBe('/noteLibrary');
  expect(router.currentRoute.value.query).toEqual({ tag: '0' });
});
