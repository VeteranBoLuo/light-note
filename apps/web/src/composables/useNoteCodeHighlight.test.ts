import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useNoteCodeHighlight } from './useNoteCodeHighlight';

describe('useNoteCodeHighlight', () => {
  it('follows v-html replacements and remounts without changing source or reviving old content', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const source = ref('<pre class="language-js">const a = 1;</pre>');
    const visible = ref(true);
    const app = createApp({
      setup() {
        const root = ref<HTMLElement | null>(null);
        useNoteCodeHighlight(root, source);
        return () => (visible.value ? h('article', { ref: root, innerHTML: source.value }) : null);
      },
    });
    app.mount(host);
    try {
      await vi.waitFor(() => expect(host.querySelector('.hljs-keyword')?.textContent).toBe('const'));
      expect(source.value).toBe('<pre class="language-js">const a = 1;</pre>');
      source.value = '<pre class="language-python">def current(): pass</pre>';
      await nextTick();
      source.value = '<p>new note</p>';
      await nextTick();
      expect(host.textContent).toBe('new note');
      expect(host.querySelector('.hljs')).toBeNull();
      visible.value = false;
      await nextTick();
      source.value = '<pre><code class="language-python">def current(): pass</code></pre>';
      visible.value = true;
      await vi.waitFor(() => expect(host.querySelector('.hljs-keyword')?.textContent).toBe('def'));
      expect(host.textContent).toBe('def current(): pass');
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
