import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { publicResourcesZh } from '@/i18n/locales/publicResources';
const mocks = vi.hoisted(() => ({
  scope: {} as any,
  get: vi.fn(),
  preview: vi.fn(),
  changed: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({
  publicGet: (...args: any[]) => mocks.get(...args),
  previewPublication: (...args: any[]) => mocks.preview(...args),
}));
import PublicationInspector from './PublicationInspector.vue';
let app: ReturnType<typeof createApp>, host: HTMLElement;
const publication = (extra: any = {}) => ({
  publicId: 'pub',
  kind: 'note',
  sourceId: 'private',
  title: '标题',
  version: 2,
  status: 'published',
  publishedRevision: 1,
  latestRevision: 1,
  aiCompleted: false,
  ...extra,
});
const target = ref<any>(null);
const flush = async () => {
  for (let i = 0; i < 15; i++) await nextTick();
};
async function mount(extra: Record<string, unknown> = {}) {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(PublicationInspector, { item: target.value, onChanged: mocks.changed, onRefresh: mocks.refresh, ...extra }),
  });
  app.use(
    createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { publicResources: publicResourcesZh } } }),
  );
  app.directive('auto-scrollbar', {});
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = reactive({ identity: 'one', eligible: true, caps: { submissionsEnabled: true } });
  target.value = {
    kind: 'note',
    sourceId: 'private',
    title: '标题',
    updatedAt: 'one',
    sourceUnavailable: false,
    publication: publication(),
  };
  mocks.get.mockResolvedValue({
    version: 2,
    revisions: [{ revision: 1, title: '公开标题', body: '旧公开内容', fingerprint: 'same' }],
  });
  mocks.preview.mockResolvedValue({ fingerprint: 'same', kind: 'note', title: '原稿标题', body: '最新私人原稿' });
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('以材料指纹核对修改，时间、标签等变化不冒充内容变化；不制造空版本页签', async () => {
  await mount();
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(host.textContent).not.toContain(publicResourcesZh.changed);
  expect(mocks.changed).toHaveBeenLastCalledWith('note:private', false);
  mocks.preview.mockResolvedValue({ fingerprint: 'different', kind: 'note', title: '原稿标题', body: '修改后的原稿' });
  target.value = { ...target.value, updatedAt: 'two' };
  await flush();
  expect(host.textContent).toContain(publicResourcesZh.changed);
  expect(host.textContent).toContain('修改后的原稿');
});
it('首次待审称撤回提交，有旧公开版才称取消公开并提供两个真实版本', async () => {
  target.value.publication = publication({
    publishedRevision: null,
    latestRevision: 1,
    status: 'pending_review',
    pendingRevision: 1,
  });
  await mount();
  expect(host.textContent).toContain(publicResourcesZh.workspace.cancelSubmission);
  expect(host.textContent).not.toContain(publicResourcesZh.workspace.cancelPublic);
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
  mocks.get.mockResolvedValue({
    version: 2,
    revisions: [
      { revision: 1, body: '旧公开内容' },
      { revision: 2, body: '本次提交' },
    ],
  });
  target.value = {
    ...target.value,
    publication: publication({
      latestRevision: 2,
      status: 'pending_review',
      pendingRevision: 2,
      oldVersionPublic: true,
    }),
  };
  await flush();
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(host.textContent).toContain(publicResourcesZh.workspace.cancelPublic);
  expect(host.textContent).not.toContain(publicResourcesZh.aiCompleted);
});
it('下架和原稿不可用时禁止重提，仍显示原因且不再读取原稿预览', async () => {
  target.value = {
    ...target.value,
    sourceUnavailable: true,
    publication: publication({ status: 'removed', publishedRevision: null, reason: '需核实来源' }),
  };
  await mount();
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(host.textContent).toContain('需核实来源');
  expect(host.textContent).not.toContain(publicResourcesZh.workspace.submitAgain);
  expect(host.querySelector('button')?.disabled).toBe(true);
});

it('元数据与详情版本不同要求刷新，不能展示空版本或继续读取旧状态原稿', async () => {
  mocks.get.mockResolvedValue({ version: 3, revisions: [{ revision: 2, body: '新状态正文' }] });
  await mount();
  expect(host.textContent).toContain(publicResourcesZh.versionConflict);
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(0);
  expect(mocks.preview).not.toHaveBeenCalled();
  [...host.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === publicResourcesZh.batch.refreshState)!
    .click();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it('仅保留一个预览入口，优先展示当前原稿，提交记录独立显示', async () => {
  await mount();
  expect(host.textContent).toContain('最新私人原稿');
  expect(host.textContent).not.toContain('旧公开内容');
  expect(host.textContent).toContain(publicResourcesZh.workspace.previewDraftHint);
  const tabs = () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
  expect(tabs().map((element) => element.textContent?.trim())).toEqual([
    publicResourcesZh.workspace.preview,
    publicResourcesZh.workspace.records,
  ]);
  tabs()
    .find((element) => element.textContent?.trim() === publicResourcesZh.workspace.records)!
    .click();
  await flush();
  expect(host.textContent).toContain('公开标题');
  expect(host.textContent).not.toContain('最新私人原稿');
  tabs()
    .find((element) => element.textContent?.trim() === publicResourcesZh.workspace.preview)!
    .click();
  await flush();
  expect(host.textContent).toContain('最新私人原稿');
});
it('原稿暂时读取失败时预览最近提交材料，保留单个入口并说明来源', async () => {
  mocks.preview.mockRejectedValueOnce({ code: 'PUBLIC_RESOURCE_UNAVAILABLE' });
  target.value.publication = publication({ latestRevision: 2 });
  mocks.get.mockResolvedValue({
    version: 2,
    revisions: [
      { revision: 1, title: '公开标题', body: '旧公开内容' },
      { revision: 2, title: '新提交标题', body: '最近提交内容' },
    ],
  });
  await mount();
  expect(host.textContent).toContain('最近提交内容');
  expect(host.textContent).not.toContain('旧公开内容');
  expect(host.textContent).toContain(publicResourcesZh.workspace.previewSubmittedHint);
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
});
it('快速切换公开条目取消旧详情，迟到响应不能替换当前快照', async () => {
  let finish!: (value: any) => void;
  mocks.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  const previousSignal = mocks.get.mock.calls[0][2] as AbortSignal;
  target.value = { ...target.value, sourceId: 'second', publication: publication({ publicId: 'second-public' }) };
  await flush();
  expect(previousSignal.aborted).toBe(true);
  expect(host.textContent).toContain('最新私人原稿');
  finish({ version: 2, revisions: [{ revision: 1, title: '旧条目', body: '过期响应正文' }] });
  await flush();
  expect(host.textContent).not.toContain('过期响应正文');
  expect(mocks.changed).toHaveBeenLastCalledWith('note:second', false);
});

it('集成预览中不支持重提的原稿仍可撤回已有公开版', async () => {
  target.value = { ...target.value, sourceUnavailable: true };
  const withdraw = vi.fn();
  await mount({ integrated: true, onWithdraw: withdraw });
  const cancel = [...host.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === publicResourcesZh.workspace.cancelPublic,
  )!;
  expect(cancel).toBeTruthy();
  expect(cancel.disabled).toBe(false);
  cancel.click();
  expect(withdraw).toHaveBeenCalledOnce();
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain(publicResourcesZh.workspace.submitUpdate);
});
