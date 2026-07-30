<template>
  <div
    class="note-header"
    :class="{
      'note-header--mobile': bookmark.isMobile,
      'note-header--tablet': bookmark.isTablet,
    }"
  >
    <template v-if="bookmark.isMobile">
      <BButton
        class="note-header-mobile-icon-button note-header-mobile-back"
        :aria-label="$t('common.back')"
        @click="$emit('back')"
      >
        <SvgIcon :src="icon.noteDetail.back" size="20" />
      </BButton>

      <div class="note-header-mobile-status" aria-live="polite">
        <BPopover trigger="click" placement="bottom-left">
          <BButton class="note-header-mobile-status-button" :aria-label="mobileSaveStateDetail || mobileSaveState">
            <span
              class="note-header-mobile-status-dot"
              :class="{
                'is-saving': effectiveSaveStatus === 'saving',
                'is-pending': effectiveSaveStatus === 'pending',
                'is-offline': effectiveSaveStatus === 'offline',
                'is-error': effectiveSaveStatus === 'error',
              }"
            />
            <span class="note-header-mobile-status-label">{{ mobileSaveState }}</span>
          </BButton>
          <template #content>
            <div class="note-header-mobile-save-detail">
              <div>{{ mobileSaveStateDetail || mobileSaveState }}</div>
              <BButton
                v-if="effectiveSaveStatus === 'offline' || effectiveSaveStatus === 'error'"
                size="small"
                class="note-header-save-retry"
                @click="$emit('retrySave')"
              >
                {{ $t('noteDetail.retrySave') }}
              </BButton>
            </div>
          </template>
        </BPopover>
      </div>

      <div class="note-header-mobile-actions">
        <BButton
          v-if="hasCatalog"
          class="note-header-mobile-icon-button note-header-mobile-catalog"
          :aria-label="$t('noteDetail.catalogOpen')"
          @click.stop="$emit('openCatalog')"
        >
          <SvgIcon :src="icon.noteDetail.catalogue" size="19" aria-hidden="true" />
        </BButton>
        <BButton
          v-if="!readonly"
          class="note-header-mobile-mode-button"
          :class="'is-' + noteType"
          :aria-label="$t('note.switchModeTooltip')"
          @click.stop="$emit('switchMode')"
        >
          {{ noteType === 'html' ? 'HTML' : 'MD' }}
        </BButton>

        <BDropdown trigger="click" align="right" :menu-options="mobileMenuOptions">
          <BButton class="note-header-mobile-icon-button note-header-mobile-more" :aria-label="$t('common.more')">
            <SvgIcon :src="icon.common.more" size="18" />
          </BButton>
        </BDropdown>
      </div>
    </template>

    <template v-else>
      <div class="note-header-leading">
        <div class="back-icon" @click="$emit('back')">
          <SvgIcon :src="icon.noteDetail.back" />
        </div>
        <div
          class="note-header-title n-title"
          :contenteditable="!readonly"
          id="note-header-title"
          @focusout="$emit('focusout')"
        >
        </div>
        <div class="note-header-save-state" aria-live="polite">
          <span>{{ desktopSaveState }}</span>
          <BButton
            v-if="effectiveSaveStatus === 'offline' || effectiveSaveStatus === 'error'"
            size="small"
            class="note-header-save-retry"
            @click="$emit('retrySave')"
          >
            {{ $t('noteDetail.retrySave') }}
          </BButton>
        </div>
        <div class="inline-note-tags" v-if="visibleTags.length">
          <span class="inline-note-tag" v-for="tag in displayedTags" :key="`${tag.id ?? tag.name}`" :title="tag.name">
            {{ tag.name }}
          </span>
          <span v-if="hiddenTagCount" class="inline-note-tag inline-note-tag--more"> +{{ hiddenTagCount }} </span>
        </div>
        <ResourceBacklinks
          v-if="bookmark.isDesktop && note?.id"
          placement="header"
          target-type="note"
          :target-id="note.id"
        />
      </div>
      <div class="note-header-actions flex-align-center">
        <span class="mode-pill-group" v-if="!readonly">
          <BTooltip :title="$t('note.switchModeTooltip')">
            <span class="mode-pill" :class="`is-${noteType}`" @click.stop="$emit('switchMode')">
              {{ noteType === 'html' ? 'HTML' : 'MD' }}
            </span>
          </BTooltip>
          <span v-if="hasBackup" style="margin-left: 5px">
            <BTooltip :title="$t('note.undoSwitchTitle')">
              <span class="undo-switch-btn" @click.stop="$emit('undoSwitch')">↩</span>
            </BTooltip>
          </span>
        </span>
        <BTooltip v-if="hasCatalog && bookmark.isTablet" :title="$t('noteDetail.catalogOpen')">
          <BButton
            class="note-header-title-icon note-header-tablet-catalog"
            :aria-label="$t('noteDetail.catalogOpen')"
            @click.stop="$emit('openCatalog')"
          >
            <SvgIcon :src="icon.noteDetail.catalogue" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
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
        <BTooltip :title="$t('noteDetail.save')">
          <div class="note-header-title-icon note-header-title-icon--save" @click="$emit('save', true)">
            <SvgIcon :src="icon.noteDetail.saveLine" />
          </div>
        </BTooltip>
      </div>
    </template>
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import ResourceBacklinks from '@/components/noteLibrary/detail/ResourceBacklinks.vue';
  import { useI18n } from 'vue-i18n';
  import { computed } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { watch } from 'vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { createNoteTurndownService } from '@/utils/noteHtmlToMarkdown';

  const NoteTagConfig = defineAsyncComponent(() => import('@/components/noteLibrary/detail/NoteTagConfig.vue'));
  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const props = defineProps<{
    updateTime: string;
    readonly: boolean;
    isStartEdit: boolean;
    saveStatus?: 'saved' | 'pending' | 'saving' | 'offline' | 'error';
    note: any;
    noteType?: string;
    hasBackup?: boolean;
    hasCatalog?: boolean;
  }>();

  interface HeaderMenuOption {
    label?: string;
    icon?: string;
    danger?: boolean;
    divider?: boolean;
    function?: () => void;
  }

  const { t, locale } = useI18n();
  const emit = defineEmits([
    'back',
    'focusout',
    'del',
    'save',
    'switchMode',
    'undoSwitch',
    'history',
    'saveAsTemplate',
    'openCatalog',
    'retrySave',
  ]);

  const bookmark = bookmarkStore();
  const turndownService = createNoteTurndownService();

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

  function parseUpdateTime(value?: string) {
    if (!value) return null;
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatMobileSaveTimestamp(value?: string) {
    const date = parseUpdateTime(value);
    if (!date) return null;

    const time = new Intl.DateTimeFormat(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateLabel =
      locale.value === 'zh-CN'
        ? `${month}-${day}`
        : new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date);

    return { date: dateLabel, time };
  }

  const mobileSaveState = computed(() => {
    if (effectiveSaveStatus.value === 'saving') return t('noteDetail.savingCompact');
    if (effectiveSaveStatus.value === 'pending') return t('noteDetail.pendingSave');
    if (effectiveSaveStatus.value === 'offline') return t('noteDetail.offlineSave');
    if (effectiveSaveStatus.value === 'error') return t('noteDetail.saveFailed');
    if (!props.note?.id) return t('noteDetail.unsaved');
    const timestamp = formatMobileSaveTimestamp(props.updateTime);
    return timestamp ? t('noteDetail.savedCompact', timestamp) : t('noteDetail.saved');
  });

  const mobileSaveStateDetail = computed(() => {
    if (effectiveSaveStatus.value === 'offline') return t('noteDetail.offlineSaveDetail');
    if (effectiveSaveStatus.value === 'error') return t('noteDetail.saveFailedDetail');
    if (effectiveSaveStatus.value !== 'saved' || !props.note?.id || !props.updateTime) return '';
    return t('noteDetail.savedAt') + ' ' + props.updateTime;
  });

  const effectiveSaveStatus = computed(() => (props.isStartEdit ? 'saving' : props.saveStatus || 'saved'));
  const desktopSaveState = computed(() => {
    if (effectiveSaveStatus.value === 'saving') return t('noteDetail.saving');
    if (effectiveSaveStatus.value === 'pending') return t('noteDetail.pendingSave');
    if (effectiveSaveStatus.value === 'offline') return t('noteDetail.offlineSave');
    if (effectiveSaveStatus.value === 'error') return t('noteDetail.saveFailed');
    if (!props.note?.id) return t('noteDetail.unsaved');
    return props.updateTime ? `${t('noteDetail.savedAt')} ${props.updateTime}` : t('noteDetail.saved');
  });

  function openMobileTagConfig() {
    updateTag();
    recordOperation(OPERATION_LOG_MAP.note.updateTag);
  }

  function openMobileSaveAsTemplate() {
    emit('saveAsTemplate');
    recordOperation(OPERATION_LOG_MAP.note.saveAsTemplate);
  }

  const mobileMenuOptions = computed(() => {
    const options: HeaderMenuOption[] = [
      {
        label: t('noteDetail.tagsWithCount', { count: visibleTags.value.length }),
        icon: icon.manage_categoryBtn_tag,
        function: openMobileTagConfig,
      },
    ];

    if (!props.readonly) {
      options.push({
        label: t('note.saveAsTemplate'),
        icon: icon.noteDetail.template,
        function: openMobileSaveAsTemplate,
      });
      if (props.note?.id) {
        options.push({
          label: t('noteDetail.history.entry'),
          icon: icon.noteDetail.history,
          function: () => {
            emit('history');
            recordOperation(OPERATION_LOG_MAP.note.history);
          },
        });
      }
    }

    options.push(
      { divider: true },
      {
        label: t('noteDetail.delete'),
        icon: icon.noteDetail.deleteLine,
        danger: true,
        function: () => emit('del'),
      },
    );
    return options;
  });

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
    height: var(--note-detail-header-height, 60px);
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
  .note-header-leading,
  .note-header-actions {
    display: flex;
    align-items: center;
  }
  .note-header-leading {
    min-width: 0;
    gap: 20px;
  }
  .note-header-actions {
    flex: 0 0 auto;
    gap: 20px;
  }
  .note-header--tablet {
    gap: 12px;
    padding: 0 14px;

    .note-header-leading {
      flex: 1 1 auto;
      gap: 12px;
      overflow: hidden;
    }

    .note-header-actions {
      gap: 10px;
    }

    .note-header-title {
      min-width: 80px;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note-header-save-state {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .inline-note-tags {
      max-width: 150px;
      margin-left: 0;
    }
  }
  .note-header--mobile {
    justify-content: flex-start;
    gap: 6px;
    padding: 0 10px;

    .note-header-mobile-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }

    .note-header-mobile-actions > .b-dropdown-trigger {
      flex: 0 0 auto;
      display: flex;
    }

    .note-header-mobile-icon-button.b_btn {
      flex: 0 0 36px;
      width: 36px;
      height: 36px;
      padding: 0;
      color: var(--text-color);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;

      &:hover {
        color: var(--primary-color);
        background: var(--hover-background);
      }
    }

    .note-header-mobile-catalog.b_btn {
      flex-basis: 44px;
      width: 44px;
      height: 44px;
    }

    .note-header-mobile-back.b_btn {
      border-color: var(--card-border-color);
      border-radius: 50%;
      background: var(--card-background);

      &:hover {
        border-color: var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
      }
    }

    .note-header-mobile-status {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      min-width: 0;

      > .b-popover-trigger {
        display: flex;
        flex: 1 1 auto;
        width: 100%;
        min-width: 0;
      }
    }

    .note-header-mobile-status-button.b_btn {
      -webkit-appearance: none;
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 5px;
      width: 100%;
      min-width: 0;
      height: 28px;
      padding: 0 7px;
      color: var(--desc-color);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, var(--card-background));
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      transition:
        color 0.16s ease,
        background-color 0.16s ease,
        border-color 0.16s ease;

      &:hover {
        color: var(--resource-note-color, #00a884);
        background: color-mix(in srgb, var(--resource-note-color, #00a884) 13%, var(--card-background));
      }
    }

    .note-header-mobile-status-dot {
      flex: 0 0 auto;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--resource-note-color, #00a884);
      transition: background-color 0.16s ease;

      &.is-saving {
        background: var(--primary-color);
      }

      &.is-pending {
        background: #d97706;
      }

      &.is-offline,
      &.is-error {
        background: var(--danger-color, #dc2626);
      }
    }

    .note-header-mobile-status-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note-header-mobile-mode-button.b_btn {
      flex: 0 0 auto;
      min-width: 44px;
      height: 28px;
      padding: 0 9px;
      border: 0;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2px;

      &.is-html {
        color: var(--resource-note-color, #00a884);
        background: color-mix(in srgb, var(--resource-note-color, #00a884) 13%, var(--card-background));
      }

      &.is-markdown {
        color: var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
      }
    }
  }
  .note-header-mobile-save-detail {
    padding: 10px 12px;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.5;
    white-space: nowrap;
  }
  .note-header-save-retry.b_btn {
    display: inline-flex;
    margin-left: 6px;
  }
  .note-header-save-state {
    color: #c0c0c0;
    font-size: 12px;
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

    &--danger {
      border-color: color-mix(in srgb, var(--danger-color, #e5484d) 30%, var(--card-border-color));
      background: color-mix(in srgb, var(--danger-color, #e5484d) 7%, var(--card-background));
      color: var(--danger-color, #e5484d);

      &:hover {
        border-color: var(--danger-color, #e5484d);
        background: color-mix(in srgb, var(--danger-color, #e5484d) 13%, var(--card-background));
        color: var(--danger-color, #e5484d);
      }
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

  .note-header-tablet-catalog.b_btn {
    flex: 0 0 40px;
    width: 40px;
    height: 40px;
    padding: 0;
    color: var(--sub-text-color);
    border-color: var(--card-border-color);
    background: var(--card-background);

    &:hover,
    &:focus-visible {
      color: var(--resource-note-color, #00a884);
      border-color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 14%, var(--card-background));
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
