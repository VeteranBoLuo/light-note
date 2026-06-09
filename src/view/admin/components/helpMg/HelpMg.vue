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
          <b-button type="success" @click="publishAllDraft" :loading="publishingDraft">发布全部</b-button>
          <b-button type="primary" @click="saveCurrentDraft" :loading="savingDraft">保存草稿</b-button>
          <b-button type="danger" @click="deleteCurrentDraft">删除草稿</b-button>
          <b-button @click="syncFromPublished">同步帮助中心</b-button>
          <b-button @click="exportCurrentDraft">导出</b-button>
          <b-button @click="exportAllDrafts">导出全部</b-button>
        </div>
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
            <b-input v-model:value="editTitle" placeholder="请输入标题" style="width: 200px" />
            <b-button :type="isCreateMode ? 'primary' : ''" @click="switchMode(true)">新增模式</b-button>
            <b-button :type="!isCreateMode ? 'primary' : ''" @click="switchMode(false)">编辑模式</b-button>
          </div>
          <Editor class="help-draft__editor" v-model:content="draftContent" image-upload-mode="base64" />
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
  import Editor from '@/components/noteLibrary/detail/Editor.vue';
  import TurndownService from 'turndown';
  import JSZip from 'jszip';

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
  const publishingDraft = ref(false);
  const savingSort = ref(false);
  const draftContent = ref('');
  const canDragDraft = computed(() => !isCreateMode.value && !searchValue.value.trim());
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  const viewOptions = computed(() => {
    if (!searchValue.value) {
      return draftOptions.value;
    }
    return draftOptions.value.filter(
      (item) => item.title.includes(searchValue.value) || item.id.includes(searchValue.value),
    );
  });

  const currentNode = computed<HelpItem | null>(() => {
    if (isCreateMode.value || !checkId.value) {
      return null;
    }
    return draftOptions.value.find((item) => String(item.id) === String(checkId.value)) || null;
  });

  const resetEditorScroll = async () => {
    await nextTick();
    const editorRoot = document.querySelector<HTMLElement>('.help-draft__editor');
    const scrollContainer = editorRoot?.querySelector<HTMLElement>('.note-editor-scroll');
    const editorBody = editorRoot?.querySelector<HTMLElement>('.note-editor-body');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
    if (editorBody) {
      editorBody.scrollTop = 0;
    }
  };

  const updateEditorContent = async (content?: string) => {
    if (isCreateMode.value) {
      draftContent.value = '<p>请在这里编辑帮助内容</p>';
      await resetEditorScroll();
      return;
    }
    draftContent.value = content ?? currentNode.value?.content ?? '';
    await resetEditorScroll();
  };

  const selectDraftLocally = async (item?: HelpItem | null) => {
    if (!item) {
      isCreateMode.value = false;
      checkId.value = '';
      editTitle.value = '';
      draftContent.value = '';
      return;
    }
    isCreateMode.value = false;
    checkId.value = String(item.id);
    editTitle.value = item.title || '';
    await updateEditorContent(item.content || '');
  };

  const persistCurrentLocalDraft = () => {
    if (isCreateMode.value) {
      return;
    }
    if (!checkId.value) return;
    const item = draftOptions.value.find((row) => String(row.id) === String(checkId.value));
    if (!item) return;
    item.title = editTitle.value || '';
    item.content = draftContent.value || '';
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
      await selectDraftLocally(draftOptions.value[0]);
      return;
    }
    await selectDraftLocally(null);
  };

  const selectNode = async (item: HelpItem) => {
    if (!isCreateMode.value) {
      persistCurrentLocalDraft();
    }
    isCreateMode.value = false;
    await selectDraftLocally(item);
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
    const target =
      draftOptions.value.find((item) => String(item.id) === String(checkId.value)) || draftOptions.value[0];
    await selectDraftLocally(target);
  };

  const saveDraftInternal = async () => {
    if (savingDraft.value) {
      return false;
    }
    savingDraft.value = true;
    try {
      if (isCreateMode.value) {
        const title = (editTitle.value || '').trim();
        const content = draftContent.value || '';
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
        const createdItem = draftOptions.value.find((item) => String(item.id) === newId);
        await selectDraftLocally(createdItem || draftOptions.value[0] || null);
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
        content: draftContent.value || '',
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

  const safeFileName = (name?: string, fallback = '帮助文档') => {
    const value = (name || fallback).trim() || fallback;
    return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  };

  const downloadFile = (fileName: string, content: BlobPart, mimeType: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const htmlToMarkdown = (html: string) => {
    try {
      return turndownService.turndown(html || '').trim();
    } catch (error) {
      console.error('帮助文档 HTML 转 Markdown 失败:', error);
      return html || '';
    }
  };

  const buildMarkdown = (item: HelpItem) => {
    const title = (item.title || '未命名帮助文档').trim();
    const markdownBody = htmlToMarkdown(item.content || '');
    return `# ${title}\n\n${markdownBody}\n`;
  };

  const getCurrentExportItem = (): HelpItem | null => {
    if (isCreateMode.value) {
      return {
        id: 'new',
        title: editTitle.value || '未保存帮助文档',
        content: draftContent.value || '',
      };
    }
    persistCurrentLocalDraft();
    return currentNode.value;
  };

  const exportCurrentDraft = () => {
    const item = getCurrentExportItem();
    if (!item) {
      message.warning('请选择要导出的草稿');
      return;
    }
    if (!item.title?.trim()) {
      message.warning('请先输入标题');
      return;
    }
    const markdown = buildMarkdown(item);
    downloadFile(`${safeFileName(item.title)}.md`, markdown, 'text/markdown;charset=utf-8');
    message.success('当前草稿已导出为 Markdown');
  };

  const exportAllDrafts = async () => {
    if (!draftOptions.value.length) {
      message.warning('暂无可导出的草稿');
      return;
    }
    if (!isCreateMode.value) {
      persistCurrentLocalDraft();
    }
    const zip = new JSZip();
    const usedNames = new Set<string>();
    draftOptions.value.forEach((item, index) => {
      const baseName = safeFileName(`${String(index + 1).padStart(2, '0')}-${item.title || '未命名帮助文档'}`);
      let fileName = `${baseName}.md`;
      let count = 2;
      while (usedNames.has(fileName)) {
        fileName = `${baseName}-${count}.md`;
        count += 1;
      }
      usedNames.add(fileName);
      zip.file(fileName, buildMarkdown(item));
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadFile('轻笺帮助中心草稿-Markdown.zip', zipBlob, 'application/zip');
    message.success(`已导出 ${draftOptions.value.length} 篇草稿`);
  };

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
        publishingDraft.value = true;
        try {
          if (isCreateMode.value) {
            const saved = await saveDraftInternal();
            if (!saved) {
              return;
            }
          } else {
            persistCurrentLocalDraft();
          }
          const saveRes = await saveHelpDraftBatch(toBatchPayload());
          if (saveRes.status !== 200) {
            return;
          }
          const publishRes = await publishAllHelpDraft();
          if (publishRes.status === 200) {
            const total = Number(publishRes?.data?.total || 0);
            message.success(`全量替换成功，已同步 ${total} 条草稿到帮助中心`);
          }
        } finally {
          publishingDraft.value = false;
        }
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
      } else {
      }
    } finally {
      savingSort.value = false;
    }
  };

  const handleImageClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target?.tagName === 'IMG' || target?.classList?.contains('bookmark-image')) {
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
    overflow: hidden !important;
    :deep(.category-body) {
      height: 100% !important;
    }
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
    padding: 0;
    overflow: hidden;
    outline: none;
  }

  .help-draft__editor :deep(#editor-container.note-editor) {
    height: 100%;
  }

  .help-draft__editor :deep(.note-editor-toolbar) {
    border-radius: 12px 12px 0 0;
  }

  .help-draft__editor :deep(.note-editor-body) {
    padding: 16px;
    line-height: 2rem;
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
