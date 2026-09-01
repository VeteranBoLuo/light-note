import { computed, onMounted, reactive, ref, unref, type MaybeRef } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { TagInterface } from '@/config/bookmarkCfg.ts';
import { apiBasePost } from '@/http/request.ts';
import { RESOURCE_COLOR_HEX, type ResourceType } from '@/config/resourceColor.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import { blockGuestWrite } from '@/composables/useGuestGuard';
import { recordOperation } from '@/api/commonApi.ts';
import { normalizeTagIconValue } from '@/utils/tagIcon.ts';

export type TagResourceKind = 'bookmark' | 'note' | 'file';
export type TagResourceItem = { rawId: string; name: string; type: ResourceType };

export interface UseTagEditorOptions {
  tagId?: MaybeRef<string>;
  onSaved?: (id: string) => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
  onClose?: () => void;
}

export function useTagEditor(options: UseTagEditorOptions = {}) {
  const router = useRouter();
  const { t } = useI18n();
  const loading = ref(false);
  const saving = ref(false);
  const allowLeave = ref(false);
  const initialFingerprint = ref('');

  const tag = ref<TagInterface>({
    id: '',
    name: '',
    description: '',
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

  const resolvedTagId = computed(() =>
    String(options.tagId === undefined ? router.currentRoute.value.params.id || '' : unref(options.tagId)).trim(),
  );
  const handleType = computed<'add' | 'edit'>(() => (resolvedTagId.value === 'add' ? 'add' : 'edit'));
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
      description: tag.value.description?.trim() || '',
      iconUrl: tag.value.iconUrl || '',
      bookmarks: [...selectedBookmarkIds.value].sort(),
      notes: [...selectedNoteIds.value].sort(),
      files: [...selectedFileIds.value].sort(),
    });
  }

  const isDirty = computed(() => Boolean(initialFingerprint.value && fingerprint() !== initialFingerprint.value));

  async function loadEditor() {
    loading.value = true;
    try {
      const response = await apiBasePost(
        '/api/bookmark/getTagEditorData',
        handleType.value === 'edit' ? { tagId: resolvedTagId.value } : {},
      );
      if (response.status !== 200 || !response.data) return;

      if (response.data.tag) tag.value = response.data.tag;
      allResources.value = (response.data.resources || []).map((item: TagResourceItem) => ({
        rawId: String(item.rawId),
        name: item.name || (item.type === 'note' ? t('inbox.untitledNote') : ''),
        type: item.type,
      }));
      const activeIds = new Set(allResources.value.map((item) => `${item.type}:${item.rawId}`));
      const selectedIds = (type: TagResourceKind) =>
        (response.data.selectedIds?.[type] || []).map(String).filter((id: string) => activeIds.has(`${type}:${id}`));
      selectedBookmarkIds.value = selectedIds('bookmark');
      selectedNoteIds.value = selectedIds('note');
      selectedFileIds.value = selectedIds('file');
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
      initialFingerprint.value = fingerprint();
      const savedId = String(response.data?.id || tag.value.id || resolvedTagId.value);
      if (options.onSaved) await options.onSaved(savedId);
      else router.back();
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
    confirmLeave(() => {
      allowLeave.value = true;
      if (options.onClose) options.onClose();
      else router.back();
    });
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
          // 删除后目标页已不存在,直接放行离开守卫；弹框与旧路由各自处理下一落点。
          allowLeave.value = true;
          if (options.onDeleted) await options.onDeleted();
          else router.push('/manage/tagMg');
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
