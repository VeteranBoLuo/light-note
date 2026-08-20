import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import type { TodoResourceRefView } from '@/api/todoApi';
import TodoResourceLinks from './TodoResourceLinks.vue';

const source = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoResourceLinks.vue'), 'utf8');
let cleanup: (() => void) | undefined;

const resources: TodoResourceRefView[] = [
  { type: 'note', id: 'note-1', title: '开发文档', snapshotTitle: '开发文档', available: true },
  { type: 'bookmark', id: 'bookmark-1', title: '接口说明', snapshotTitle: '接口说明', available: true },
  { type: 'file', id: 'file-1', title: '排期.xlsx', snapshotTitle: '排期.xlsx', available: true },
  { type: 'note', id: 'note-gone', title: '旧资料', snapshotTitle: '旧资料', available: false },
];

function mountLinks(options: { maxVisible?: number; removable?: boolean } = {}) {
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(TodoResourceLinks, {
          items: resources,
          maxVisible: options.maxVisible,
          removable: options.removable,
          onOpen,
          onRemove,
        });
    },
  });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          inbox: {
            todoResourceRefsTitle: '参考资料',
            todoResourceUnavailable: '已不可用',
            todoOpenResource: '打开{type}“{title}”',
            todoRemoveResource: '移除关联资料“{title}”',
            todoMoreResources: '还有 {count} 个关联资料',
          },
          ai: { sourceTypes: { note: '笔记', bookmark: '书签', file: '文件' } },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onOpen, onRemove };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('TodoResourceLinks', () => {
  it('显式覆盖 BButton 默认行高，把资料胶囊稳定压缩为 24px', () => {
    expect(source).toMatch(/\.todo-resource-link\s*\{[\s\S]*?height:\s*24px;/);
    expect(source).toMatch(/\.b_btn\.todo-resource-link__open[\s\S]*?height:\s*22px;[\s\S]*?line-height:\s*1;/);
  });

  it('限制可见数量并从主按钮发出资料打开事件', async () => {
    const { host, onOpen } = mountLinks({ maxVisible: 3 });
    await nextTick();

    expect(host.querySelectorAll('.todo-resource-link')).toHaveLength(3);
    expect(host.querySelector('.todo-resource-links__more')?.textContent?.trim()).toBe('+1');
    host.querySelector<HTMLButtonElement>('.todo-resource-link__open')!.click();
    expect(onOpen).toHaveBeenCalledWith(resources[0]);
  });

  it('删除按钮与打开按钮各自独立，失效资料不可打开', async () => {
    const { host, onOpen, onRemove } = mountLinks({ removable: true });
    await nextTick();

    const removeButtons = host.querySelectorAll<HTMLButtonElement>('.todo-resource-link__remove');
    removeButtons[0].click();
    expect(onRemove).toHaveBeenCalledWith(resources[0]);
    expect(onOpen).not.toHaveBeenCalled();

    const unavailableButton = host.querySelectorAll<HTMLButtonElement>('.todo-resource-link__open')[3];
    expect(unavailableButton.disabled).toBe(true);
    unavailableButton.click();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
