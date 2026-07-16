import { ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import icon from '@/config/icon.ts';
import type { BookmarkInterface } from '@/config/bookmarkCfg.ts';
import { loadBookmarkIconsProgressively, recordOperation } from '@/api/commonApi.ts';
import { blockGuestWrite } from '@/composables/useGuestGuard';

export function useBookmarkManage() {
  const { t } = useI18n();
  const user = useUserStore();
  const loading = ref(false);
  const bookmarks = ref<BookmarkInterface[]>([]);

  function normalizedIcon(bookmark: BookmarkInterface) {
    return bookmark.iconUrl || icon.nullImg;
  }

  async function reloadBookmarks() {
    loading.value = true;
    try {
      const response = await apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: user.id, type: 'all' },
      });
      if (response.status !== 200) return;

      bookmarks.value = cloneDeep(response.data?.items || []);
      bookmarks.value.forEach((bookmark) => {
        bookmark.iconUrl = normalizedIcon(bookmark);
      });

      loadBookmarkIconsProgressively(response.data?.items || [], (id, favicon) => {
        const bookmark = bookmarks.value.find((item) => item.id === id);
        if (bookmark) bookmark.iconUrl = favicon;
      });
    } finally {
      loading.value = false;
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
    bookmarks,
    reloadBookmarks,
    confirmDeleteBookmark,
  };
}
