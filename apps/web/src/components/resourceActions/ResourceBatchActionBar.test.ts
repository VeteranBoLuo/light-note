import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App } from 'vue';

const mocks = vi.hoisted(() => ({ selection: null as any }));
vi.mock('@/store/resourceSelection', () => ({ useResourceSelectionStore: () => mocks.selection }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'owner', role: 'user' }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
import Bar from './ResourceBatchActionBar.vue';

let app: App;
let host: HTMLElement;
const primaryLoading = ref(false);
const mobile = ref(false);
beforeEach(() => {
  mocks.selection = reactive({
    module: 'files',
    items: [{ type: 'file', id: '1', title: '文件' }],
    busy: false,
    query: null,
    pendingReconcile: null,
  });
  primaryLoading.value = false;
  mobile.value = false;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () =>
      h(Bar, {
        open: true,
        selectionModule: 'files',
        summary: '已选择 1 个文件',
        clearLabel: '取消选择',
        primaryLabel: '生成与处理',
        moreLabel: '更多',
        primaryLoading: primaryLoading.value,
        mobile: mobile.value,
      }),
  });
  app.mount(host);
});
afterEach(() => {
  app.unmount();
  host.remove();
});

describe('批量栏的选择锁与主动作加载状态', () => {
  it.each([false, true])('打开子操作只锁选择，不改变主动作加载态或摘要（mobile=%s）', async (isMobile) => {
    mobile.value = isMobile;
    await nextTick();
    const bar = document.querySelector<HTMLElement>(
      isMobile ? '.resource-batch-action-bar--mobile' : '.resource-batch-action-bar',
    )!;
    const summary = bar.querySelector('.resource-batch-action-bar__copy')!.textContent;
    mocks.selection.busy = true;
    await nextTick();
    expect(bar.querySelector('.resource-batch-action-bar__copy')!.textContent).toBe(summary);
    expect(bar.querySelector('.resource-batch-action-bar__copy small')).toBeNull();
    expect(bar.querySelector('.btn-spinner')).toBeNull();
    expect(bar.querySelector<HTMLButtonElement>('.resource-batch-action-bar__primary')!.disabled).toBe(true);
    expect(bar.getAttribute('aria-busy')).toBe('true');
    if (isMobile)
      expect(bar.querySelector<HTMLButtonElement>('.resource-batch-action-bar__mobile-more')!.disabled).toBe(true);
  });

  it('主动作自身加载仍显示转圈，待核对状态仍有明确提示', async () => {
    primaryLoading.value = true;
    mocks.selection.pendingReconcile = {};
    await nextTick();
    expect(document.querySelector('.resource-batch-action-bar__primary .btn-spinner')).not.toBeNull();
    expect(document.querySelector('.resource-batch-action-bar__copy small')!.textContent).toBe(
      'resourceSelection.pending',
    );
  });
});
