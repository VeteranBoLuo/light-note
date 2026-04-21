<template>
  <div class="admin-panel-container">
    <section class="admin-panel help-draft__panel">
      <header class="admin-header help-draft__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Help</p>
          <h2 class="admin-title">帮助中心编辑</h2>
          <p class="admin-subtitle">草稿保存后可全量发布到帮助中心</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">草稿条目</span>
          <strong class="admin-stat-value">{{ draftOptions.length }}</strong>
          <span class="admin-stat-hint">总计</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">当前编辑</span>
          <strong class="admin-stat-value">{{ currentNode?.title || '-' }}</strong>
          <span class="admin-stat-hint">条目</span>
        </li>
      </ul>

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input v-model:value="searchValue" placeholder="搜索目录名" class="log-search-input">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <b-button type="primary" @click="syncFromPublished">同步帮助中心</b-button>
          <b-button type="primary" @click="saveCurrentDraft">保存草稿</b-button>
          <b-button type="danger" @click="deleteCurrentDraft">删除草稿</b-button>
          <b-button type="success" @click="publishAllDraft">发布全部</b-button>
        </div>
        <span class="admin-filters-hint">编辑仅限 root 用户 · 发布后帮助中心立即生效</span>
      </div>

      <div class="help-draft__body">
        <div class="help-draft__menu">
          <BList
            :listOptions="viewOptions"
            v-model:dragList="draftOptions"
            :draggable="canDragDraft"
            :check-id="checkId"
            @nodeClick="selectNode"
            @onEnd="onDraftDragEnd"
            force-fallback
          >
            <template #icon>
              <svg-icon :src="icon.help_document" />
            </template>
          </BList>
        </div>
        <div class="help-draft__editor-panel">
          <div class="help-draft__mode-switch">
            <b-button :type="isCreateMode ? 'primary' : ''" @click="switchMode(true)">新增模式</b-button>
            <b-button :type="!isCreateMode ? 'primary' : ''" @click="switchMode(false)">编辑模式</b-button>
          </div>
          <b-input v-model:value="editTitle" placeholder="请输入标题" />
          <div ref="editorRef" class="help-draft__editor" contenteditable="true"></div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import {
    deleteHelpDraft as deleteHelpDraftApi,
    getHelpDraftConfig,
    publishAllHelpDraft,
    saveHelpDraft,
    saveHelpDraftBatch,
    syncHelpDraftFromPublished,
  } from '@/api/helpApi';
  import { bookmarkStore } from '@/store';

  type HelpItem = {
    id: string;
    title: string;
    content: string;
  };

  const bookmark = bookmarkStore();
  const draftOptions = ref<HelpItem[]>([]);
  const checkId = ref('');
  const searchValue = ref('');
  const editTitle = ref('');
  const isCreateMode = ref(false);
  const savingDraft = ref(false);
  const savingSort = ref(false);
  const editorRef = ref<HTMLElement>();
  const canDragDraft = computed(() => !isCreateMode.value && !searchValue.value.trim());

  const viewOptions = computed(() => {
    if (!searchValue.value) {
      return draftOptions.value;
    }
    return draftOptions.value.filter((item) => item.title.includes(searchValue.value) || item.id.includes(searchValue.value));
  });

  const currentNode = computed<HelpItem | null>(() => {
    if (!checkId.value) {
      return draftOptions.value[0] || null;
    }
    return draftOptions.value.find((item) => String(item.id) === String(checkId.value)) || null;
  });

  const updateEditorContent = async (content?: string) => {
    await nextTick();
    if (!editorRef.value) return;
    if (isCreateMode.value) {
      editorRef.value.innerHTML = '<p>请在这里编辑帮助内容</p>';
      return;
    }
    editorRef.value.innerHTML = content ?? currentNode.value?.content ?? '';
  };

  const persistCurrentLocalDraft = () => {
    if (isCreateMode.value) {
      return;
    }
    if (!currentNode.value) return;
    const item = draftOptions.value.find((row) => String(row.id) === String(currentNode.value?.id));
    if (!item) return;
    item.title = editTitle.value || '';
    item.content = editorRef.value?.innerHTML || '';
  };

  const normalizeHelpRows = (rows: any[]): HelpItem[] => {
    return (rows || []).map((item) => ({
      id: String(item.id),
      title: item.title || '',
      content: item.content || '',
    }));
  };

  const fetchDraftConfig = async () => {
    const res = await getHelpDraftConfig();
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      draftOptions.value = normalizeHelpRows(res.data);
    } else {
      draftOptions.value = [];
    }
    if (draftOptions.value.length > 0) {
      checkId.value = draftOptions.value[0].id;
      editTitle.value = draftOptions.value[0].title || '';
      await updateEditorContent(draftOptions.value[0].content || '');
      return;
    }
    editTitle.value = '';
    await updateEditorContent('');
  };

  const selectNode = async (item: HelpItem) => {
    if (!isCreateMode.value) {
      persistCurrentLocalDraft();
    }
    isCreateMode.value = false;
    checkId.value = String(item.id);
    editTitle.value = item.title || '';
    await updateEditorContent(item.content || '');
  };

  const switchMode = async (createMode: boolean) => {
    if (createMode === isCreateMode.value) {
      return;
    }
    if (!isCreateMode.value) {
      persistCurrentLocalDraft();
    }
    isCreateMode.value = createMode;
    if (createMode) {
      checkId.value = '';
      editTitle.value = '';
      await updateEditorContent();
      return;
    }
    if (draftOptions.value.length > 0 && !checkId.value) {
      checkId.value = String(draftOptions.value[0].id);
    }
    const target = draftOptions.value.find((item) => String(item.id) === String(checkId.value)) || draftOptions.value[0];
    editTitle.value = target?.title || '';
    await updateEditorContent(target?.content || '');
  };

  const saveDraftInternal = async () => {
    if (savingDraft.value) {
      return false;
    }
    savingDraft.value = true;
    try {
    if (isCreateMode.value) {
      const title = (editTitle.value || '').trim();
      const content = editorRef.value?.innerHTML || '';
      if (!title) {
        message.warning('请先输入标题');
        return false;
      }
      const res = await saveHelpDraft({
        title,
        content,
      });
      if (res.status !== 200) {
        return false;
      }
      const newId = res.data?.id ? String(res.data.id) : '';
      await fetchDraftConfig();
      if (newId) {
        checkId.value = newId;
      }
      isCreateMode.value = false;
      message.success('新增草稿成功');
      return true;
    }
    persistCurrentLocalDraft();
    if (!currentNode.value) {
      message.warning('暂无可保存的草稿');
      return false;
    }
    const payload = {
      id: String(currentNode.value.id),
      title: editTitle.value || '',
      content: editorRef.value?.innerHTML || '',
    };
    const res = await saveHelpDraft(payload);
    if (res.status === 200) {
      message.success('草稿保存成功');
      return true;
    }
    return false;
    } finally {
      savingDraft.value = false;
    }
  };

  const saveCurrentDraft = async () => {
    await saveDraftInternal();
  };

  const toBatchPayload = () =>
    draftOptions.value.map((item, index) => ({
      id: item.id,
      title: item.title || '',
      content: item.content || '',
      sort: index,
    }));

  const syncFromPublished = () => {
    Alert.alert({
      title: '提示',
      content: '同步会用帮助中心当前已发布内容覆盖现有草稿，是否继续？',
      onOk() {
        syncHelpDraftFromPublished().then(async (res) => {
          if (res.status === 200) {
            message.success('同步成功');
            await fetchDraftConfig();
          }
        });
      },
    });
  };

  const publishAllDraft = () => {
    Alert.alert({
      title: '提示',
      content: '将用草稿内容全量替换帮助中心（会移除帮助中心中未出现在草稿里的条目），是否继续？',
      async onOk() {
        if (isCreateMode.value) {
          const saved = await saveDraftInternal();
          if (!saved) {
            return;
          }
        } else {
          persistCurrentLocalDraft();
        }
        saveHelpDraftBatch(toBatchPayload()).then((saveRes) => {
          if (saveRes.status !== 200) {
            return;
          }
          publishAllHelpDraft().then((publishRes) => {
            if (publishRes.status === 200) {
              const total = Number(publishRes?.data?.total || 0);
              message.success(`全量替换成功，已同步 ${total} 条草稿到帮助中心`);
            }
          });
        });
      },
    });
  };

  const deleteCurrentDraft = () => {
    if (isCreateMode.value) {
      message.warning('新增模式下暂无可删除草稿');
      return;
    }
    if (!currentNode.value) {
      message.warning('请选择要删除的草稿');
      return;
    }
    const deletingId = String(currentNode.value.id);
    Alert.alert({
      title: '提示',
      content: `确认删除草稿【${currentNode.value.title || deletingId}】吗？`,
      async onOk() {
        const res = await deleteHelpDraftApi(deletingId);
        if (res.status !== 200) {
          return;
        }
        draftOptions.value = draftOptions.value.filter((item) => String(item.id) !== deletingId);
        if (draftOptions.value.length > 0) {
          const nextItem = draftOptions.value[0];
          isCreateMode.value = false;
          checkId.value = String(nextItem.id);
          editTitle.value = nextItem.title || '';
          await updateEditorContent(nextItem.content || '');
        } else {
          isCreateMode.value = true;
          checkId.value = '';
          editTitle.value = '';
          await updateEditorContent('');
        }
        message.success('草稿删除成功');
      },
    });
  };

  const onDraftDragEnd = async () => {
    if (isCreateMode.value) {
      return;
    }
    persistCurrentLocalDraft();
    if (savingSort.value) {
      return;
    }
    savingSort.value = true;
    try {
      const res = await saveHelpDraftBatch(toBatchPayload());
      if (res.status !== 200) {
        message.error('顺序保存失败，请重试');
      }
    } finally {
      savingSort.value = false;
    }
  };

  const handleImageClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target?.classList?.contains('bookmark-image')) {
      bookmark.refreshViewer((target as HTMLImageElement).src, {});
    }
  };

  onMounted(async () => {
    await fetchDraftConfig();
    isCreateMode.value = false;
    document.addEventListener('click', handleImageClick);
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleImageClick);
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .help-draft__body {
    margin-top: 8px;
    display: flex;
    gap: 12px;
    min-height: 0;
    height: 100%;
  }

  .help-draft__menu {
    width: 240px;
    min-width: 240px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    padding: 8px;
    overflow: auto;
  }

  .help-draft__editor-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  .help-draft__editor {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    padding: 16px;
    overflow: auto;
    line-height: 2rem;
    outline: none;
  }

  .help-draft__editor :deep(.bookmark-image) {
    width: 100%;
    height: auto;
    border: 1px solid #ddd;
    padding: 5px;
    box-sizing: border-box;
  }

  .help-draft__mode-switch {
    display: flex;
    gap: 10px;
  }

  @media (max-width: 1100px) {
    .admin-filters-main {
      flex-wrap: wrap;
    }

    .help-draft__menu {
      width: 200px;
      min-width: 200px;
    }
  }
</style>
