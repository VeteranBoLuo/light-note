import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import NoteOutlineList from './NoteOutlineList.vue';

let cleanup: () => void;
afterEach(() => cleanup?.());

function mountList() {
  const active = ref<number | null>(4);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(NoteOutlineList, {
        headings: Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, text: `标题 ${i}`, level: 2 })),
        activeIndex: active.value,
        onSelect: (index: number) => {
          active.value = index;
        },
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: {} }, missingWarn: false, fallbackWarn: false }));
  app.directive('auto-scrollbar', {});
  app.directive('click-log', {});
  app.mount(host);
  const root = host.querySelector('nav')!;
  const items = [...host.querySelectorAll<HTMLElement>('.toc-item')];
  root.scrollTop = 120;
  root.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200 }) as DOMRect;
  items.forEach((item, i) => {
    item.getBoundingClientRect = () =>
      ({ top: i * 40 - root.scrollTop, bottom: (i + 1) * 40 - root.scrollTop, height: 40 }) as DOMRect;
  });
  root.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    root.scrollTop = top!;
  });
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { active, root, items };
}
async function flush() {
  await nextTick();
  await nextTick();
}

describe('大纲滚动上下文', () => {
  it('点击可见标题保持位置，重复点击也不滚动', async () => {
    const { root, items } = mountList();
    items[7].click();
    await flush();
    items[7].click();
    await flush();
    expect(root.scrollTo).not.toHaveBeenCalled();
    expect(root.scrollTop).toBe(120);
  });
  it('向下跟随时提前露出下一标题，中间区域不滚动', async () => {
    const { active, root } = mountList();
    active.value = 5;
    await flush();
    expect(root.scrollTo).not.toHaveBeenCalled();
    active.value = 7;
    await flush();
    expect(root.scrollTop).toBe(160);
  });
  it('向上跟随时提前露出上一标题，首项正常可达', async () => {
    const { active, root } = mountList();
    active.value = 3;
    await flush();
    expect(root.scrollTop).toBe(80);
    active.value = 0;
    await flush();
    expect(root.scrollTop).toBe(0);
  });
  it('手动移开大纲后仍优先保证当前标题可见', async () => {
    const { active, root } = mountList();
    root.scrollTop = 240;
    active.value = 5;
    await flush();
    expect(root.scrollTop).toBe(200);
  });
  it('末项没有下一标题仍然可达，空状态不触发滚动', async () => {
    const { active, root } = mountList();
    active.value = 11;
    await flush();
    expect(root.scrollTop).toBe(280);
    vi.mocked(root.scrollTo).mockClear();
    active.value = null;
    await flush();
    expect(root.scrollTo).not.toHaveBeenCalled();
  });
});
