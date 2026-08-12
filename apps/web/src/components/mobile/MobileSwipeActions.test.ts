import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MobileSwipeActions, { type MobileSwipeActionItem } from './MobileSwipeActions.vue';

const source = readFileSync(resolve(process.cwd(), 'src/components/mobile/MobileSwipeActions.vue'), 'utf8');

let cleanup: (() => void) | undefined;

function pointerEvent(type: string, x: number, y: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    clientX: { value: x },
    clientY: { value: y },
  });
  return event;
}

function mountSwipe(actions: MobileSwipeActionItem[]) {
  const open = ref(false);
  const onAction = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(
        MobileSwipeActions,
        {
          actions,
          enabled: true,
          open: open.value,
          'onUpdate:open': (value: boolean) => (open.value = value),
          onAction,
        },
        { default: () => h('div', { class: 'test-card' }, '待整理') },
      ),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, open, onAction };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('MobileSwipeActions', () => {
  it('拖动中保留卡片圆角，完全展开后才清除右圆角', () => {
    expect(source).toContain('.mobile-swipe-delete.is-open .mobile-swipe-delete__content :deep(.todo-item)');
    expect(source).not.toContain('.mobile-swipe-delete.is-dragging .mobile-swipe-delete__content :deep(.todo-item)');
  });

  it('最多展示两个操作，并按操作总宽度展开', async () => {
    const { host, open } = mountSwipe([
      { key: 'complete', label: '完成整理', tone: 'success' },
      { key: 'delete', label: '删除', tone: 'danger' },
      { key: 'extra', label: '不应显示' },
    ]);
    await nextTick();
    const content = host.querySelector<HTMLElement>('.mobile-swipe-actions__content')!;

    content.dispatchEvent(pointerEvent('pointerdown', 240, 40));
    content.dispatchEvent(pointerEvent('pointermove', 70, 42));
    content.dispatchEvent(pointerEvent('pointerup', 70, 42));
    await nextTick();

    expect(open.value).toBe(true);
    expect(host.querySelectorAll('.mobile-swipe-actions__action')).toHaveLength(2);
    expect(host.textContent).not.toContain('不应显示');
    expect(content.style.transform).toContain('-152px');
  });

  it('点击操作后先收起，再向业务层发出完整动作', async () => {
    const actions: MobileSwipeActionItem[] = [
      { key: 'complete', label: '完成整理', tone: 'success' },
      { key: 'delete', label: '删除', tone: 'danger' },
    ];
    const { host, open, onAction } = mountSwipe(actions);
    open.value = true;
    await nextTick();

    host.querySelectorAll<HTMLButtonElement>('.mobile-swipe-actions__action')[0].click();
    await nextTick();

    expect(open.value).toBe(false);
    expect(onAction).toHaveBeenCalledWith(actions[0]);
  });

  it('纵向滚动意图不展开操作区', async () => {
    const { host, open } = mountSwipe([{ key: 'delete', label: '删除', tone: 'danger' }]);
    await nextTick();
    const content = host.querySelector<HTMLElement>('.mobile-swipe-actions__content')!;

    content.dispatchEvent(pointerEvent('pointerdown', 180, 30));
    content.dispatchEvent(pointerEvent('pointermove', 176, 90));
    content.dispatchEvent(pointerEvent('pointerup', 176, 90));

    expect(open.value).toBe(false);
  });
});
