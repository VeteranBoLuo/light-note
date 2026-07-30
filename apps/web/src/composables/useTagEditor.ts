import { computed, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { TagInterface } from '@/config/bookmarkCfg.ts';
import { bookmarkStore, useUserStore } from '@/store';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import { RESOURCE_COLOR_HEX, type ResourceType } from '@/config/resourceColor.ts';
import { CLOUD_FILE_CATEGORY_ORDER } from '@/constants/cloudFileCategory.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import { blockGuestWrite } from '@/composables/useGuestGuard';
import { recordOperation } from '@/api/commonApi.ts';
import { normalizeTagIconValue } from '@/utils/tagIcon.ts';

export type TagResourceKind = 'bookmark' | 'note' | 'file';
export type TagResourceItem = { rawId: string; name: string; type: ResourceType };

export function useTagEditor() {
  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const { t } = useI18n();
  const loading = ref(false);
  const saving = ref(false);
  const allowLeave = ref(false);
  const initialFingerprint = ref('');

  const tag = ref<TagInterface>({
    id: '',
    name: '',
    iconUrl: '',
    color: '',
    createTime: '',
    updateTime: '',
    bookmarkList: [],
    noteList: [],
    fileList: [],
  });
  const allResources = ref<TagResourceItem[]>([]);
  const selectedBookmarkIds = ref<string[]>([]);
  const selectedNoteIds = ref<string[]>([]);
  const selectedFileIds = ref<string[]>([]);
  const activeResourceType = ref<TagResourceKind>('bookmark');
  const searchMap = reactive<Record<TagResourceKind, string>>({ bookmark: '', note: '', file: '' });

  const handleType = computed<'add' | 'edit'>(() => (router.currentRoute.value.params.id === 'add' ? 'add' : 'edit'));
  const pageTitle = computed(() =>
    t(handleType.value === 'add' ? 'tagManage.editorAddTitle' : 'tagManage.editorEditTitle'),
  );
  const totalSelectedCount = computed(
    () => selectedBookmarkIds.value.length + selectedNoteIds.value.length + selectedFileIds.value.length,
  );

  function getResourceItems(type: TagResourceKind) {
    return allResources.value.filter((item) => item.type === type);
  }

  function filterItems(type: TagResourceKind) {
    const keyword = searchMap[type].trim().toLowerCase();
    const items = getResourceItems(type);
    return keyword ? items.filter((item) => item.name.toLowerCase().includes(keyword)) : items;
  }

  const resourceSections = computed(() => [
    {
      type: 'bookmark' as const,
      label: t('tagManage.bookmark'),
      color: RESOURCE_COLOR_HEX.bookmark,
      items: getResourceItems('bookmark'),
      filteredItems: filterItems('bookmark'),
      selectedIds: selectedBookmarkIds.value,
      selectedCount: selectedBookmarkIds.value.length,
    },
    {
      type: 'note' as const,
      label: t('tagManage.note'),
      color: RESOURCE_COLOR_HEX.note,
      items: getResourceItems('note'),
      filteredItems: filterItems('note'),
      selectedIds: selectedNoteIds.value,
      selectedCount: selectedNoteIds.value.length,
    },
    {
      type: 'file' as const,
      label: t('tagManage.file'),
      color: RESOURCE_COLOR_HEX.file,
      items: getResourceItems('file'),
      filteredItems: filterItems('file'),
      selectedIds: selectedFileIds.value,
      selectedCount: selectedFileIds.value.length,
    },
  ]);
  const activeResourceSection = computed(() =>
    resourceSections.value.find((section) => section.type === activeResourceType.value)!,
  );

  function toggleResource(type: TagResourceKind, id: string, checked: boolean) {
    const selectedMap = {
      bookmark: selectedBookmarkIds,
      note: selectedNoteIds,
      file: selectedFileIds,
    };
    const selected = selectedMap[type];
    if (checked) {
      if (!selected.value.includes(id)) selected.value.push(id);
    } else {
      selected.value = selected.value.filter((item) => item !== id);
    }
  }

  function fingerprint() {
    return JSON.stringify({
      name: tag.value.name?.trim() || '',
      iconUrl: tag.value.iconUrl || '',
      bookmarks: [...selectedBookmarkIds.value].sort(),
      notes: [...selectedNoteIds.value].sort(),
      files: [...selectedFileIds.value].sort(),
    });
  }

  const isDirty = computed(() => Boolean(initialFingerprint.value && fingerprint() !== initialFingerprint.value));

  async function getAllResources() {
    const [bookmarkResponse, noteResponse, fileResponse] = await Promise.all([
      apiQueryPost('/api/bookmark/getBookmarkList', {
        pageSize: -1,
        filters: { userId: user.id, type: 'all' },
      }),
      apiBasePost('/api/note/queryNoteList', { pageSize: -1 }),
      apiBasePost('/api/file/queryFiles', {
        pageSize: -1,
        filters: { category: CLOUD_FILE_CATEGORY_ORDER },
      }),
    ]);
    const resources: TagResourceItem[] = [];
    if (bookmarkResponse.status === 200) {
      (bookmarkResponse.data?.items || []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.name, type: 'bookmark' });
      });
    }
    if (noteResponse.status === 200) {
      (noteResponse.data || []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.title || t('inbox.untitledNote'), type: 'note' });
      });
    }
    if (fileResponse.status === 200) {
      (fileResponse.data || []).forEach((item: any) => {
        resources.push({ rawId: String(item.id), name: item.fileName, type: 'file' });
      });
    }
    allResources.value = resources;
  }

  // 仅用于刷新全局标签列表;原先派生的 tagOptions 服务于已下线的手工「相关标签」多选。
  async function refreshTagList() {
    const response = await apiQueryPost('/api/bookmark/queryTagList', { filters: { userId: user.id } });
    if (response.status !== 200) return;
    bookmark.tagList = response.data || [];
  }

  async function loadEditor() {
    loading.value = true;
    try {
      await Promise.all([getAllResources(), refreshTagList()]);
      if (handleType.value === 'edit') {
        const detailResponse = await apiQueryPost('/api/bookmark/getTagDetail', {
          filters: { id: router.currentRoute.value.params.id },
        });
        if (detailResponse.status === 200 && detailResponse.data) tag.value = detailResponse.data;

        // 相关标签已改为自动推导,编辑器不再拉取也不再提交手工关系。
        const [bookmarkResponse, noteResponse, fileResponse] = await Promise.all([
          apiQueryPost('/api/bookmark/getBookmarkList', {
            pageSize: -1,
            filters: { userId: user.id, tagId: tag.value.id, type: 'normal' },
          }),
          apiBasePost('/api/note/queryNoteList', { pageSize: -1, tagId: tag.value.id }),
          apiBasePost('/api/file/queryFiles', {
            pageSize: -1,
            filters: { tagId: tag.value.id, category: CLOUD_FILE_CATEGORY_ORDER },
          }),
        ]);
        selectedBookmarkIds.value = (bookmarkResponse.data?.items || []).map((item: any) => String(item.id));
        selectedNoteIds.value = (noteResponse.data || []).map((item: any) => String(item.id));
        selectedFileIds.value = (fileResponse.data || []).map((item: any) => String(item.id));
      }
      initialFingerprint.value = fingerprint();
    } finally {
      loading.value = false;
    }
  }

  async function submit() {
    if (blockGuestWrite(handleType.value === 'add' ? 'add-tag' : 'update-tag')) return;
    if (loading.value || saving.value) {
      message.warning(t('tagManage.waitForLoading'));
      return;
    }
    const name = tag.value.name?.trim();
    if (!name) {
      message.warning(t('tagManage.tagNameRequired'));
      return;
    }

    saving.value = true;
    try {
      tag.value.name = name;
      tag.value.iconUrl = normalizeTagIconValue(tag.value.iconUrl);
      tag.value.bookmarkList = selectedBookmarkIds.value;
      tag.value.noteList = selectedNoteIds.value;
      tag.value.fileList = selectedFileIds.value;
      const endpoint = handleType.value === 'add' ? '/api/bookmark/addTag' : '/api/bookmark/updateTag';
      const response = await apiBasePost(endpoint, tag.value);
      if (response.status !== 200) return;
      recordOperation({
        module: '标签详情',
        operation: `${handleType.value === 'add' ? '新增' : '保存'}标签成功【${tag.value.name}】`,
      });
      message.success(t('common.saveSuccess'));
      allowLeave.value = true;
      router.back();
    } finally {
      saving.value = false;
    }
  }

  function confirmLeave(onConfirm: () => void) {
    if (!isDirty.value) {
      onConfirm();
      return;
    }
    Alert.alert({
      title: t('tagManage.discardTitle'),
      content: t('tagManage.discardContent'),
      okText: t('tagManage.discardAndLeave'),
      cancelText: t('tagManage.continueEditing'),
      onOk() {
        allowLeave.value = true;
        onConfirm();
      },
    });
  }

  function requestCancel() {
    confirmLeave(() => router.back());
  }

  const deleting = ref(false);

  /** 编辑态底部的「删除标签」:移动端标签卡片去管理化后,删除入口统一收敛到这里。 */
  function requestDelete() {
    if (handleType.value !== 'edit' || !tag.value.id || deleting.value) return;
    if (blockGuestWrite('delete-tag')) return;
    Alert.alert({
      title: t('tagManage.confirmDeleteTitle'),
      content: t('tagManage.confirmDeleteContent', { name: tag.value.name }),
      async onOk() {
        deleting.value = true;
        try {
          const res = await apiBasePost('/api/bookmark/delTag', { id: tag.value.id });
          if (res.status !== 200) return;
          recordOperation({ module: '标签管理', operation: `删除标签成功【${tag.value.name}】` });
          message.success(t('tagManage.deleteSuccess'));
          // 删除后目标页已不存在,直接放行离开守卫回标签列表。
          allowLeave.value = true;
          router.push('/manage/tagMg');
        } finally {
          deleting.value = false;
        }
      },
    });
  }

  onBeforeRouteLeave((to) => {
    if (allowLeave.value || !isDirty.value) return true;
    confirmLeave(() => router.push(to.fullPath));
    return false;
  });

  onMounted(loadEditor);

  return {
    tag,
    loading,
    saving,
    activeResourceType,
    searchMap,
    handleType,
    pageTitle,
    totalSelectedCount,
    resourceSections,
    activeResourceSection,
    toggleResource,
    submit,
    requestCancel,
    deleting,
    requestDelete,
  };
}
