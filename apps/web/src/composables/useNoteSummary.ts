import { ref, watch, type Ref } from 'vue';
import {
  noteCardPreviewFromServer,
  noteCardPreviewText,
  noteSummaryFromServerPreview,
  noteSummaryText,
  type NoteCardPreviewText,
  type NoteSummaryOptions,
} from '@/utils/noteSummary';

/**
 * 笔记摘要(异步:Markdown 要按需加载 marked)。
 * 列表滚动/切换时同一组件会被复用,这里用 token 拦住旧内容的迟到回包,避免摘要串卡片。
 */
export function useNoteSummary(getNote: () => any, options: NoteSummaryOptions = {}): Ref<string> {
  const summary = ref('');
  let token = 0;

  watch(
    () => {
      const note = getNote();
      return [
        Object.prototype.hasOwnProperty.call(note || {}, 'previewSummary'),
        note?.previewSummary ?? '',
        note?.content ?? '',
        note?.type ?? '',
      ] as const;
    },
    async ([hasServerPreview, _previewSummary, content, type]) => {
      const current = ++token;
      if (hasServerPreview) {
        const serverSummary = noteSummaryFromServerPreview(getNote(), options);
        if (current === token) summary.value = serverSummary ?? '';
        return;
      }
      const text = await noteSummaryText(String(content || ''), type ? String(type) : undefined, options);
      if (current === token) summary.value = text;
    },
    { immediate: true },
  );

  return summary;
}

export interface NoteCardPreviewRefs {
  summary: Ref<string>;
  beforeImage: Ref<string>;
  afterImage: Ref<string>;
  imageLocated: Ref<boolean>;
}

/**
 * 卡片正文与首图顺序共用一次安全摘要解析，避免先生成完整摘要、再额外扫描正文。
 */
export function useNoteCardPreview(getNote: () => any, options: NoteSummaryOptions = {}): NoteCardPreviewRefs {
  const summary = ref('');
  const beforeImage = ref('');
  const afterImage = ref('');
  const imageLocated = ref(false);
  let token = 0;

  watch(
    () => {
      const note = getNote();
      return [
        Object.prototype.hasOwnProperty.call(note || {}, 'previewSummary'),
        note?.previewSummary ?? '',
        note?.previewTextBeforeImage ?? '',
        note?.previewTextAfterImage ?? '',
        note?.previewImageLocated ?? false,
        note?.content ?? '',
        note?.type ?? '',
        note?.previewImageUrl ?? '',
      ] as const;
    },
    async ([hasServerPreview, _summary, _beforeImage, _afterImage, _imageLocated, content, type, previewImageUrl]) => {
      const current = ++token;
      if (hasServerPreview) {
        const serverPreview = noteCardPreviewFromServer(getNote(), options);
        if (current !== token) return;
        summary.value = serverPreview?.summary ?? '';
        beforeImage.value = serverPreview?.beforeImage ?? '';
        afterImage.value = serverPreview?.afterImage ?? '';
        imageLocated.value = serverPreview?.imageLocated ?? false;
        return;
      }
      const preview: NoteCardPreviewText = await noteCardPreviewText(
        String(content || ''),
        type ? String(type) : undefined,
        String(previewImageUrl || ''),
        options,
      );
      if (current !== token) return;
      summary.value = preview.summary;
      beforeImage.value = preview.beforeImage;
      afterImage.value = preview.afterImage;
      imageLocated.value = preview.imageLocated;
    },
    { immediate: true },
  );

  return { summary, beforeImage, afterImage, imageLocated };
}
