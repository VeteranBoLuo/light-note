import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import MobileSwipeDelete from './MobileSwipeDelete.vue';

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

function mountSwipe(initialOpen = false) {
  const open = ref(initialOpen);
  const onDelete = vi.fn();
  const onCardClick = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(
          MobileSwipeDelete,
          {
            enabled: true,
            open: open.value,
            label: '删除',
            'onUpdate:open': (value: boolean) => (open.value = value),
            onDelete,
          },
          { default: () => h('div', { class: 'test-card', onClick: onCardClick }, '待办') },
        );
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, open, onDelete, onCardClick };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('MobileSwipeDelete', () => {
  it('横向左滑露出删除操作，并吞掉手势结束后生成的点击', async () => {
    const { host, open, onCardClick } = mountSwipe();
    await nextTick();
    const content = host.querySelector<HTMLElement>('.mobile-swipe-delete__content')!;
    const card = host.querySelector<HTMLElement>('.test-card')!;

    content.dispatchEvent(pointerEvent('pointerdown', 180, 40));
    content.dispatchEvent(pointerEvent('pointermove', 100, 42));
    content.dispatchEvent(pointerEvent('pointerup', 100, 42));
    card.click();
    await nextTick();

    expect(open.value).toBe(true);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(content.style.transform).toContain('-84px');
  });

  it('纵向滚动意图不打开操作区', async () => {
    const { host, open } = mountSwipe();
    await nextTick();
    const content = host.querySelector<HTMLElement>('.mobile-swipe-delete__content')!;

    content.dispatchEvent(pointerEvent('pointerdown', 180, 40));
    content.dispatchEvent(pointerEvent('pointermove', 176, 85));
    content.dispatchEvent(pointerEvent('pointerup', 176, 85));

    expect(open.value).toBe(false);
  });

  it('操作区打开时点卡片只收起，点删除按钮才发出删除事件', async () => {
    const { host, open, onDelete, onCardClick } = mountSwipe(true);
    await nextTick();

    host.querySelector<HTMLElement>('.test-card')!.click();
    await nextTick();
    expect(open.value).toBe(false);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    open.value = true;
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-swipe-delete__action button')!.click();
    await nextTick();
    expect(open.value).toBe(false);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('操作区打开时点击卡片之外的区域会收起，且不拦截外部操作', async () => {
    const { open } = mountSwipe(true);
    const outsideAction = vi.fn();
    const outside = document.createElement('button');
    outside.addEventListener('pointerdown', outsideAction);
    document.body.append(outside);
    await nextTick();

    outside.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    await nextTick();

    expect(open.value).toBe(false);
    expect(outsideAction).toHaveBeenCalledOnce();
    outside.remove();
  });
});
