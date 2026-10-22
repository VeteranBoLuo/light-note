import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App } from 'vue';

const mocks = vi.hoisted(() => ({ selection: null as any }));
vi.mock('@/store/resourceSelection', () => ({ useResourceSelectionStore: () => mocks.selection }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'owner', role: 'user' }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
import Bar from './ResourceBatchActionBar.vue';
import { useRangeSelection, type RangeSelectionController } from '@/composables/useRangeSelection';

let app: App;
let host: HTMLElement;
let realRange: RangeSelectionController;
const primaryLoading = ref(false);
const mobile = ref(false);
const detail = ref('');
const selectionHint = ref('');
const moreDisabled = ref(false);
const rangeController = ref<any>();
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
  detail.value = '';
  selectionHint.value = '';
  moreDisabled.value = false;
  rangeController.value = undefined;
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    setup() {
      realRange = useRangeSelection({
        active: true,
        mobile,
        blocked: () => mocks.selection.busy,
        groups: [{ id: 'default', keys: ['a', 'b'] }],
        apply: () => true,
      });
      return () =>
        h(Bar, {
          open: true,
          selectionModule: 'files',
          summary: '已选择 1 个文件',
          clearLabel: '取消选择',
          primaryLabel: '生成与处理',
          moreLabel: '更多',
          primaryLoading: primaryLoading.value,
          mobile: mobile.value,
          detail: detail.value,
          selectionHint: selectionHint.value,
          moreDisabled: moreDisabled.value,
          rangeSelection: rangeController.value,
        });
    },
  });
  app.mount(host);
});
afterEach(() => {
  app.unmount();
  host.remove();
});

describe('批量栏的选择锁与主动作加载状态', () => {
  it('PC 提示随 Shift 按住和起点状态变化，重复事件不增加提示且松键移除', async () => {
    rangeController.value = realRange;
    await nextTick();
    const bar = document.querySelector('.resource-batch-action-bar')!;
    const summary = bar.querySelector('.resource-batch-action-bar__copy')!.textContent;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
    await nextTick();
    expect(bar.querySelector('.range-selection-hint')?.textContent).toBe('resourceSelection.range.shiftChooseStart');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Shift', repeat: true, shiftKey: true, bubbles: true }),
    );
    await nextTick();
    expect(bar.querySelectorAll('.range-selection-hint')).toHaveLength(1);
    realRange.activate('a');
    await nextTick();
    expect(bar.querySelector('.range-selection-hint')?.textContent).toBe('resourceSelection.range.shiftChooseEnd');
    expect(bar.querySelector('.resource-batch-action-bar__copy')!.textContent).toBe(summary);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    await nextTick();
    expect(bar.querySelector('.range-selection-hint')).toBeNull();
    mobile.value = true;
    await nextTick();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }));
    await nextTick();
    expect(document.querySelector('.range-selection-hint')).toBeNull();
  });

  it('共享手机连选在原摘要显示步骤，暂锁主动作与更多且可取消', async () => {
    mobile.value = true;
    const toggle = vi.fn();
    rangeController.value = {
      active: true,
      available: true,
      selecting: true,
      hintKey: 'resourceSelection.range.chooseEnd',
      toggle,
      reset: vi.fn(),
      setInset: vi.fn(),
    };
    await nextTick();
    expect(document.querySelector('.resource-batch-action-bar__copy small')?.textContent).toBe(
      'resourceSelection.range.chooseEnd',
    );
    expect(
      document.querySelector('.resource-batch-action-bar__copy small')?.classList.contains('is-selection-hint'),
    ).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.resource-batch-action-bar__primary')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.resource-batch-action-bar__mobile-more')?.disabled).toBe(true);
    const button = document.querySelector<HTMLButtonElement>('.range-selection-toggle')!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(toggle).toHaveBeenCalledOnce();
    expect(mocks.selection.busy).toBe(false);
  });

  it('移动连选提示复用摘要区，更多可独立禁用，待核对状态优先', async () => {
    mobile.value = true;
    selectionHint.value = '请选择结束文件，可滚动列表';
    moreDisabled.value = true;
    await nextTick();
    expect(document.querySelector('.resource-batch-action-bar__copy small')!.textContent).toBe(selectionHint.value);
    expect(document.querySelector<HTMLButtonElement>('.resource-batch-action-bar__mobile-more')!.disabled).toBe(true);
    expect(mocks.selection.busy).toBe(false);
    mocks.selection.pendingReconcile = {};
    await nextTick();
    expect(document.querySelector('.resource-batch-action-bar__copy small')!.textContent).toBe(
      'resourceSelection.pending',
    );
  });

  it('普通详情不改变已有选择会话的提示规则', async () => {
    detail.value = '其他页面已有的资料类型摘要';
    await nextTick();
    expect(document.querySelector('.resource-batch-action-bar__copy small')).toBeNull();
    mobile.value = true;
    await nextTick();
    expect(document.querySelector('.resource-batch-action-bar__copy small')).toBeNull();
  });

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
