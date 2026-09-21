import { createApp, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), user: null as any }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.post }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: (user: any) => user.id }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/base/BasicComponents/BPopover.vue', () => ({
  default: {
    props: ['open', 'disabled'],
    emits: ['update:open'],
    template: `<div><div @click="!disabled && $emit('update:open', !open)"><slot /></div><div v-if="open" class="panel"><slot name="content" /></div></div>`,
  },
}));
import Location from './CommunityNoteLocation.vue';
const tree = {
  status: 200,
  data: {
    maxDepth: 3,
    items: [
      {
        id: 'parent',
        parentId: null,
        title: '开发文档',
        children: [
          {
            id: 'child',
            parentId: 'parent',
            title: 'PC',
            children: [{ id: 'leaf', parentId: 'child', title: '深层页面' }],
          },
        ],
      },
    ],
  },
};
let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick();
};
beforeEach(() => {
  mocks.user = reactive({ id: 'owner' });
  mocks.post.mockResolvedValue(tree);
});
afterEach(() => {
  cleanup();
  mocks.post.mockReset();
});
async function mount() {
  const host = document.createElement('div');
  const selected = vi.fn();
  const app = createApp(Location, { 'onUpdate:value': selected });
  app.mount(host);
  cleanup = () => app.unmount();
  const click = async (selector: string) => {
    (host.querySelector(selector) as HTMLButtonElement).click();
    await flush();
  };
  await click('.note-location-trigger');
  return { host, selected, click };
}
it('expands children in place, selects their ID and displays the complete path on the trigger', async () => {
  const { host, selected, click } = await mount();
  expect(mocks.post).toHaveBeenCalledWith(
    '/api/note/queryNoteTree',
    { parentId: null, depth: 'all' },
    { silent: true },
  );
  expect(host.textContent).not.toContain('PC');
  await click('.note-location-expand');
  expect(selected).not.toHaveBeenCalled();
  expect(host.textContent).toContain('PC');
  await click('.note-location-row:nth-of-type(2) .note-location-choice');
  expect(selected).toHaveBeenLastCalledWith('child');
  expect(host.querySelector('.note-location-trigger')?.textContent).toContain('开发文档 / PC');
  expect(host.querySelector('.panel')).toBeNull();
  await click('.note-location-trigger');
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await click('.note-location-panel > .note-location-choice');
  expect(selected).toHaveBeenLastCalledWith('');
});
it('disables destinations at the depth limit while still allowing their parents', async () => {
  const { host, click } = await mount();
  await click('.note-location-expand');
  await click('.note-location-row:nth-of-type(2) .note-location-expand');
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.note-location-choice'));
  expect(buttons.find((button) => button.textContent?.includes('深层页面'))?.disabled).toBe(true);
  expect(buttons.find((button) => button.textContent?.trim() === 'PC')?.disabled).toBe(false);
});
it('offers retry after failure and never treats failure as an empty tree', async () => {
  mocks.post.mockRejectedValueOnce(new Error('offline'));
  const { host, click } = await mount();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click('.note-location-error button');
  expect(host.textContent).toContain('开发文档');
});
it('discards a pending tree when the account changes', async () => {
  let resolve!: (value: any) => void;
  mocks.post.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { host, click } = await mount();
  mocks.user.id = 'another';
  await flush();
  resolve(tree);
  await flush();
  expect(host.textContent).not.toContain('开发文档');
  mocks.post.mockResolvedValue({ status: 200, data: { items: [], maxDepth: 3 } });
  await click('.note-location-trigger');
  expect(host.textContent).not.toContain('开发文档');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
