import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BTable from './BTable/BTable.vue';
import BVirtualList from './BVirtualList.vue';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function mount(
  component: Parameters<typeof h>[0],
  props: Record<string, unknown>,
  slots?: Record<string, () => unknown>,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(component, props, slots);
    },
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return host;
}

describe('virtual list scroll layout', () => {
  it('keeps BTable offsets inside a fixed-height content sizer instead of growing the scroller padding', async () => {
    const data = Array.from({ length: 1_000 }, (_, id) => ({ id, name: `row-${id}` }));
    const host = mount(BTable, {
      data,
      columns: [{ title: 'Name', key: 'name', ellipsis: false }],
      fill: true,
      virtual: true,
      rowHeight: 40,
      overscan: 2,
    });
    await nextTick();

    const scroller = host.querySelector<HTMLElement>('.table-body')!;
    const sizer = host.querySelector<HTMLElement>('.table-row-sizer')!;
    const window = host.querySelector<HTMLElement>('.table-row-window')!;

    expect(scroller.style.paddingTop).toBe('');
    expect(scroller.style.paddingBottom).toBe('');
    expect(sizer.style.height).toBe('47992px');
    expect(host.querySelectorAll('.table-row')).toHaveLength(4);

    scroller.scrollTop = 960;
    scroller.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(window.style.transform).toBe('translateY(864px)');
    expect(sizer.style.height).toBe('47992px');
    expect(host.textContent).toContain('row-18');
  });

  it('keeps BVirtualList total height on an inner sizer while loaded items grow', async () => {
    const items = ref(Array.from({ length: 50 }, (_, id) => ({ id })));
    const host = mount(
      BVirtualList,
      {
        get items() {
          return items.value;
        },
        itemHeight: 72,
        gap: 8,
        overscan: 2,
      },
      { default: ({ item }: any) => `item-${item.id}` } as any,
    );
    await nextTick();

    const scroller = host.querySelector<HTMLElement>('.b-virtual-list')!;
    const sizer = host.querySelector<HTMLElement>('.b-virtual-list__sizer')!;
    const window = host.querySelector<HTMLElement>('.b-virtual-list__window')!;

    expect(scroller.style.paddingTop).toBe('');
    expect(scroller.style.paddingBottom).toBe('');
    expect(sizer.style.height).toBe('3992px');

    scroller.scrollTop = 800;
    scroller.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(window.style.transform).toBe('translateY(640px)');

    items.value = Array.from({ length: 100 }, (_, id) => ({ id }));
    await nextTick();
    expect(sizer.style.height).toBe('7992px');
    expect(scroller.style.paddingBottom).toBe('');
  });

  it('asks for the next BTable cursor page automatically when loaded rows do not fill the viewport', async () => {
    const loadMore = vi.fn();
    mount(BTable, {
      data: [{ id: 1, name: 'row-1' }],
      columns: [{ title: 'Name', key: 'name', ellipsis: false }],
      fill: true,
      virtual: true,
      rowHeight: 40,
      hasMore: true,
      onLoadMore: loadMore,
    });

    await nextTick();
    await nextTick();

    expect(loadMore).toHaveBeenCalled();
  });
});
