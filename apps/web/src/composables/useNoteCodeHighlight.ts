import { watch, type Ref } from 'vue';
import { highlightNoteCodeBlocks } from '@/utils/noteCodeHighlight';

export function useNoteCodeHighlight(root: Ref<HTMLElement | null>, html: Ref<string>) {
  watch(
    [root, html],
    ([element], _previous, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      if (element)
        void highlightNoteCodeBlocks(element, () => !cancelled).catch(() => {
          // 分包加载失败时保留已经净化的纯文本，下一次正文更新可重试。
        });
    },
    { flush: 'post', immediate: true },
  );
}
