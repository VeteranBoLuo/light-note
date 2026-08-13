import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 笔记详情顶栏在三个断点下的操作可达性。
 *
 * 桌面空间充足时直接展示历史版本 / 标签 / 导出；平板和手机仍通过更多菜单保证功能可达。
 */
const layout = { isMobile: false, isTablet: false, isDesktop: true };

vi.mock('@/store', () => ({
  bookmarkStore: () => layout,
}));
vi.mock('@/http/request.ts', () => ({ apiBasePost: vi.fn().mockResolvedValue({ status: 200, data: [] }) }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
// 浮层类组件只做透传，让被包裹的按钮留在原地便于查询
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { name: 'BTooltipStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BPopover.vue', () => ({
  default: { name: 'BPopoverStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BDropdown.vue', () => ({
  default: {
    name: 'BDropdownStub',
    props: ['menuOptions'],
    template:
      '<div class="dropdown-stub"><slot /><span v-for="option in menuOptions" class="dropdown-option-stub">{{ option.label }}</span></div>',
  },
}));
vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: {
    name: 'MobilePageActionsDrawerStub',
    props: ['open', 'actions', 'objectTitle'],
    emits: ['update:open', 'action'],
    template: `
      <div class="mobile-actions-drawer-stub" :data-open="String(open)" :data-title="objectTitle">
        <button
          v-for="action in actions"
          :key="action.key"
          class="mobile-action-option-stub"
          @click="$emit('action', action)"
        >{{ action.label }}</button>
      </div>
    `,
  },
}));
vi.mock('@/components/noteLibrary/detail/ResourceBacklinks.vue', () => ({
  default: { name: 'ResourceBacklinksStub', template: '<div />' },
}));

const { default: NoteHeader } = await import('./NoteHeader.vue');

let cleanup: (() => void) | undefined;

function mount(options: { isPending?: boolean; readonly?: boolean; onToggleInbox?: () => void } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(NoteHeader, {
          updateTime: '2026-08-05 10:00:00',
          readonly: options.readonly ?? false,
          isStartEdit: false,
          note: {
            id: 'note-1',
            title: '示例笔记',
            content: '<p>x</p>',
            isPending: Boolean(options.isPending),
          },
          noteType: 'html',
          hasCatalog: true,
          onToggleInbox: options.onToggleInbox,
        });
    },
  });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

/** 三个曾被 isDesktop 挡掉的操作 */
function reachableActions(host: HTMLElement) {
  const menuText = [...host.querySelectorAll('.dropdown-option-stub, .mobile-action-option-stub')]
    .map((item) => item.textContent || '')
    .join(' ');
  return {
    history:
      menuText.includes(zhCN.noteDetail.history.entry) || !!host.querySelector('.note-header-title-icon--history'),
    tag: menuText.includes(zhCN.noteDetail.tags) || !!host.querySelector('.note-header-title-icon--tag'),
    export: menuText.includes(zhCN.noteDetail.export) || !!host.querySelector('.note-header-title-icon--export'),
  };
}

function setLayout(next: 'mobile' | 'tablet' | 'desktop') {
  layout.isMobile = next === 'mobile';
  layout.isTablet = next === 'tablet';
  layout.isDesktop = next === 'desktop';
}

describe('NoteHeader 断点下的操作可达性', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLayout('desktop');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('桌面端把历史版本、标签与导出直接展示在顶栏', async () => {
    const host = mount();
    await nextTick();

    expect(reachableActions(host)).toEqual({ history: true, tag: true, export: true });
    expect(host.querySelector('.note-header-title-icon--history')).not.toBeNull();
    expect(host.querySelector('.note-header-title-icon--tag')).not.toBeNull();
    expect(host.querySelector('.note-header-title-icon--export')).not.toBeNull();
    const menuText = host.querySelector('.dropdown-stub')?.textContent || '';
    expect(menuText).not.toContain(zhCN.noteDetail.history.entry);
    expect(menuText).not.toContain(zhCN.noteDetail.tags);
    expect(menuText).not.toContain(zhCN.noteDetail.export);
  });

  it('桌面端显示待整理胶囊，并在更多菜单提供取消或加入操作', async () => {
    const host = mount({ isPending: true });
    await nextTick();

    expect(host.querySelector('.inbox-pending-badge')?.textContent).toContain(zhCN.inbox.pendingBadge);
    expect(host.querySelector('.dropdown-stub')?.textContent).toContain(zhCN.inbox.removeExisting);
    cleanup?.();

    const regularHost = mount({ isPending: false });
    await nextTick();
    expect(regularHost.querySelector('.inbox-pending-badge')).toBeNull();
    expect(regularHost.querySelector('.dropdown-stub')?.textContent).toContain(zhCN.inbox.addExisting);
  });

  /** 这条是回归重点：平板不摊开按钮，但不能因此丢功能。 */
  it('平板仍从更多菜单访问同一组操作', async () => {
    setLayout('tablet');
    const host = mount();
    await nextTick();

    expect(reachableActions(host)).toEqual({ history: true, tag: true, export: true });
  });

  it('平板保留自己的目录入口', async () => {
    setLayout('tablet');
    const host = mount();
    await nextTick();

    expect(host.querySelector('.note-header-tablet-catalog')).not.toBeNull();
  });

  /** 手机走独立分支：功能仍可达，但只能收进「更多」菜单，不能摊在顶栏。 */
  it('手机端把这些操作收进「更多」菜单，而不是摊在顶栏', async () => {
    setLayout('mobile');
    const host = mount();
    await nextTick();

    expect(reachableActions(host)).toEqual({ history: true, tag: true, export: true });
    expect(host.querySelector('.note-header-title-icon--history')).toBeNull();
    expect(host.querySelector('.note-header-title-icon--tag')).toBeNull();
    expect(host.querySelector('.note-header-title-icon--export')).toBeNull();
    expect(host.querySelector('.note-header-mobile-more')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('.note-header-mobile-more')!.click();
    await nextTick();
    expect(host.querySelector('.mobile-actions-drawer-stub')?.getAttribute('data-open')).toBe('true');
    expect(host.querySelector('.mobile-actions-drawer-stub')?.getAttribute('data-title')).toContain('示例笔记');
    expect(host.querySelector('.mobile-actions-drawer-stub')?.textContent).toContain(zhCN.inbox.addExisting);
  });

  it('只读详情不提供待整理写操作', async () => {
    const host = mount({ isPending: true, readonly: true });
    await nextTick();

    const actions = host.querySelector('.dropdown-stub')?.textContent || '';
    expect(actions).not.toContain(zhCN.inbox.removeExisting);
    expect(actions).not.toContain(zhCN.inbox.addExisting);
  });
});
