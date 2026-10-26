import { createApp, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, it, expect, vi } from 'vitest';
import Preview from './NoteReadonlyPreview.vue';
import globalDirect from '@/config/globalDirect';
import { renderMermaidBlocks } from '@/utils/mermaidRender';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utils/mermaidRender', () => ({ renderMermaidBlocks: vi.fn(async () => {}), watchMermaidTheme: vi.fn() }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: false }),
  useUserStore: () => ({ id: 'visitor', role: 'visitor' }),
}));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn(async () => ({ status: 200, data: [] })) }));
vi.mock('@/api/noteDetailPrefetch', () => ({
  consumeNoteDetail: vi.fn(async (_user, id) => ({
    status: 200,
    data: {
      id,
      title: id,
      type: 'html',
      content:
        id === 'diagram'
          ? '<h1>流程</h1><pre><code class="language-mermaid">flowchart TD\n A--&gt;B</code></pre>'
          : '<h1>新笔记</h1><p>当前正文</p>',
      tags: [],
    },
  })),
  invalidateNoteDetailPrefetch: vi.fn(),
}));
vi.mock('@/api/noteReferences', () => ({ resolveNoteResourceRefs: vi.fn(async () => []) }));
vi.mock('@/api/drawingThumbnail', () => ({ ensureDrawingThumbnail: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { warning: vi.fn() } }));
vi.mock('@/composables/useNoteCodeHighlight', () => ({ useNoteCodeHighlight: vi.fn() }));

describe('note readonly diagram rendering', () => {
  it('sends loaded graph source to the shared renderer and follows note switches', async () => {
    const noteId = ref('diagram');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    });
    const app = createApp({ render: () => h(Preview, { noteId: noteId.value }) });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        missingWarn: false,
        fallbackWarn: false,
        messages: { 'zh-CN': {} },
      }),
    );
    app.use(router);
    globalDirect(app);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    try {
      await vi.waitFor(() => {
        expect(renderMermaidBlocks).toHaveBeenCalled();
        const root = vi.mocked(renderMermaidBlocks).mock.calls.at(-1)?.[0];
        expect(root?.querySelector('code.language-mermaid')?.textContent).toContain('A-->B');
      });
      noteId.value = 'plain';
      await vi.waitFor(() => {
        const root = vi.mocked(renderMermaidBlocks).mock.calls.at(-1)?.[0];
        expect(root?.querySelector('code.language-mermaid')).toBeNull();
        expect(root?.textContent).toContain('当前正文');
      });
      expect(host.querySelector('pre')).toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
