import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));

const { default: NoteDetailLoadingState } = await import('./NoteDetailLoadingState.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('NoteDetailLoadingState', () => {
  it('把调用方的覆盖层 class 与属性透传到唯一根节点', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(NoteDetailLoadingState, {
          class: 'note-editor-runtime-skeleton',
          'data-testid': 'editor-loading-state',
        }),
    });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const root = host.querySelector<HTMLElement>('[data-testid="editor-loading-state"]');
    expect(root?.classList.contains('note-detail-loading-state')).toBe(true);
    expect(root?.classList.contains('note-editor-runtime-skeleton')).toBe(true);
  });

  it('整页冷启动骨架按真实详情页层级预留面包屑、标题和工具栏', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () => h(NoteDetailLoadingState, { variant: 'page' }),
    });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    expect(host.querySelector('.note-detail-loading-state__breadcrumb')).not.toBeNull();
    expect(host.querySelector('.note-detail-loading-state__title-row')).not.toBeNull();
    expect(host.querySelector('.note-detail-loading-state__toolbar')).not.toBeNull();
    expect(host.querySelectorAll('.skeleton--tool')).toHaveLength(6);
  });
});
