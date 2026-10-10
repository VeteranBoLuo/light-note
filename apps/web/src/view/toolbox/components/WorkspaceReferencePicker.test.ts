import { createApp, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import Picker from './WorkspaceReferencePicker.vue';
const getTodos = vi.hoisted(() => vi.fn());
vi.mock('@/api/todoApi', () => ({ getTodoWorkspace: getTodos }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({ default: { template: '<div />' } }));
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick();
};
let cleanup = () => {};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  getTodos.mockReset();
});
it('automatically appends one page at a time and stops on failure until explicit retry', async () => {
  let intersect!: () => void;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  const page = (items: any[], nextCursor: string | null) => ({ status: 200, data: { items, nextCursor } });
  getTodos.mockResolvedValueOnce(page([{ id: 'a', title: 'First task', status: 'pending' }], 'next'));
  const host = document.createElement('div');
  const app = createApp(Picker, { kind: 'todo', resources: [], evidence: [] });
  app.mount(host);
  cleanup = () => app.unmount();
  await flush();
  let reject!: (error: Error) => void;
  getTodos.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  intersect();
  intersect();
  expect(getTodos).toHaveBeenCalledTimes(2);
  expect(getTodos.mock.calls[1][0]).toMatchObject({ cursor: 'next', status: 'pending', keyword: '' });
  reject(new Error('offline'));
  await flush();
  expect(host.textContent).toContain('First task');
  expect(host.textContent).toContain('toolbox.itemDetail.pickerFailed');
  intersect();
  expect(getTodos).toHaveBeenCalledTimes(2);
  getTodos.mockResolvedValueOnce(page([{ id: 'b', title: 'Second task', status: 'pending' }], null));
  [...host.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('toolbox.itemDetail.retryPicker'))!
    .click();
  await flush();
  expect(host.textContent).toContain('First task');
  expect(host.textContent).toContain('Second task');
  expect(getTodos).toHaveBeenCalledTimes(3);
});
