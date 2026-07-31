import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { noteStore } from '@/store';

export interface CurrentPageResource {
  type: 'note' | 'bookmark' | 'tag';
  id: string;
  title: string;
}

/**
 * 推导「当前页面」对应的资源,供 AI 上下文选择器与 @ 浮层共用。
 * 不用 document.title(整站标题会让用户误以为 @ 的是整个项目):
 * 笔记优先用 note store 里同步的真实标题,拿不到再退固定文案;书签/标签用固定文案。
 */
export function useCurrentPageResource() {
  const route = useRoute();
  const { t } = useI18n();
  const nStore = noteStore();

  return computed<CurrentPageResource | null>(() => {
    const id = String(route.params.id || '');
    if (route.path.startsWith('/noteLibrary/') && id && id !== 'add')
      return { type: 'note', id, title: nStore.currentTitle || t('ai.currentNote') };
    if (route.path.startsWith('/manage/editBookmark/') && id && id !== 'add')
      return { type: 'bookmark', id, title: t('ai.currentBookmark') };
    if (route.path.startsWith('/tag/') && id) return { type: 'tag', id, title: t('ai.currentTag') };
    return null;
  });
}
