import { afterEach, expect, it } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import CloudFileTags from './CloudFileTags.vue';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mountTags() {
  const props = reactive({
    tags: [
      { id: 'one', name: '项目资料' },
      { id: 'two', name: '很长的关联标签完整名称' },
      { id: 'three', name: '旅行' },
    ],
    batchMode: false,
  });
  const selected: Array<{ id: string; event: MouseEvent }> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(CloudFileTags, { ...props, onSelect: (id, event) => selected.push({ id, event }) }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: { cloudSpace: { relateTags: '关联标签' } } } }));
  app.directive('auto-scrollbar', {});
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const more = () => host.querySelector<HTMLButtonElement>('.cloud-file-tags__more')!;
  const visiblePanel = () =>
    document.querySelector('.b-popover-panel:not(.b-popover-fade-leave-active) .cloud-file-tags__list');
  async function open() {
    more().click();
    await nextTick();
    expect(more().getAttribute('aria-expanded')).toBe('true');
    return visiblePanel()!;
  }
  return { props, host, selected, more, visiblePanel, open };
}

it('单行只展示首个标签与剩余数量，展开后可选择完整标签并关闭浮层', async () => {
  const { host, selected, more, open } = mountTags();
  expect(host.querySelectorAll('.resource-tag-chip')).toHaveLength(1);
  expect(more().textContent?.trim()).toBe('+2');
  const panel = await open();
  expect(panel.textContent).toContain('很长的关联标签完整名称');
  const chips = panel.querySelectorAll<HTMLButtonElement>('.resource-tag-chip');
  expect(chips).toHaveLength(3);
  chips[1].click();
  await nextTick();
  expect(selected.map((item) => item.id)).toEqual(['two']);
  expect(more().getAttribute('aria-expanded')).toBe('false');
});

it('首个标签直接交给文件行处理，保留批量选择所需的 Shift 事件', async () => {
  const { props, host, selected, more, visiblePanel } = mountTags();
  host.querySelector<HTMLButtonElement>('.cloud-file-tags__visible')!.click();
  expect(selected.map((item) => item.id)).toEqual(['one']);
  props.batchMode = true;
  await nextTick();
  const event = new MouseEvent('click', { bubbles: true, shiftKey: true });
  more().dispatchEvent(event);
  await nextTick();
  expect(selected.at(-1)).toEqual({ id: 'one', event });
  expect(more().hasAttribute('data-range-select')).toBe(true);
  expect(visiblePanel()).toBeNull();
});

it('标签更新或进入批量模式关闭旧浮层，空标签与单标签不显示折叠入口', async () => {
  const { props, host, more, open, visiblePanel } = mountTags();
  await open();
  props.batchMode = true;
  await nextTick();
  expect(more().getAttribute('aria-expanded')).toBe('false');
  props.batchMode = false;
  await nextTick();
  await open();
  props.tags = [{ id: 'new', name: '新标签' }];
  await nextTick();
  expect(more()).toBeNull();
  expect(visiblePanel()).toBeNull();
  expect(host.textContent).toBe('新标签');
  props.tags = [];
  await nextTick();
  expect(host.textContent).toBe('');
});
