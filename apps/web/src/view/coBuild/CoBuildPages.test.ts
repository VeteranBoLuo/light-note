import { createApp, h, KeepAlive, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
import type { FeatureRequestDetail } from '@/api/featureRequestApi';

const mocks = vi.hoisted(() => ({
  publicList: vi.fn(),
  mine: vi.fn(),
  admin: vi.fn(),
  detail: vi.fn(),
  vote: vi.fn(),
  updateProgress: vi.fn(),
  reply: vi.fn(),
  review: vi.fn(),
  edit: vi.fn(),
  merge: vi.fn(),
  addition: vi.fn(),
  deleteUpdate: vi.fn(),
  success: vi.fn(),
  confirm: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@/store', async () => {
  const { reactive } = await import('vue');
  const user = reactive({ id: 'account-a', role: 'root' });
  const bookmark = reactive({ isMobile: false, isDesktop: true, isTablet: false, openAuthModal: mocks.auth });
  return { useUserStore: () => user, bookmarkStore: () => bookmark };
});
vi.mock('@/api/featureRequestApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/featureRequestApi')>()),
  listPublicFeatureRequests: mocks.publicList,
  listMyFeatureRequests: mocks.mine,
  listAdminFeatureRequests: mocks.admin,
  getFeatureRequestDetail: mocks.detail,
  toggleFeatureRequestVote: mocks.vote,
  updateFeatureRequestProgress: mocks.updateProgress,
  replyFeatureRequest: mocks.reply,
  reviewFeatureRequest: mocks.review,
  editFeatureRequest: mocks.edit,
  mergeFeatureRequest: mocks.merge,
  addFeatureRequestUpdate: mocks.addition,
  deleteFeatureRequestUpdate: mocks.deleteUpdate,
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: mocks.success } }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: mocks.confirm } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
vi.mock('./FeatureRequestFormModal.vue', () => ({
  default: {
    props: ['visible', 'official'],
    emits: ['saved', 'update:visible'],
    template:
      '<div v-if="visible" class="submit-dialog">{{ official ? "发布官方规划" : "提交产品建议" }}<button @click="$emit(\'saved\')">模拟保存</button></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    inheritAttrs: false,
    props: ['value', 'options', 'disabled'],
    emits: ['update:value', 'change'],
    template:
      '<select v-bind="$attrs" :value="value" :disabled="disabled" @change="$emit(\'update:value\', $event.target.value); $emit(\'change\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
}));
vi.mock('@/components/base/BasicComponents/BActionMenu.vue', () => ({
  default: {
    props: ['items', 'disabled'],
    emits: ['select'],
    template:
      '<div><slot/><button v-for="item in items" :key="item.key" :disabled="disabled" @click="$emit(\'select\', item.key)">{{ item.label }}</button></div>',
  },
}));

import CoBuildPage from './CoBuildPage.vue';
import CoBuildDetail from './CoBuildDetail.vue';
import { bookmarkStore, useUserStore } from '@/store';

const summary = { evaluating: 2, planned: 1, in_progress: 1, released: 1, declined: 1 };
function entry(id = 'a', overrides: Partial<FeatureRequestDetail> = {}): FeatureRequestDetail {
  return {
    id,
    title: `需求${id}`,
    content: `需求${id}的完整使用场景和预期结果`,
    sourceType: 'user',
    category: 'bookmark',
    showIdentity: false,
    moderationStatus: 'published',
    progressStatus: 'planned',
    voteCount: 21,
    viewerIsOwner: false,
    viewerVoted: false,
    createTime: '2026-11-02 10:00:00',
    updateTime: '2026-11-04 11:00:00',
    developerReply: '已纳入计划',
    updates: [{ id: 'submitted', type: 'submitted', actorType: 'submitter', createTime: '2026-11-02 10:00:00' }],
    ...overrides,
  };
}
function response(data: unknown) {
  return { status: 200, data };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
    await nextTick();
  }
}
let cleanup: (() => void) | undefined;
async function mount(path = '/co-build', keepAlive = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/co-build', name: 'coBuild', component: CoBuildPage },
      { path: '/co-build/:id', name: 'coBuildDetail', component: CoBuildDetail },
    ],
  });
  await router.push(path);
  const app = createApp({
    render: () =>
      keepAlive
        ? h(RouterView, null, {
            default: ({ Component }: { Component: unknown }) =>
              h(KeepAlive, { include: ['CoBuildPage'] }, { default: () => h(Component as Parameters<typeof h>[0]) }),
          })
        : h(RouterView),
  });
  app.use(router);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => app.unmount();
  await settle();
  return { host, router };
}
function button(host: HTMLElement, text: string) {
  const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(match, `button ${text}`).toBeDefined();
  return match!;
}
async function select(host: HTMLElement, label: string, value: string) {
  const control = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  expect(control).not.toBeNull();
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}
async function tab(host: HTMLElement, label: string) {
  const target = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((item) =>
    item.textContent?.trim().startsWith(label),
  );
  expect(target).toBeDefined();
  target!.click();
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(useUserStore(), { id: 'account-a', role: 'root' });
  Object.assign(bookmarkStore(), { isMobile: false, isDesktop: true, isTablet: false });
  mocks.publicList.mockResolvedValue(response({ items: [entry()], total: 1, summary }));
  mocks.mine.mockResolvedValue(response({ items: [], total: 0 }));
  mocks.admin.mockResolvedValue(response({ items: [], total: 0 }));
  mocks.detail.mockImplementation((id: string) => Promise.resolve(response(entry(id))));
  mocks.vote.mockResolvedValue(response({ voted: true, voteCount: 22 }));
  for (const mock of [
    mocks.updateProgress,
    mocks.reply,
    mocks.review,
    mocks.edit,
    mocks.merge,
    mocks.addition,
    mocks.deleteUpdate,
  ])
    mock.mockResolvedValue(response({}));
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('共建需求列表', () => {
  it('状态统计沿用全局汇总，筛选结果数量单独展示', async () => {
    const { host } = await mount();
    const all = () =>
      [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent?.includes('全部'))!;
    expect(all().textContent).toMatch(/全部\s*6/);
    mocks.publicList.mockResolvedValue(response({ items: [entry()], total: 1, summary }));
    await select(host, '所属模块', 'bookmark');
    expect(mocks.publicList).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentPage: 1, filters: expect.objectContaining({ category: 'bookmark' }) }),
    );
    expect(all().textContent).toMatch(/全部\s*6/);
    expect(host.querySelector('.board-footer')?.textContent).toContain('共 1 条建议');
    await tab(host, '已上线');
    expect(mocks.publicList).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ progressStatus: 'released' }) }),
    );
  });
  it('支持按钮不触发详情导航，并阻止未完成请求的重复投票', async () => {
    const pending = deferred();
    mocks.vote.mockReturnValue(pending.promise);
    const { host, router } = await mount();
    const vote = host.querySelector<HTMLButtonElement>('[aria-pressed="false"]')!;
    vote.click();
    vote.click();
    await settle();
    expect(mocks.vote).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/co-build');
    expect(vote.disabled).toBe(true);
    pending.resolve(response({ voted: true, voteCount: 22 }));
    await settle();
    expect(vote.getAttribute('aria-pressed')).toBe('true');
    expect(vote.textContent).toContain('22');
    expect(vote.disabled).toBe(false);
    host.querySelector<HTMLAnchorElement>('.request-link')!.click();
    await settle();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/co-build/a'));
  });
  it('投票期间切换筛选时回读最新结果，旧查询不能冲掉投票回执', async () => {
    const voting = deferred(),
      staleQuery = deferred();
    const { host } = await mount();
    mocks.vote.mockReturnValueOnce(voting.promise);
    host.querySelector<HTMLButtonElement>('.vote-button')!.click();
    await settle();
    mocks.publicList
      .mockReturnValueOnce(staleQuery.promise)
      .mockResolvedValue(response({ items: [entry('a', { viewerVoted: true, voteCount: 23 })], total: 1, summary }));
    await tab(host, '已计划');
    voting.resolve(response({ voted: true, voteCount: 22 }));
    await settle();
    staleQuery.resolve(response({ items: [entry()], total: 1, summary }));
    await settle();
    expect(host.querySelector('.vote-button')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.vote-button')?.textContent).toContain('23');
  });
  it('较晚到达的旧筛选响应不能覆盖新结果', async () => {
    const old = deferred();
    mocks.publicList
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(response({ items: [entry('new')], total: 1, summary }));
    const { host } = await mount();
    await tab(host, '已计划');
    expect(host.textContent).toContain('需求new');
    old.resolve(response({ items: [entry('old')], total: 1, summary }));
    await settle();
    expect(host.textContent).toContain('需求new');
    expect(host.textContent).not.toContain('需求old');
  });
  it('身份降级即移除管理入口、私有结果和迟到的管理响应', async () => {
    const pending = deferred();
    mocks.admin.mockReturnValue(pending.promise);
    const { host } = await mount();
    await tab(host, '管理建议');
    Object.assign(useUserStore(), { id: '', role: 'visitor' });
    await settle();
    pending.resolve(response({ items: [entry('private', { moderationStatus: 'pending_review' })], total: 1 }));
    await settle();
    expect(host.textContent).not.toContain('需求private');
    expect(host.textContent).not.toContain('管理建议');
    expect(host.textContent).not.toContain('发布官方规划');
    host.querySelector<HTMLButtonElement>('.vote-button')!.click();
    expect(mocks.auth).toHaveBeenCalled();
    expect(mocks.vote).not.toHaveBeenCalled();
  });
  it('空态和失败态有不同含义，重试能够恢复列表', async () => {
    mocks.publicList
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce(response({ items: [], total: 0, summary: {} }));
    const { host } = await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('加载失败');
    expect(host.textContent).not.toContain('还没有公开的建议');
    button(host, '重新加载').click();
    await settle();
    expect(host.textContent).toContain('还没有公开的建议');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it('从详情返回保留已应用的筛选，并刷新缓存列表的投票结果', async () => {
    const { host, router } = await mount('/co-build', true);
    await tab(host, '已计划');
    host.querySelector<HTMLAnchorElement>('.request-link')!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/co-build/a'));
    await settle();
    mocks.publicList.mockResolvedValue(
      response({ items: [entry('a', { viewerVoted: true, voteCount: 22 })], total: 1, summary }),
    );
    await router.push('/co-build');
    await settle();
    expect(mocks.publicList).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ progressStatus: 'planned' }) }),
    );
    expect(host.querySelector('.vote-button')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.vote-button')?.textContent).toContain('22');
  });
  it('移动端保留完整进度筛选，普通用户不显示开发者入口', async () => {
    Object.assign(useUserStore(), { role: 'user' });
    Object.assign(bookmarkStore(), { isMobile: true, isDesktop: false });
    const { host } = await mount();
    expect(host.textContent).not.toContain('管理建议');
    expect(host.textContent).not.toContain('发布官方规划');
    await select(host, '全部进度', 'declined');
    expect(mocks.publicList).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ progressStatus: 'declined' }) }),
    );
    button(host, '提交').click();
    await settle();
    expect(host.querySelector('.submit-dialog')?.textContent).toContain('提交产品建议');
    button(host, '模拟保存').click();
    await settle();
    expect(mocks.mine).toHaveBeenCalled();
  });
});

describe('共建建议详情', () => {
  it('开发者处理区收起不丢草稿，也不会自动提交，保存才写入', async () => {
    const { host } = await mount('/co-build/a');
    await select(host, '产品进度', 'in_progress');
    button(host, '收起').click();
    await settle();
    expect(mocks.updateProgress).not.toHaveBeenCalled();
    button(host, '展开').click();
    await settle();
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="产品进度"]')!.value).toBe('in_progress');
    button(host, '保存进度').click();
    await settle();
    expect(mocks.updateProgress).toHaveBeenCalledWith('a', 'in_progress', '');
    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.request-article h1')?.textContent).toBe('需求a');
  });
  it('投票和开发者保存互斥，完成后两种操作都会恢复可用', async () => {
    const voting = deferred(),
      saving = deferred();
    const { host } = await mount('/co-build/a');
    mocks.vote.mockReturnValueOnce(voting.promise);
    host.querySelector<HTMLButtonElement>('.support-button')!.click();
    await settle();
    expect(button(host, '保存进度').disabled).toBe(true);
    voting.resolve(response({ voted: true, voteCount: 22 }));
    await settle();
    expect(button(host, '保存进度').disabled).toBe(false);
    mocks.updateProgress.mockReturnValueOnce(saving.promise);
    button(host, '保存进度').click();
    await settle();
    expect(host.querySelector<HTMLButtonElement>('.support-button')!.disabled).toBe(true);
    saving.resolve(response({}));
    await settle();
    expect(host.querySelector<HTMLButtonElement>('.support-button')!.disabled).toBe(false);
  });
  it('只有普通作者的待审/公开建议可以补充，已合并后移除入口', async () => {
    Object.assign(useUserStore(), { role: 'user' });
    mocks.detail.mockResolvedValueOnce(
      response(entry('a', { moderationStatus: 'pending_review', viewerIsOwner: true })),
    );
    const { host, router } = await mount('/co-build/a');
    expect(host.textContent).toContain('补充说明');
    expect(host.textContent).not.toContain('开发者处理');
    expect(host.querySelector('.support-button')).toBeNull();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '这是补充后的场景';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    button(host, '补充说明').click();
    await settle();
    expect(mocks.addition).toHaveBeenCalledWith('a', '这是补充后的场景');
    mocks.detail.mockResolvedValueOnce(
      response(entry('b', { moderationStatus: 'merged', viewerIsOwner: true, mergedTo: { id: 'a', title: '需求a' } })),
    );
    await router.push('/co-build/b');
    await settle();
    expect(host.querySelector('.addition-panel')).toBeNull();
    expect(host.textContent).toContain('查看合并后的需求');
  });
  it('切换建议时旧内容保留，但旧操作被禁用，迟到响应不能覆盖新建议', async () => {
    const pendingB = deferred();
    const { host, router } = await mount('/co-build/a');
    mocks.detail.mockImplementation((id: string) =>
      id === 'b' ? pendingB.promise : Promise.resolve(response(entry(id))),
    );
    await router.push('/co-build/b');
    await settle();
    expect(host.querySelector('.request-article h1')?.textContent).toBe('需求a');
    expect(host.querySelector<HTMLButtonElement>('.support-button')?.disabled).toBe(true);
    await router.push('/co-build/c');
    await settle();
    pendingB.resolve(response(entry('b')));
    await settle();
    expect(host.querySelector('.request-article h1')?.textContent).toBe('需求c');
  });
  it('合并确认绑定原建议，导航后不能对另一条需求执行旧确认', async () => {
    const { host, router } = await mount('/co-build/a');
    await tab(host, '合并需求');
    const input = host.querySelector<HTMLInputElement>('input[placeholder="目标需求 ID"]')!;
    input.value = 'target';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    button(host, '确认合并').click();
    await settle();
    const confirm = mocks.confirm.mock.calls[0][0];
    await router.push('/co-build/b');
    await settle();
    await confirm.onOk();
    await settle();
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it('临时网络失败保留详情和重试入口，不误报不存在', async () => {
    const { host } = await mount('/co-build/a');
    mocks.detail.mockRejectedValueOnce(new Error('offline'));
    button(host, '保存进度').click();
    await settle();
    expect(host.querySelector('.request-article h1')?.textContent).toBe('需求a');
    expect(host.textContent).toContain('详情加载失败');
    expect(host.textContent).not.toContain('这条建议不存在');
    button(host, '重新加载').click();
    await settle();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
