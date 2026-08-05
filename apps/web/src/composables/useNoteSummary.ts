import { ref, watch, type Ref } from 'vue';
import { noteSummaryText, type NoteSummaryOptions } from '@/utils/noteSummary';

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
      return [note?.content ?? '', note?.type ?? ''] as const;
    },
    async ([content, type]) => {
      const current = ++token;
      const text = await noteSummaryText(String(content || ''), type ? String(type) : undefined, options);
      if (current === token) summary.value = text;
    },
    { immediate: true },
  );

  return summary;
}
