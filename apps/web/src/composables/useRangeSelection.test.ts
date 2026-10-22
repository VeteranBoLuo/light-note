import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, effectScope, h, nextTick, ref, withDirectives, type App, type EffectScope } from 'vue';
import { useRangeSelection, type RangeSelectionController } from './useRangeSelection';
import { vRangeSelect, vRangeSelectionScroll } from '@/directives/rangeSelection';
import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));

const scopes: EffectScope[] = [];
const mounts: { app: App; host: HTMLElement }[] = [];
afterEach(() => {
  mounts.splice(0).forEach(({ app, host }) => {
    app.unmount();
    host.remove();
  });
  scopes.splice(0).forEach((scope) => scope.stop());
});
function fixture(mobile = false) {
  const active = ref(true),
    blocked = ref(false),
    scopeKey = ref('one');
  const groups = ref([
    { id: 'default', keys: ['a', 'b', 'c', 'd'] },
    { id: 'other', keys: ['x', 'y'] },
  ]);
  const apply = vi.fn(() => true);
  const mobileState = ref(mobile);
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() =>
    useRangeSelection({ active, blocked, mobile: mobileState, groups, scope: scopeKey, apply }),
  )!;
  return { controller, active, blocked, scopeKey, groups, apply, mobileState, scope };
}
function mount(render: () => any) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  app.mount(host);
  mounts.push({ app, host });
  return host;
}
function click(target: Element, shiftKey = false) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey }));
}

describe('共享连选手势', () => {
  it('PC 普通点选留下锚点，Shift 正反向均包含首尾且不接管普通点选', () => {
    const { controller: c, apply } = fixture();
    expect(c.activate('b')).toBe(false);
    expect(c.activate('d', 'default', true)).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(['b', 'c', 'd']);
    c.activate('a', 'default', true);
    expect(apply).toHaveBeenLastCalledWith(['a', 'b']);
    expect(c.activate('d')).toBe(false);
    expect(c.anchor?.key).toBe('d');
  });
  it('手机首点只标起点、终点完成并退出连选，取消不修改选择', () => {
    const { controller: c, apply } = fixture(true);
    c.toggle();
    expect(c.hintKey).toContain('chooseStart');
    expect(c.activate('c')).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(c.isAnchor('c')).toBe(true);
    expect(c.hintKey).toContain('chooseEnd');
    c.activate('a');
    expect(apply).toHaveBeenCalledExactlyOnceWith(['a', 'b', 'c']);
    expect(c.selecting).toBe(false);
    c.toggle();
    c.activate('a');
    c.toggle();
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('手机不跨组，PC 跨组重新建立锚点', () => {
    const mobile = fixture(true);
    mobile.controller.toggle();
    mobile.controller.activate('a');
    mobile.controller.activate('x', 'other');
    expect(mobile.apply).not.toHaveBeenCalled();
    expect(mobile.controller.hintKey).toContain('sameGroup');
    mobile.controller.activate('c');
    expect(mobile.apply).toHaveBeenCalledWith(['a', 'b', 'c']);
    const pc = fixture();
    pc.controller.activate('a');
    expect(pc.controller.activate('x', 'other', true)).toBe(false);
    pc.controller.activate('y', 'other', true);
    expect(pc.apply).toHaveBeenCalledWith(['x', 'y']);
  });
  it('超限整次拒绝时保留起点并允许重试，未知项不会选入', () => {
    const { controller: c, apply } = fixture(true);
    apply.mockReturnValue(false);
    c.toggle();
    c.activate('a');
    c.activate('d');
    expect(c.selecting).toBe(true);
    expect(c.anchor?.key).toBe('a');
    expect(c.activate('hidden')).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    apply.mockReturnValue(true);
    c.activate('b');
    expect(c.selecting).toBe(false);
  });
  it('追加分页保留起点，过滤、重排、切范围和退出批量会清理起点', () => {
    const { controller: c, groups, scopeKey, active } = fixture(true);
    c.toggle();
    c.activate('b');
    groups.value = [{ id: 'default', keys: ['a', 'b', 'c', 'd', 'e'] }];
    expect(c.anchor?.key).toBe('b');
    groups.value = [{ id: 'default', keys: ['a', 'c', 'b', 'd', 'e'] }];
    expect(c.selecting).toBe(false);
    c.toggle();
    c.activate('b');
    scopeKey.value = 'two';
    expect(c.anchor).toBeNull();
    c.toggle();
    c.activate('b');
    active.value = false;
    expect(c.anchor).toBeNull();
  });
  it('加载/提交锁定期间不能开始或完成范围', () => {
    const { controller: c, blocked, apply } = fixture(true);
    c.toggle();
    c.activate('a');
    blocked.value = true;
    expect(c.selecting).toBe(false);
    expect(c.available).toBe(false);
    c.toggle();
    c.activate('d');
    expect(apply).not.toHaveBeenCalled();
  });
});

function shiftDown(target: EventTarget = document.body, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Shift',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}
function shiftUp(shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey }));
}

describe('PC Shift 按住提示', () => {
  it('区分首尾步骤，重复按键不触发选择，松键保留原有起点', () => {
    const { controller: c, apply } = fixture();
    expect(c.desktopHintKey).toBe('');
    const event = shiftDown();
    expect(event.defaultPrevented).toBe(false);
    expect(c.desktopHintKey).toBe('resourceSelection.range.shiftChooseStart');
    shiftDown(document.body, { repeat: true });
    expect(apply).not.toHaveBeenCalled();
    c.activate('b', 'default', true);
    expect(c.desktopHintKey).toBe('resourceSelection.range.shiftChooseEnd');
    shiftUp(true);
    expect(c.desktopHintKey).toContain('shiftChooseEnd');
    shiftUp();
    expect(c.desktopHintKey).toBe('');
    expect(c.anchor?.key).toBe('b');
    expect(apply).not.toHaveBeenCalled();
  });
  it('批量未开启、手机端、提交锁和空列表不显示提示', () => {
    const { controller: c, active, blocked, mobileState, groups } = fixture();
    active.value = false;
    shiftDown();
    expect(c.desktopHintKey).toBe('');
    active.value = true;
    mobileState.value = true;
    shiftDown();
    expect(c.desktopHintKey).toBe('');
    mobileState.value = false;
    shiftDown();
    expect(c.desktopHintKey).not.toBe('');
    blocked.value = true;
    expect(c.desktopHintKey).toBe('');
    shiftDown();
    expect(c.desktopHintKey).toBe('');
    blocked.value = false;
    groups.value = [];
    shiftDown();
    expect(c.desktopHintKey).toBe('');
  });
  it('输入框、可编辑内容及操作弹层内不显示，也不拦截键盘', () => {
    const { controller: c } = fixture();
    const host = mount(() =>
      h('div', [
        h('input'),
        h('textarea'),
        h('select'),
        h('div', { contenteditable: 'plaintext-only' }),
        h('div', { role: 'combobox' }),
        h('div', { role: 'dialog' }, h('button', '操作')),
        h('div', { role: 'menu' }, h('button', '菜单项')),
      ]),
    );
    for (const target of host.querySelectorAll('input, textarea, select, [contenteditable], [role=combobox], button')) {
      shiftDown();
      expect(c.desktopHintKey).not.toBe('');
      target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(c.desktopHintKey).toBe('');
      expect(shiftDown(target).defaultPrevented).toBe(false);
      expect(c.desktopHintKey).toBe('');
    }
  });
  it('失焦、后台和页面离开均清理提示，回到页面及重复键不会误恢复', () => {
    const { controller: c } = fixture();
    c.activate('b');
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    try {
      for (const event of ['blur', 'pagehide']) {
        shiftDown();
        expect(c.desktopHintKey).not.toBe('');
        window.dispatchEvent(new Event(event));
        expect(c.desktopHintKey).toBe('');
        shiftDown(document.body, { repeat: true });
        expect(c.desktopHintKey).toBe('');
      }
      shiftDown();
      visibility.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(c.desktopHintKey).toBe('');
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(c.desktopHintKey).toBe('');
      expect(c.anchor?.key).toBe('b');
    } finally {
      visibility.mockRestore();
    }
  });
  it('切换范围、Esc 和组合快捷键清理提示，释放事件不会被子控件阻断', () => {
    const { controller: c, scopeKey } = fixture();
    shiftDown();
    scopeKey.value = 'two';
    expect(c.desktopHintKey).toBe('');
    shiftDown();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(c.desktopHintKey).toBe('');
    shiftDown();
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(c.desktopHintKey).toBe('');
    shiftDown();
    const button = document.createElement('button');
    document.body.append(button);
    button.addEventListener('keyup', (event) => event.stopPropagation());
    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    button.remove();
    expect(c.desktopHintKey).toBe('');
  });
  it('作用域销毁后移除全局监听，不留下按键状态', () => {
    const { controller: c, scope } = fixture();
    shiftDown();
    expect(c.desktopHintKey).not.toBe('');
    scope.stop();
    expect(c.desktopHintKey).toBe('');
    shiftDown();
    expect(c.desktopHintKey).toBe('');
  });
});

describe('真实复选框与表格接入', () => {
  it('捕获 Shift 避免复选框单项反转，键盘首尾相同，普通动作不被吞掉', async () => {
    const { controller: c, apply } = fixture();
    const toggle = vi.fn(),
      action = vi.fn();
    const host = mount(() =>
      h(
        'div',
        ['a', 'b', 'c'].map((key) =>
          withDirectives(
            h('article', { 'data-key': key }, [
              h(BCheckbox, { controlled: true, checked: false, onChange: toggle }),
              h('button', { onClick: action }, '预览'),
            ]),
            [[vRangeSelect, { controller: c, key }]],
          ),
        ),
      ),
    );
    const checks = host.querySelectorAll('[role=checkbox]');
    click(checks[0]);
    expect(toggle).toHaveBeenCalledTimes(1);
    click(checks[2], true);
    expect(apply).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(toggle).toHaveBeenCalledTimes(1);
    checks[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, shiftKey: true }),
    );
    expect(apply).toHaveBeenLastCalledWith(['a', 'b']);
    expect(toggle).toHaveBeenCalledTimes(1);
    click(host.querySelector('button')!, true);
    expect(action).toHaveBeenCalledOnce();
    await nextTick();
  });
  it('手机首点不勾选、起点有实线标记，Escape 取消，锁定时不改选', async () => {
    const { controller: c, blocked } = fixture(true);
    const toggle = vi.fn();
    const host = mount(() =>
      withDirectives(h('article', [h(BCheckbox, { controlled: true, checked: false, onChange: toggle })]), [
        [vRangeSelect, { controller: c, key: 'a' }],
      ]),
    );
    c.toggle();
    click(host.querySelector('[role=checkbox]')!);
    await nextTick();
    expect(toggle).not.toHaveBeenCalled();
    expect(host.querySelector('.range-selection-anchor')).not.toBeNull();
    host.querySelector('article')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(c.selecting).toBe(false);
    blocked.value = true;
    click(host.querySelector('[role=checkbox]')!);
    expect(toggle).not.toHaveBeenCalled();
  });
  it('BTable 排序后的完整行序用于区间，原列表外选择保留', async () => {
    const ordered = ref<string[]>([]);
    const selected = ref<string[]>(['outside']);
    let c!: RangeSelectionController;
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        c = useRangeSelection({
          active: true,
          mobile: false,
          groups: () => [{ id: 'default', keys: ordered.value }],
          apply: (keys) => {
            selected.value = [...new Set([...selected.value, ...keys])];
          },
        });
        return () =>
          h(BTable, {
            data: [
              { id: 'a', name: 'A' },
              { id: 'b', name: 'B' },
              { id: 'c', name: 'C' },
            ],
            columns: [{ key: 'name', title: 'Name', sortable: true }],
            selectable: true,
            preserveSelection: true,
            selectedRows: selected.value,
            rangeSelection: c,
            onRowOrderChange: (keys: string[]) => {
              ordered.value = keys;
            },
            onSelectionChange: (ids: string[]) => {
              selected.value = ids;
            },
          });
      },
    });
    app.mount(host);
    mounts.push({ app, host });
    await nextTick();
    click(host.querySelector('.sort-icons')!);
    await nextTick();
    expect(ordered.value).toEqual(['c', 'b', 'a']);
    const rows = host.querySelectorAll('.table-row');
    click(rows[0].querySelector('[role=checkbox]')!);
    click(rows[2].querySelector('[role=checkbox]')!, true);
    await nextTick();
    expect(selected.value.sort()).toEqual(['a', 'b', 'c', 'outside']);
  });
  it('按手机实际底栏高度预留滚动空间，退出后恢复原值', async () => {
    const { controller: c, active } = fixture(true);
    const host = mount(() =>
      withDirectives(h('section', { style: { paddingBottom: '20px' } }), [[vRangeSelectionScroll, c]]),
    );
    c.setInset(180);
    await nextTick();
    expect(host.querySelector('section')!.style.paddingBottom).toBe('180px');
    active.value = false;
    await nextTick();
    expect(host.querySelector('section')!.style.paddingBottom).toBe('20px');
  });
});
