import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
const mocks = vi.hoisted(() => ({ selection: null as any, user: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/store/resourceSelection', () => ({ useResourceSelectionStore: () => mocks.selection }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: {
    props: ['open', 'title', 'actions'],
    emits: ['update:open', 'action'],
    setup:
      (props: any, { emit }: any) =>
      () =>
        h(
          'div',
          props.actions.map((action: any) =>
            h(
              'button',
              {
                disabled: action.disabled,
                onClick: () => {
                  emit('update:open', false);
                  emit('action', action);
                },
              },
              action.label,
            ),
          ),
        ),
  },
}));
import Drawer from './ResourceBatchActionsDrawer.vue';
import { projectResourceHandoff } from '@/composables/useProjectResourceAction';
let app: App, host: HTMLDivElement;
const action = vi.fn(),
  open = vi.fn();
beforeEach(() => {
  mocks.user = reactive({ id: 'owner', role: 'user', adminContext: null, visitorWorkspace: null });
  mocks.selection = reactive({ module: 'notes', items: [], busy: false, query: null });
  action.mockClear();
  open.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(Drawer, {
    open: true,
    title: 'Batch',
    selectionModule: 'notes',
    actions: [{ key: 'delete', label: 'Delete' }],
    onAction: action,
    'onUpdate:open': open,
  });
  app.mount(host);
});
afterEach(() => {
  app.unmount();
  host.remove();
  projectResourceHandoff.value = null;
});
const join = () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'toolbox.project.join');
it('keeps join visible but disabled for an empty selection, then hands selected resources to the project dialog', async () => {
  expect(join()?.disabled).toBe(true);
  mocks.selection.items = [{ type: 'note', id: 'note-1', title: 'One' }];
  await nextTick();
  expect(join()?.disabled).toBe(false);
  join()!.click();
  expect(open).toHaveBeenCalledWith(false);
  expect(projectResourceHandoff.value).toMatchObject({
    entrySource: 'resource_batch',
    resources: [{ type: 'note', id: 'note-1' }],
  });
  expect(action).not.toHaveBeenCalled();
});
it.each(['busy', 'query'])('blocks joining an unresolved %s selection', async (key) => {
  mocks.selection.items = [{ type: 'note', id: 'note-1' }];
  mocks.selection[key] = key === 'busy' ? true : {};
  await nextTick();
  expect(join()?.disabled).toBe(true);
  join()!.click();
  expect(projectResourceHandoff.value).toBeNull();
});
it('does not use another page’s selection or a visitor identity', async () => {
  mocks.selection.module = 'files';
  await nextTick();
  expect(join()).toBeUndefined();
  mocks.selection.module = 'notes';
  mocks.user.role = 'visitor';
  await nextTick();
  expect(join()).toBeUndefined();
});
it('forwards the existing page actions unchanged', () => {
  [...host.querySelectorAll('button')].find((button) => button.textContent === 'Delete')!.click();
  expect(action).toHaveBeenCalledWith({ key: 'delete', label: 'Delete' });
});
