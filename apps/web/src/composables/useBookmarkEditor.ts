import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { apiBasePost, apiQueryPost } from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import { recordOperation, refreshBookmarkIcon } from '@/api/commonApi';
import { blockGuestWrite } from '@/composables/useGuestGuard';
import { useInboxOrganizer } from '@/composables/useInboxOrganizer';
import { useBookmarkMeta } from '@/composables/useBookmarkMeta';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
import { useI18n } from 'vue-i18n';

export interface BookmarkEditorData {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  description: string;
  createTime?: string;
  iconCheckedAt?: string;
  relatedTags: string[];
}

export interface BookmarkTagOption {
  label: string;
  value: string;
}

export interface BookmarkEditorErrors {
  name: string;
  url: string;
}

export function useBookmarkEditor() {
  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const { t } = useI18n();
  const { isOrganizingFromInbox, completingInbox, completeInboxResource } = useInboxOrganizer();

  const bookmarkData = ref<BookmarkEditorData>({
    id: '',
    name: '',
    url: '',
    iconUrl: '',
    description: '',
    createTime: '',
    relatedTags: [],
  });
  const tagOptions = ref<BookmarkTagOption[]>([]);
  const saveSnapshot = ref(true);
  const snapVisible = ref(false);
  const loading = ref(false);
  const submitting = ref(false);
  const refreshingIcon = ref(false);
  const ready = ref(false);
  const initialSignature = ref('');
  const initialUrl = ref('');
  const fieldErrors = reactive<BookmarkEditorErrors>({ name: '', url: '' });
  let allowLeave = false;

  const handleType = computed<'add' | 'edit'>(() => {
    if (router.currentRoute.value.params.id === 'add' || router.currentRoute.value.params.tagId) return 'add';
    return 'edit';
  });
  const isEdit = computed(() => handleType.value === 'edit');
  const bookmarkId = computed(() => String(router.currentRoute.value.params?.id || ''));
  const pageTitle = computed(() =>
    t(handleType.value === 'add' ? 'bookmarkEditor.addTitle' : 'bookmarkEditor.editTitle'),
  );
  const saveLabel = computed(() =>
    isOrganizingFromInbox.value ? t('inbox.saveAndComplete') : t('bookmarkEditor.saveBookmark'),
  );
  const saving = computed(() => submitting.value || completingInbox.value);

  const editorSignature = computed(() =>
    JSON.stringify({
      name: bookmarkData.value.name,
      url: bookmarkData.value.url,
      description: bookmarkData.value.description,
      relatedTags: bookmarkData.value.relatedTags,
      saveSnapshot: handleType.value === 'add' ? saveSnapshot.value : undefined,
    }),
  );
  const isDirty = computed(() => ready.value && editorSignature.value !== initialSignature.value);

  function markPristine() {
    initialSignature.value = editorSignature.value;
    initialUrl.value = bookmarkData.value.url;
  }

  async function getTagSelect(): Promise<BookmarkTagOption[]> {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    });
    if (res.status !== 200 || !Array.isArray(res.data)) return [];
    bookmark.tagList = res.data;
    tagOptions.value = res.data
      .filter((tag) => tag.id !== router.currentRoute.value.params.id)
      .map((tag) => ({ label: tag.name, value: tag.id }));
    return tagOptions.value;
  }

  const { resolvingUrl, generating, generateBookmarkMeta, stopBookmarkMetaGeneration } = useBookmarkMeta({
    bookmarkData,
    tagOptions,
    refreshTags: getTagSelect,
  });

  function validate(): boolean {
    const name = bookmarkData.value.name.trim();
    const url = bookmarkData.value.url.trim();
    fieldErrors.name = name ? '' : t('bookmarkEditor.nameRequired');
    fieldErrors.url = url ? '' : t('bookmarkEditor.urlRequired');
    return !fieldErrors.name && !fieldErrors.url;
  }

  async function submit() {
    if (
      blockGuestWrite(
        'add-bookmark',
        '把整理好的书签存进你自己的轻笺？注册即用、自动登录,免费收藏书签、记笔记、存文件。',
      )
    )
      return;
    if (loading.value || saving.value || !validate()) return;

    submitting.value = true;
    try {
      const urlResult = await preflightBookmarkUrl(bookmarkData.value.url, {
        checkLiveness: handleType.value === 'add' || bookmarkData.value.url.trim() !== initialUrl.value.trim(),
        showError: false,
      });
      if (!urlResult.ok || !urlResult.url) {
        if (!urlResult.cancelled) fieldErrors.url = urlResult.message || t('bookmarkUrl.invalid');
        return;
      }
      fieldErrors.url = '';
      bookmarkData.value.name = bookmarkData.value.name.trim();
      bookmarkData.value.url = urlResult.url;
      const params: Record<string, any> = JSON.parse(JSON.stringify(bookmarkData.value));
      let endpoint = '/api/bookmark/updateBookmark';
      if (handleType.value === 'add') {
        endpoint = '/api/bookmark/addBookmark';
        params.userId = user.id;
        params.saveSnapshot = saveSnapshot.value;
      }
      const res = await apiBasePost(endpoint, params);
      if (res.status !== 200) return;
      recordOperation({
        module: '书签详情',
        operation: `${handleType.value === 'add' ? '新增' : '保存'}书签成功【${bookmarkData.value.name || params.url}】`,
      });
      markPristine();

      if (isOrganizingFromInbox.value && handleType.value === 'edit') {
        const completed = await completeInboxResource('bookmark', bookmarkData.value.id || bookmarkId.value);
        if (!completed) {
          message.warning(t('inbox.completeFailed'));
          return;
        }
        message.success(t('inbox.saveAndCompleteSuccess'));
        allowLeave = true;
        await router.push('/inbox');
        return;
      }

      message.success(t('common.saveSuccess'));
      allowLeave = true;
      router.back();
    } finally {
      submitting.value = false;
    }
  }

  function requestCancel() {
    router.back();
  }

  function goAddTag() {
    router.push('/manage/editTag/add');
  }

  async function handleRefreshIcon() {
    if (!bookmarkData.value.id || refreshingIcon.value) return;
    refreshingIcon.value = true;
    try {
      const iconUrl = await refreshBookmarkIcon(bookmarkData.value);
      if (iconUrl) message.success(t('bookmarkMg.refreshIconSuccess'));
      else message.warning(t('bookmarkMg.refreshIconFailed'));
    } finally {
      refreshingIcon.value = false;
    }
  }

  function confirmDiscardChanges(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert({
        title: t('bookmarkEditor.discardTitle'),
        content: t('bookmarkEditor.discardContent'),
        footer: [
          {
            label: t('bookmarkEditor.continueEditing'),
            function: () => {
              Alert.destroy();
              resolve(false);
            },
          },
          {
            label: t('bookmarkEditor.discardAndLeave'),
            type: 'danger',
            function: () => {
              allowLeave = true;
              Alert.destroy();
              resolve(true);
            },
          },
        ],
      });
    });
  }

  onBeforeRouteLeave(() => {
    if (allowLeave || !isDirty.value) return true;
    return confirmDiscardChanges();
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (allowLeave || !isDirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  watch(
    () => bookmarkData.value.name,
    (value) => {
      if (value.trim()) fieldErrors.name = '';
    },
  );
  watch(
    () => bookmarkData.value.url,
    (value) => {
      if (value.trim()) fieldErrors.url = '';
    },
  );

  onMounted(async () => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    loading.value = true;
    try {
      await getTagSelect();
      if (handleType.value === 'add') {
        const tagId = router.currentRoute.value.params.tagId;
        if (tagId) bookmarkData.value.relatedTags = [String(tagId)];
      } else {
        const [detailRes, tagRes] = await Promise.all([
          apiQueryPost('/api/bookmark/getBookmarkDetail', {
            filters: { id: router.currentRoute.value.params?.id },
          }),
          apiQueryPost('/api/bookmark/getRelatedTag', {
            filters: {
              userId: user.id,
              id: router.currentRoute.value.params?.id,
              type: 'bookmark',
            },
          }),
        ]);
        if (detailRes.status === 200 && detailRes.data) {
          bookmarkData.value = {
            ...bookmarkData.value,
            ...detailRes.data,
            relatedTags: Array.isArray(tagRes.data) ? tagRes.data.map((data) => String(data.id)) : [],
          };
        }
      }
      markPristine();
      ready.value = true;
    } finally {
      loading.value = false;
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    stopBookmarkMetaGeneration({ notify: false });
  });

  return {
    bookmarkData,
    tagOptions,
    saveSnapshot,
    snapVisible,
    loading,
    resolvingUrl,
    generating,
    refreshingIcon,
    fieldErrors,
    handleType,
    isEdit,
    bookmarkId,
    pageTitle,
    saveLabel,
    saving,
    generateBookmarkMeta,
    stopBookmarkMetaGeneration,
    submit,
    requestCancel,
    goAddTag,
    handleRefreshIcon,
  };
}
