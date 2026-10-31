import { createApp, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NoteWorkspaceShell from './NoteWorkspaceShell.vue';
import { NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH } from '@/utils/noteWorkspaceLayout';
import { applyUiDensity } from '@/composables/useUiDensity';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let app: ReturnType<typeof createApp>;
let host: HTMLElement;
const width = ref(280);
const sidebarOpen = ref(true);
const aiOpen = ref(true);
const aiWidth = ref<number | null>(null);
const shellProps = ref<Record<string, unknown>>({});

function mount(extra: Record<string, unknown> = {}) {
  shellProps.value = extra;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(
        NoteWorkspaceShell,
        {
          forceDockedPanels: true,
          hasAi: true,
          aiResizable: true,
          sidebarWidth: width.value,
          sidebarOpen: sidebarOpen.value,
          aiOpen: aiOpen.value,
          aiWidth: aiWidth.value,
          ...shellProps.value,
          'onUpdate:sidebarWidth': (value: number) => {
            width.value = value;
          },
          'onUpdate:sidebarOpen': (value: boolean) => {
            sidebarOpen.value = value;
          },
          'onUpdate:aiOpen': (value: boolean) => {
            aiOpen.value = value;
          },
          'onUpdate:aiWidth': (value: number | null) => {
            aiWidth.value = value;
          },
        },
        {
          sidebar: ({ collapse }: { collapse: () => void }) => h('button', { class: 'test-collapse', onClick: collapse }),
        },
      ),
  });
  app.mount(host);
}

beforeEach(() => {
  width.value = 280;
  sidebarOpen.value = true;
  aiOpen.value = true;
  aiWidth.value = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom 没有布局，给工作区一个桌面宽度，右侧卡片的上限才有意义。
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1600,
    height: 900,
    top: 0,
    left: 0,
    right: 1600,
    bottom: 900,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  mount();
});
afterEach(() => {
  app.unmount();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  applyUiDensity('medium');
});

function splitter(index = 0) {
  return host.querySelectorAll<HTMLElement>('.workspace-splitter')[index]!;
}
async function pointer(type: string, x: number, index = 0) {
  const target = type === 'pointerdown' ? splitter(index) : document;
  const event = new MouseEvent(type, { clientX: x, button: 0, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
  await nextTick();
}
async function key(name: string, index = 0) {
  splitter(index).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  await nextTick();
}

it('拖动分隔条在 220–360px 内调整页面树宽度', async () => {
  await pointer('pointerdown', 100);
  await pointer('pointermove', 130);
  expect(width.value).toBe(310);
  await pointer('pointermove', 400);
  expect(width.value).toBe(360);
  await pointer('pointerup', 400);
  expect(sidebarOpen.value).toBe(true);
});

it('拖过最小宽度再多拖 48px 才收起，并恢复拖动前的宽度', async () => {
  await pointer('pointerdown', 300);
  await pointer('pointermove', 220);
  expect(width.value).toBe(220);
  expect(host.querySelector('.workspace-splitter__release')).toBeNull();
  await pointer('pointermove', 150);
  expect(host.querySelector('.workspace-splitter__release')).not.toBeNull();
  expect(host.querySelector('.note-workspace-shell__sidebar--dock')?.classList.contains('is-collapse-pending')).toBe(true);
  await pointer('pointerup', 150);
  expect(sidebarOpen.value).toBe(false);
  expect(width.value).toBe(280);
});

it('没拖到收起阈值就松手只停在最小宽度', async () => {
  await pointer('pointerdown', 300);
  await pointer('pointermove', 200);
  await pointer('pointerup', 200);
  expect(sidebarOpen.value).toBe(true);
  expect(width.value).toBe(220);
});

it('取消拖动恢复原宽度且不收起', async () => {
  await pointer('pointerdown', 300);
  await pointer('pointermove', 150);
  await pointer('pointercancel', 150);
  expect(sidebarOpen.value).toBe(true);
  expect(width.value).toBe(280);
});

it('键盘左右键调宽、Enter 收起，双击恢复默认宽度', async () => {
  await key('ArrowRight');
  expect(width.value).toBe(292);
  await key('ArrowLeft');
  await key('ArrowLeft');
  expect(width.value).toBe(268);
  splitter().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  expect(width.value).toBe(NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH);
  await key('Enter');
  expect(sidebarOpen.value).toBe(false);
});

it('侧栏插槽拿到收起动作，边框上不再有常驻收起按钮', async () => {
  expect(host.querySelector('.note-workspace-shell__sidebar-boundary-toggle--close')).toBeNull();
  expect(host.querySelector('.note-workspace-shell__ai-boundary-toggle--close')).toBeNull();
  host.querySelector<HTMLElement>('.test-collapse')!.click();
  await nextTick();
  expect(sidebarOpen.value).toBe(false);
  expect(host.querySelector('.note-workspace-shell__sidebar-boundary-toggle--open')).not.toBeNull();
});

it('右侧卡片分隔条方向相反，拖动记住实际像素，双击回到默认', async () => {
  await pointer('pointerdown', 1000, 1);
  await pointer('pointermove', 940, 1);
  expect(aiWidth.value).toBe(420);
  await pointer('pointerup', 940, 1);
  splitter(1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  expect(aiWidth.value).toBeNull();
});

it('右侧卡片与页面树一样按实际像素：默认 360px，不随界面密度变化', async () => {
  width.value = 312;
  for (const [preference, expected] of [['small', '360px'], ['large', '360px'], ['medium', '360px']]) {
    applyUiDensity(preference);
    await nextTick();
    const shell = host.querySelector<HTMLElement>('.note-workspace-shell')!;
    expect(shell.style.getPropertyValue('--note-workspace-ai-width')).toBe(expected);
    expect(shell.style.getPropertyValue('--note-workspace-sidebar-width')).toBe('312px');
    expect(shell.style.getPropertyValue('--note-workspace-main-min-width')).toBe('680px');
    expect(width.value).toBe(312);
  }
});

it('网格列按实际呈现排列，收起的面板列宽为 0', async () => {
  const shell = host.querySelector<HTMLElement>('.note-workspace-shell')!;
  expect(shell.style.gridTemplateColumns).toBe(
    'var(--note-workspace-sidebar-width) minmax(var(--note-workspace-main-min-width), 1fr) var(--note-workspace-ai-width)',
  );
  sidebarOpen.value = false;
  aiOpen.value = false;
  await nextTick();
  expect(shell.style.gridTemplateColumns).toBe('0px minmax(var(--note-workspace-main-min-width), 1fr) 0px');
});

it('启用面板快捷键后，Ctrl + \\ 开关页面树、Alt + \\ 开关右侧卡片', async () => {
  app.unmount();
  host.remove();
  mount({ panelShortcuts: true });
  const press = async (altKey = false) => {
    const event = new KeyboardEvent('keydown', { key: '\\', code: 'Backslash', ctrlKey: !altKey, altKey, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    await nextTick();
    return event.defaultPrevented;
  };
  expect(await press()).toBe(true);
  expect(sidebarOpen.value).toBe(false);
  await press();
  expect(sidebarOpen.value).toBe(true);
  expect(await press(true)).toBe(true);
  expect(aiOpen.value).toBe(false);
  await press(true);
  expect(aiOpen.value).toBe(true);
});

it('未启用面板快捷键时不拦截按键', async () => {
  const event = new KeyboardEvent('keydown', { key: '\\', code: 'Backslash', ctrlKey: true, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  await nextTick();
  expect(event.defaultPrevented).toBe(false);
  expect(sidebarOpen.value).toBe(true);
});
