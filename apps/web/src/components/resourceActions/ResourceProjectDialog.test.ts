import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), add: vi.fn(), push: vi.fn(), user: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/api/toolbox', () => ({
  fetchToolboxWorkspaces: mocks.list,
  createToolboxWorkspace: mocks.create,
  addToolboxWorkspaceResources: mocks.add,
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value'],
    emits: ['update:value'],
    setup:
      (p: any, { emit }: any) =>
      () =>
        h('input', { value: p.value, onInput: (e: any) => emit('update:value', e.target.value) }),
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    emits: ['update:value'],
    setup:
      (p: any, { emit }: any) =>
      () =>
        h(
          'select',
          { value: p.value, onChange: (e: any) => emit('update:value', e.target.value) },
          p.options?.map((o: any) => h('option', { value: o.value }, o.label)),
        ),
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    setup:
      (p: any, { slots }: any) =>
      () =>
        h('button', { disabled: p.disabled || p.loading }, slots.default?.()),
  },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { render: () => h('span') } }));
import Dialog from './ResourceProjectDialog.vue';
import { projectResourceHandoff, useProjectResourceAction } from '@/composables/useProjectResourceAction';
let app: App, host: HTMLDivElement;
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}
function button(key: string) {
  return [...host.querySelectorAll('button')].find((b) => b.textContent === key)!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'owner', role: 'user', adminContext: null, visitorWorkspace: null });
  mocks.list.mockResolvedValue([]);
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host.remove();
  projectResourceHandoff.value = null;
});
async function mount() {
  useProjectResourceAction().joinProject([{ type: 'note', id: 'parent-note', title: 'Parent' }]);
  app = createApp(Dialog, { handoff: projectResourceHandoff.value! });
  app.mount(host);
  await settle();
}
describe('project join workflow', () => {
  it('retains a newly created project on join failure and retries only the explicit resource', async () => {
    mocks.create.mockResolvedValue({ id: 'created', title: 'New', kind: 'research', status: 'active' });
    mocks.add.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ id: 'created' });
    await mount();
    button('toolbox.project.newProject').click();
    await nextTick();
    const input = host.querySelectorAll('input')[1];
    input.value = 'New';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    button('toolbox.project.createThenJoin').click();
    await settle();
    expect(host.textContent).toContain('toolbox.project.joinFailed');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    button('toolbox.project.join').click();
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.add.mock.calls[1]).toEqual([
      'created',
      [{ type: 'note', id: 'parent-note', title: 'Parent' }],
      'resource_menu',
    ]);
    expect(host.textContent).toContain('toolbox.project.added');
  });
  it('does not show completed or archived projects as selectable targets', async () => {
    mocks.list.mockResolvedValue(
      ['active', 'paused', 'completed', 'archived'].map((status) => ({ id: status, title: status, status })),
    );
    await mount();
    const choices = host.querySelectorAll('select')[1];
    expect(choices.textContent).toBe('active');
    const status = host.querySelectorAll('select')[0];
    status.value = 'paused';
    status.dispatchEvent(new Event('change'));
    await nextTick();
    expect(choices.textContent).toBe('paused');
  });
  it('disables joining when filters hide the selected project and enables it when restored', async () => {
    mocks.list.mockResolvedValue([{ id: 'active', title: 'Project', status: 'active' }]);
    await mount();
    const choices = host.querySelectorAll('select')[1];
    choices.value = 'active';
    choices.dispatchEvent(new Event('change'));
    await nextTick();
    expect(button('toolbox.project.join').disabled).toBe(false);
    const search = host.querySelector('input')!;
    search.value = 'no match';
    search.dispatchEvent(new Event('input'));
    await nextTick();
    expect(button('toolbox.project.join').disabled).toBe(true);
    button('toolbox.project.join').click();
    expect(mocks.add).not.toHaveBeenCalled();
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await nextTick();
    expect(button('toolbox.project.join').disabled).toBe(false);
  });
  it('ignores a create response after account switching and never joins old materials', async () => {
    let resolve!: (value: any) => void;
    mocks.create.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await mount();
    button('toolbox.project.newProject').click();
    await nextTick();
    const input = host.querySelectorAll('input')[1];
    input.value = 'New';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    button('toolbox.project.createThenJoin').click();
    await nextTick();
    mocks.user.id = 'another';
    resolve({ id: 'created', title: 'New', status: 'active' });
    await settle();
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
