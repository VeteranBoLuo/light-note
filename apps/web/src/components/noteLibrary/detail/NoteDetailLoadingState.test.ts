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
});
