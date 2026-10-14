import { createApp, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KnowledgeMaintenanceWorkbench from './KnowledgeMaintenanceWorkbench.vue';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/api/toolbox', () => ({ fetchToolboxKnowledgeOverview: mocks.fetch }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'owner', role: 'user' }) }));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: () => 'owner' }));
vi.mock('vue-i18n', async (original) => ({
  ...(await original<object>()),
  useI18n: () => ({ t: (key: string) => key, locale: ref('en-US') }),
}));
vi.mock('vue-router', async (original) => ({
  ...(await original<object>()),
  useRoute: () => ({ fullPath: '/toolbox/knowledge_structure_audit' }),
  useRouter: () => ({ push: vi.fn(), resolve: () => ({ href: '/noteLibrary/n1' }) }),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { error: vi.fn() } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BChip.vue', () => ({ default: { template: '<button><slot /></button>' } }));
vi.mock('@/components/base/BasicComponents/BCheckbox.vue', () => ({
  default: { props: ['checked'], template: '<button @click="$emit(\'update:checked\', !checked)"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    template:
      '<select :value="value" @change="$emit(\'update:value\', $event.target.value)"><option v-for="option in options" :value="option.value">{{option.label}}</option></select>',
  },
}));
let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 20; i++) await nextTick();
};
const item = (id: string) => ({ kind: 'empty', severity: 'high', noteId: id, title: id, path: id, reason: 'empty' });
const overview = (ids: string[], total = ids.length) => ({
  scannedAt: '2026-10-14T00:00:00Z',
  snapshotVersion: 'a'.repeat(64),
  summary: { total: 10 },
  issues: ids.map(item),
  issueCounts: { empty: total },
  selectedIssueTotal: total,
  scopeOptions: [{ id: 'dir', path: 'Directory' }],
});
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(KnowledgeMaintenanceWorkbench, { toolId: 'knowledge_structure_audit' });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}
function button(host: HTMLElement, key: string) {
  return Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(key))!;
}
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => cleanup());
it('loads all issue pages using the snapshot and retains already loaded issues after a paging failure', async () => {
  mocks.fetch.mockResolvedValueOnce(overview(['n1'], 2));
  const host = mount();
  await flush();
  mocks.fetch.mockRejectedValueOnce(new Error('network'));
  button(host, 'audit.loadMore').click();
  await flush();
  expect(host.querySelectorAll('.audit-issue-list article')).toHaveLength(1);
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  mocks.fetch.mockResolvedValueOnce(overview(['n2'], 2));
  button(host, 'common.retry').click();
  await flush();
  expect(mocks.fetch.mock.lastCall?.[0]).toMatchObject({ offset: 1, snapshot: 'a'.repeat(64), limit: 50 });
  expect(host.querySelectorAll('.audit-issue-list article')).toHaveLength(2);
});
it('directory changes discard stale in-flight responses, while recheck preserves the selected scope', async () => {
  mocks.fetch.mockResolvedValueOnce(overview(['initial']));
  const host = mount();
  await flush();
  let finish!: (value: unknown) => void;
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  button(host, 'recheck').click();
  await flush();
  mocks.fetch.mockResolvedValueOnce(overview(['scoped']));
  const select = host.querySelector('select')!;
  select.value = 'dir';
  select.dispatchEvent(new Event('change'));
  await flush();
  finish(overview(['stale']));
  await flush();
  expect(host.textContent).toContain('scoped');
  expect(host.textContent).not.toContain('stale');
  mocks.fetch.mockResolvedValueOnce(overview(['fixed'], 0));
  button(host, 'recheck').click();
  await flush();
  expect(mocks.fetch.mock.lastCall?.[0]).toMatchObject({ rootId: 'dir', offset: 0 });
});
