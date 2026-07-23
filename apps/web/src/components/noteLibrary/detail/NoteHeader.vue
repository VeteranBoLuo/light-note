<template>
  <div class="note-header">
    <div style="display: flex; align-items: center" :style="{ gap: bookmark.isMobile ? '0' : '20px' }">
      <div class="back-icon" @click="$emit('back')">
        <SvgIcon :src="icon.noteDetail.back" />
      </div>
      <div
        v-if="!bookmark.isMobile"
        class="note-header-title n-title"
        :contenteditable="!readonly"
        id="note-header-title"
        @focusout="$emit('focusout')"
      >
      </div>
      <div
        style="color: #c0c0c0; font-size: 12px"
        v-if="!isStartEdit"
        :style="{ marginLeft: bookmark.isMobile ? '20px' : '0' }"
      >
        <span v-show="note.id"> {{ $t('noteDetail.savedAt') }} {{ updateTime }} </span>
      </div>
      <div v-else style="color: #c0c0c0; font-size: 12px" :style="{ marginLeft: bookmark.isMobile ? '20px' : '0' }">
        <span>{{ $t('noteDetail.saving') }}</span>
      </div>
      <!--标签-->
      <div class="inline-note-tags" v-if="visibleTags.length">
        <span class="inline-note-tag" v-for="tag in displayedTags" :key="`${tag.id ?? tag.name}`" :title="tag.name">
          {{ tag.name }}
        </span>
        <span v-if="hiddenTagCount" class="inline-note-tag inline-note-tag--more">+{{ hiddenTagCount }}</span>
      </div>
      <ResourceBacklinks
        v-if="bookmark.isDesktop && note?.id"
        placement="header"
        target-type="note"
        :target-id="note.id"
      />
    </div>
    <div class="flex-align-center" style="gap: 20px">
      <span class="mode-pill-group" v-if="!readonly">
        <BTooltip :title="$t('note.switchModeTooltip')">
          <span class="mode-pill" :class="`is-${noteType}`" @click.stop="$emit('switchMode')">
            {{ noteType === 'html' ? 'HTML' : 'MD' }}
          </span>
        </BTooltip>
        <span v-if="hasBackup && !bookmark.isMobile" style="margin-left: 5px">
          <BTooltip :title="$t('note.undoSwitchTitle')">
            <span class="undo-switch-btn" @click.stop="$emit('undoSwitch')">↩</span>
          </BTooltip>
        </span>
      </span>
      <!-- 存为模板:两端可用(移动端 header 图标区尚有余量;标签/导出/历史仍为桌面专属) -->
      <BTooltip :title="$t('note.saveAsTemplate')" v-if="!readonly">
        <div
          class="note-header-title-icon note-header-title-icon--template"
          @click="$emit('saveAsTemplate')"
          v-click-log="OPERATION_LOG_MAP.note.saveAsTemplate"
        >
          <SvgIcon :src="icon.noteDetail.template" />
        </div>
      </BTooltip>
      <BTooltip :title="$t('noteDetail.history.entry')" v-if="!readonly && bookmark.isDesktop && note?.id">
        <div
          class="note-header-title-icon note-header-title-icon--history"
          @click="$emit('history')"
          v-click-log="OPERATION_LOG_MAP.note.history"
        >
          <SvgIcon :src="icon.noteDetail.history" />
        </div>
      </BTooltip>
      <BTooltip :title="$t('noteDetail.tags')" v-if="bookmark.isDesktop">
        <div
          class="note-header-title-icon note-header-title-icon--tag"
          @click="updateTag"
          v-click-log="OPERATION_LOG_MAP.note.updateTag"
        >
          <SvgIcon :src="icon.manage_categoryBtn_tag" />
        </div>
      </BTooltip>
      <BTooltip :title="$t('noteDetail.export')" v-if="bookmark.isDesktop">
        <div
          class="note-header-title-icon note-header-title-icon--export"
          @click="openExportModal"
          v-click-log="OPERATION_LOG_MAP.note.exportNote"
        >
          <SvgIcon :src="icon.noteDetail.exportLine" />
        </div>
      </BTooltip>
      <BTooltip :title="$t('noteDetail.delete')">
        <div class="note-header-title-icon note-header-title-icon--danger" @click="$emit('del')">
          <SvgIcon :src="icon.noteDetail.deleteLine" />
        </div>
      </BTooltip>
      <BTooltip :title="$t('noteDetail.save')" v-if="!bookmark.isMobile">
        <div class="note-header-title-icon note-header-title-icon--save" @click="$emit('save', true)">
          <SvgIcon :src="icon.noteDetail.saveLine" />
        </div>
      </BTooltip>
    </div>
    <NoteTagConfig
      v-if="tagConfDlgVisible"
      v-model:visible="tagConfDlgVisible"
      :note="note"
      @saveTag="handleTagSaved"
    />
    <ActionCardModal
      v-if="exportModalVisible"
      v-model:visible="exportModalVisible"
      maskClosable
      :title="$t('noteDetail.exportNote')"
      :sections="exportSections"
      :note="$t('noteDetail.exportNoteDesc')"
    />
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import { defineAsyncComponent, ref } from 'vue';
  import { generatePDF } from '@/utils/htmlToPdf.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import ResourceBacklinks from '@/components/noteLibrary/detail/ResourceBacklinks.vue';
  import TurndownService from 'turndown';
  import { useI18n } from 'vue-i18n';
  import { computed } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { watch } from 'vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  const NoteTagConfig = defineAsyncComponent(() => import('@/components/noteLibrary/detail/NoteTagConfig.vue'));
  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const props = defineProps<{
    updateTime: string;
    readonly: boolean;
    isStartEdit: boolean;
    note: any;
    noteType?: string;
    hasBackup?: boolean;
  }>();

  const { t } = useI18n();
  const emit = defineEmits([
    'back',
    'focusout',
    'del',
    'save',
    'switchMode',
    'undoSwitch',
    'history',
    'saveAsTemplate',
  ]);

  const bookmark = bookmarkStore();

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  const downloadFile = (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const tagConfDlgVisible = ref(false);
  function updateTag() {
    tagConfDlgVisible.value = true;
  }

  const exportModalVisible = ref(false);
  const openExportModal = () => {
    exportModalVisible.value = true;
  };

  const headerTags = ref<any[]>([]);

  function normalizeTags(raw: any) {
    if (!raw) return [];
    let source = raw;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(source)) return [];
    return source
      .map((item) => {
        if (item && typeof item === 'object' && item.name) {
          return { id: item.id, name: item.name };
        }
        if (typeof item === 'string') {
          return { id: item, name: item };
        }
        return null;
      })
      .filter((item) => item && item.name);
  }

  async function fetchNoteTags() {
    if (!props.note?.id) {
      headerTags.value = [];
      return;
    }
    try {
      const res = await apiBasePost('/api/note/getNoteTags', { id: props.note.id });
      if (res.status === 200 && Array.isArray(res.data)) {
        headerTags.value = normalizeTags(res.data);
      }
    } catch (error) {
      console.warn('fetch note tags failed', error);
    }
  }

  function handleTagSaved() {
    emit('save');
    fetchNoteTags();
  }

  const visibleTags = computed(() => {
    if (headerTags.value.length) {
      return headerTags.value;
    }
    return normalizeTags(props.note?.tags || props.note?.tagList);
  });
  const displayedTags = computed(() => visibleTags.value.slice(0, bookmark.isMobile ? 1 : 3));
  const hiddenTagCount = computed(() => Math.max(0, visibleTags.value.length - displayedTags.value.length));

  watch(
    () => props.note?.id,
    () => {
      fetchNoteTags();
    },
    { immediate: true },
  );

  const exportToPDF = async () => {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('noteDetail.confirmExportPdf'),
      async onOk() {
        exportModalVisible.value = false;
        // 富文本(html)导出编辑器 DOM .note-editor-body;Markdown 导出渲染后的 .md-preview。
        // 原来写死 .note-editor-body,MD 笔记该元素根本不存在 → 导出空白。
        // 另:MD 纯编辑视图下 .md-preview 被 v-show 隐藏(offsetHeight=0,html2canvas 截不到),提示用户切视图。
        const isMd = props.noteType === 'markdown';
        const selector = isMd ? '.md-preview' : '.note-editor-body';
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el || el.offsetHeight === 0) {
          message.warning(isMd ? t('noteDetail.exportPdfTip') : t('noteDetail.noExportContent'));
          return;
        }
        await generatePDF(props.note.title, selector);
        recordOperation({
          module: '笔记',
          operation: `导出PDF成功【${props.note.title || t('noteDetail.unnamedDoc')}】`,
        });
      },
    });
  };

  const exportToHTML = async () => {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('noteDetail.confirmExportHtml'),
      async onOk() {
        exportModalVisible.value = false;
        const title = props.note.title || t('noteDetail.unnamedDoc');
        const safeFileName = `${title}.html`;
        const body = props.note.content || '';
        const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8" /><title>${escapeHtml(
          title,
        )}</title></head><body>${body}</body></html>`;
        downloadFile(safeFileName, html, 'text/html;charset=utf-8');
        recordOperation({ module: '笔记', operation: `导出HTML成功【${title}】` });
      },
    });
  };

  const exportToMarkdown = async () => {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('noteDetail.confirmExportMd'),
      async onOk() {
        exportModalVisible.value = false;
        const title = props.note.title || t('noteDetail.unnamedDoc');
        const safeFileName = `${title}.md`;
        const body = props.note.content || '';
        let markdownBody = '';
        try {
          markdownBody = turndownService.turndown(body);
        } catch (e) {
          console.error('HTML 转 Markdown 失败:', e);
          markdownBody = body;
        }
        const markdown = `# ${title}\n\n${markdownBody}`;
        downloadFile(safeFileName, markdown, 'text/markdown;charset=utf-8');
        recordOperation({ module: '笔记', operation: `导出Markdown成功【${title}】` });
      },
    });
  };

  const exportSections = computed(() => [
    {
      key: 'export',
      title: '',
      actions: [
        {
          key: 'pdf',
          label: t('noteDetail.exportAsPdf'),
          description: t('noteDetail.exportAsPdfDesc'),
          onClick: exportToPDF,
        },
        {
          key: 'html',
          label: t('noteDetail.exportAsHtml'),
          description: t('noteDetail.exportAsHtmlDesc'),
          onClick: exportToHTML,
        },
        {
          key: 'markdown',
          label: t('noteDetail.exportAsMd'),
          description: t('noteDetail.exportAsMdDesc'),
          onClick: exportToMarkdown,
        },
      ],
    },
  ]);
</script>
<style lang="less">
  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    height: 60px;
    width: 100%;
    box-sizing: border-box;
    padding: 0 20px;
    background-color: var(--note-header-bg-color);
    border-bottom: 1px solid var(--notePage-topBody-border-color);
    position: fixed;
    top: 0;
    // 顶部栏中的引用下拉需要越过下方固定的编辑工作区。
    z-index: 30;
  }
  .note-header-title {
    padding: 0 10px;
    height: 28px;
    display: flex;
    align-items: center;
    border-radius: 6px;
    box-sizing: border-box;
    outline: none;
    border: 1px solid transparent;
    transition: border-color 0.1s linear;
    &:hover {
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    &:focus {
      border-color: #615ced !important;
    }
    &:empty:before {
      color: #aaa;
      content: '未命名文档';
    }
  }
  .note-header-title-icon {
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    background: var(--card-background);
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--sub-text-color);
    transition:
      color 0.16s ease,
      background-color 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;

    &:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
      box-shadow: var(--surface-card-shadow, 0 5px 12px rgba(0, 0, 0, 0.08));
      color: var(--primary-color);
      transform: translateY(-1px);
    }

    &--template {
      border-color: color-mix(in srgb, var(--resource-note-color) 26%, var(--card-border-color));
      background: color-mix(in srgb, var(--resource-note-color) 8%, var(--card-background));
      color: var(--resource-note-color);

      &:hover {
        border-color: var(--resource-note-color);
        background: color-mix(in srgb, var(--resource-note-color) 14%, var(--card-background));
        color: var(--resource-note-color);
      }
    }

    &--tag:hover {
      border-color: var(--resource-tag-color);
      background: color-mix(in srgb, var(--resource-tag-color) 8%, var(--card-background));
      color: var(--resource-tag-color);
    }

    &--danger:hover {
      border-color: var(--error-color, #e5484d);
      background: color-mix(in srgb, var(--error-color, #e5484d) 8%, var(--card-background));
      color: var(--error-color, #e5484d);
    }

    &--save {
      border-color: color-mix(in srgb, var(--primary-color) 30%, var(--card-border-color));
      background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
      color: var(--primary-color);

      &:hover {
        background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background));
        color: var(--primary-color);
      }
    }
  }

  .inline-note-tags {
    margin-left: 12px;
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 320px;
    overflow: hidden;
    white-space: nowrap;
  }

  .inline-note-tag {
    flex: 0 0 auto;
    max-width: 108px;
    height: 22px;
    padding: 0 8px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, transparent);
    color: var(--resource-note-color, #00a884);
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    cursor: default;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inline-note-tag--more {
    max-width: none;
    color: var(--desc-color);
    background: var(--common-tag-bg-color, #f0f0f0);
  }
</style>
