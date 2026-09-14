// @vitest-environment jsdom
import { createApp, h, nextTick, ref, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarkdownScrollSync } from './useMarkdownScrollSync';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.unstubAllGlobals();
});

async function setup() {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++id, fn);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  const disconnected = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {
        disconnected();
      }
    },
  );
  const left = document.createElement('div');
  const right = document.createElement('div');
  const host = document.createElement('div');
  document.body.append(host, left, right);
  for (const el of [left, right]) {
    Object.defineProperties(el, {
      clientHeight: { value: 100 },
      scrollHeight: { value: el === left ? 600 : 1100 },
      offsetHeight: { value: 100 },
    });
    el.getBoundingClientRect = () => new DOMRect(0, 0, 400, 100);
  }
  right.innerHTML = '<p data-ln-md-source="100">before</p><p data-ln-md-source="200">after</p>';
  let tall = 800;
  const children = Array.from(right.children);
  children.forEach((el, i) => {
    el.getBoundingClientRect = () => new DOMRect(0, (i ? tall : 100) - right.scrollTop, 400, 20);
  });
  const enabled = ref(true),
    blocked = ref(false),
    source = ref('same'),
    rendered = ref('same');
  let sync!: ReturnType<typeof useMarkdownScrollSync>;
  const app = createApp({
    setup() {
      sync = useMarkdownScrollSync(
        shallowRef({
          getScrollElement: () => left,
          getSourceTop: (offset: number) => offset,
          getValue: () => source.value,
        }),
        shallowRef(right),
        () => enabled.value,
        () => blocked.value,
        () => rendered.value,
      );
      return () => h('div');
    },
  });
  app.mount(host);
  const flush = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((fn) => fn(0));
  };
  await nextTick();
  flush();
  cleanups.push(() => {
    app.unmount();
    host.remove();
    left.remove();
    right.remove();
  });
  return {
    left,
    right,
    sync,
    flush,
    frames,
    enabled,
    blocked,
    source,
    rendered,
    app,
    disconnected,
    setTall: (value: number) => {
      tall = value;
    },
  };
}

describe('Markdown scroll coordination', () => {
  it('syncs a newly rendered paste without another scroll event', async () => {
    const s = await setup();
    s.source.value = 'new';
    s.left.scrollTop = 200;
    s.sync.onScroll('edit');
    s.flush();
    expect(s.right.scrollTop).toBe(0);
    s.rendered.value = 'new';
    s.sync.invalidate('edit');
    s.flush();
    expect(s.right.scrollTop).toBe(800);
  });
  it('suppresses target scroll feedback and preserves the preview leader on image resize', async () => {
    const s = await setup();
    s.left.scrollTop = 150;
    s.sync.onScroll('edit');
    s.flush();
    expect(s.right.scrollTop).toBe(450);
    s.sync.onScroll('preview');
    s.flush();
    expect(s.left.scrollTop).toBe(150);
    s.right.scrollTop = 800;
    s.sync.onScroll('preview');
    s.flush();
    expect(s.left.scrollTop).toBe(200);
    s.sync.onScroll('edit');
    s.setTall(900);
    s.sync.invalidate();
    s.flush();
    expect(s.right.scrollTop).toBe(800);
    expect(s.left.scrollTop).toBeCloseTo(187.5);
  });
  it('does not override directory navigation or synchronize hidden panes', async () => {
    const s = await setup();
    s.blocked.value = true;
    s.left.scrollTop = 200;
    s.sync.invalidate('edit');
    s.flush();
    expect(s.right.scrollTop).toBe(0);
    s.blocked.value = false;
    s.enabled.value = false;
    await nextTick();
    s.sync.refresh();
    s.flush();
    expect(s.right.scrollTop).toBe(0);
    s.enabled.value = true;
    await nextTick();
    s.flush();
    expect(s.right.scrollTop).toBe(800);
  });
  it('cancels pending work and disconnects observers on unmount', async () => {
    const s = await setup();
    s.sync.invalidate();
    expect(s.frames.size).toBe(1);
    s.app.unmount();
    expect(s.frames.size).toBe(0);
    expect(s.disconnected).toHaveBeenCalled();
  });
});
