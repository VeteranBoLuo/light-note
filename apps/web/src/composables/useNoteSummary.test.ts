import { effectScope, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useNoteCardPreview, useNoteSummary } from './useNoteSummary';

describe('useNoteSummary v2 列表预览', () => {
  it('服务端预览字段存在时同步返回，不再解析 content', () => {
    const scope = effectScope();
    scope.run(() => {
      const note = reactive({
        content: '<p>这段正文不应参与 v2 卡片解析</p>',
        type: 'html',
        previewSummary: '服务端第一段\n服务端第二段',
        previewTextBeforeImage: '服务端第一段',
        previewTextAfterImage: '服务端第二段',
        previewImageLocated: true,
        previewImageUrl: '/api/note/image-thumbnail/hash.webp?source=source',
      });

      const summary = useNoteSummary(() => note, { maxLength: 150, singleLine: true });
      const preview = useNoteCardPreview(() => note, { maxLength: 300 });

      expect(summary.value).toBe('服务端第一段 服务端第二段');
      expect(preview.summary.value).toBe('服务端第一段\n服务端第二段');
      expect(preview.beforeImage.value).toBe('服务端第一段');
      expect(preview.afterImage.value).toBe('服务端第二段');
      expect(preview.imageLocated.value).toBe(true);
    });
    scope.stop();
  });

  it('手绘类型忽略旧服务端返回的 JSON 摘要，只显示文本元素', async () => {
    const scope = effectScope();
    const note = reactive({
      content: '',
      type: 'drawing',
      previewSummary: JSON.stringify({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [
          { id: 's1', kind: 'stroke', color: '#1f2937', width: 4, points: [10, 10, 20, 20] },
          { id: 't1', kind: 'text', color: '#615ced', fontSize: 20, x: 30, y: 40, width: 200, text: '测试' },
        ],
      }),
    });
    const summary = scope.run(() => useNoteSummary(() => note, { singleLine: true }));
    const preview = scope.run(() => useNoteCardPreview(() => note));

    await vi.waitFor(() => expect(summary?.value).toBe('测试'));
    expect(preview?.summary.value).toBe('');
    expect(preview?.beforeImage.value).toBe('');
    scope.stop();
  });
});
