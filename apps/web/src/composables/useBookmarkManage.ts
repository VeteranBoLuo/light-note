import { computed, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import type { BookmarkInterface } from '@/config/bookmarkCfg.ts';
import { loadBookmarkIconsProgressively, recordOperation } from '@/api/commonApi.ts';
import { blockGuestWrite } from '@/composables/useGuestGuard';

export function useBookmarkManage() {
  const { t } = useI18n();
  const user = useUserStore();
  const loading = ref(false);
  const hasLoaded = ref(false);
  const loadError = ref(false);
  const bookmarks = ref<BookmarkInterface[]>([]);
  const initialLoading = computed(() => !hasLoaded.value);
  const refreshing = computed(() => loading.value && hasLoaded.value);
  let requestSequence = 0;
  let activeRequests = 0;

  async function reloadBookmarks(options: { refreshIcons?: boolean } = {}) {
    const { refreshIcons = true } = options;
    const requestId = ++requestSequence;
    activeRequests += 1;
    loading.value = true;
    loadError.value = false;
    try {
      const response = await apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: user.id, type: 'all' },
      });
      if (response.status !== 200) {
        if (requestId === requestSequence) loadError.value = true;
        return false;
      }

      if (requestId !== requestSequence) return false;
      bookmarks.value = cloneDeep(response.data?.items || []);

      if (!refreshIcons) return true;

      loadBookmarkIconsProgressively(response.data?.items || [], (id, favicon) => {
        const bookmark = bookmarks.value.find((item) => item.id === id);
        if (bookmark) bookmark.iconUrl = favicon;
      });
      return true;
    } catch (error) {
      if (requestId === requestSequence) loadError.value = true;
      throw error;
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
      if (requestId === requestSequence) hasLoaded.value = true;
      loading.value = activeRequests > 0;
    }
  }

  function confirmDeleteBookmark(bookmark: BookmarkInterface) {
    if (blockGuestWrite('delete-bookmark')) return;
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('bookmarkMg.deleteConfirm', { name: bookmark.name }),
      async onOk() {
        const response = await apiBasePost('/api/bookmark/delBookmark', { id: bookmark.id });
        if (response.status !== 200) return;
        recordOperation({ module: '书签管理', operation: `删除书签成功【${bookmark.name}】` });
        message.success(t('common.deleteSuccess'));
        await reloadBookmarks();
      },
    });
  }

  return {
    loading,
    hasLoaded,
    initialLoading,
    refreshing,
    loadError,
    bookmarks,
    reloadBookmarks,
    confirmDeleteBookmark,
  };
}
