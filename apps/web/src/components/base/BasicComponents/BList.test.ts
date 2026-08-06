import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

vi.mock('vue-draggable-plus', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    VueDraggable: defineComponent({
      name: 'VueDraggableStub',
      emits: ['start', 'end', 'update:modelValue'],
      setup(_props, { emit, slots }) {
        return () =>
          render(
            'div',
            {
              class: 'vue-draggable-stub',
              onPointerdown: () => emit('start', { oldIndex: 0 }),
              onPointerup: () => emit('end', { oldIndex: 0, newIndex: 1 }),
            },
            slots.default?.(),
          );
      },
    }),
  };
});

import BList from './BList.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountList() {
  const host = document.createElement('div');
  document.body.append(host);
  const onStart = vi.fn();
  const onOnEnd = vi.fn();
  const items = [{ id: 'folder-1', title: '文件夹' }];
  const app = createApp({
    setup() {
      return () =>
        h(BList, {
          draggable: true,
          listOptions: items,
          dragList: items,
          onStart,
          onOnEnd,
          'onUpdate:listOptions': () => undefined,
          'onUpdate:dragList': () => undefined,
        });
    },
  });
  app.use(createPinia());
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onStart, onOnEnd };
}

describe('BList draggable events', () => {
  it('向调用方转发拖拽开始和结束事件', async () => {
    const { host, onStart, onOnEnd } = mountList();
    const draggable = host.querySelector<HTMLElement>('.vue-draggable-stub')!;

    draggable.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    draggable.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await nextTick();

    expect(onStart).toHaveBeenCalledWith({ oldIndex: 0 });
    expect(onOnEnd).toHaveBeenCalledWith({ oldIndex: 0, newIndex: 1 });
  });
});
