import { createApp, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NoteWorkspaceShell from './NoteWorkspaceShell.vue';
import { NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH } from '@/utils/noteWorkspaceLayout';
import message from '@/components/base/BasicComponents/BMessage/BMessage';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { info: vi.fn() } }));
const key = 'light-note:note-sidebar-resize-hint-shown';
let app: ReturnType<typeof createApp>;
let host: HTMLElement;
const width = ref(280);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  width.value = 280;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(NoteWorkspaceShell, {
        forceDockedPanels: true,
        sidebarWidth: width.value,
        'onUpdate:sidebarWidth': (value: number) => {
          width.value = value;
        },
      }),
  });
  app.mount(host);
});
afterEach(() => {
  app.unmount();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function pointer(type: string, x = 100) {
  const target = type === 'pointerdown' ? host.querySelector('.note-workspace-shell__resizer')! : document;
  const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
  await nextTick();
}
async function drag() {
  await pointer('pointerdown');
  await pointer('pointermove', 130);
  await pointer('pointerup', 130);
}
it('首次改变宽度后松手提示，并记住后续拖动', async () => {
  await pointer('pointerdown');
  await pointer('pointermove', 130);
  expect(message.info).not.toHaveBeenCalled();
  await pointer('pointerup', 130);
  expect(message.info).toHaveBeenCalledWith('note.pageSidebarResizedHint', 2);
  expect(localStorage.getItem(key)).toBe('1');
  await drag();
  expect(message.info).toHaveBeenCalledTimes(1);
});
it('已有本地标记时不再提示', async () => {
  localStorage.setItem(key, '1');
  await drag();
  expect(message.info).not.toHaveBeenCalled();
});
it('点击、拖回原位与取消不消耗提示', async () => {
  await pointer('pointerdown');
  await pointer('pointerup');
  await pointer('pointerdown');
  await pointer('pointermove', 130);
  await pointer('pointermove', 100);
  await pointer('pointerup');
  await pointer('pointerdown');
  await pointer('pointermove', 130);
  await pointer('pointercancel');
  await pointer('pointerup');
  expect(message.info).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBeNull();
  await drag();
  expect(message.info).toHaveBeenCalledTimes(1);
});
it('存储不可用也能拖动且当前页面不重复提示', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  await drag();
  await drag();
  expect(width.value).toBe(340);
  expect(message.info).toHaveBeenCalledTimes(1);
});
it('双击仍恢复默认宽度且不消耗引导', async () => {
  width.value = 330;
  await nextTick();
  host.querySelector('.note-workspace-shell__resizer')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  expect(width.value).toBe(NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH);
  expect(message.info).not.toHaveBeenCalled();
});
it('卸载不会触发引导', async () => {
  await pointer('pointerdown');
  await pointer('pointermove', 130);
  app.unmount();
  await pointer('pointerup');
  expect(message.info).not.toHaveBeenCalled();
});
