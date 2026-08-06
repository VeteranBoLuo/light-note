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
        <!--
          历史版本 / 标签 / 导出这三项此前限定 isDesktop，把平板一起挡掉了：
          平板走的是非移动端分支，没有「更多」下拉菜单可以兜底，等于这三个功能
          在平板上完全无法访问。平板横向空间（768px 起）足够放下，改为「非手机即显示」。
        -->
        <BTooltip :title="$t('noteDetail.history.entry')" v-if="!readonly && !bookmark.isMobile && note?.id">
          <div
            class="note-header-title-icon note-header-title-icon--history"
            @click="$emit('history')"
            v-click-log="OPERATION_LOG_MAP.note.history"
          >
            <SvgIcon :src="icon.noteDetail.history" />
          </div>
        </BTooltip>
        <BTooltip :title="$t('noteDetail.tags')" v-if="!bookmark.isMobile">
          <div
            class="note-header-title-icon note-header-title-icon--tag"
            @click="updateTag"
            v-click-log="OPERATION_LOG_MAP.note.updateTag"
          >
            <SvgIcon :src="icon.manage_categoryBtn_tag" />
          </div>
        </BTooltip>
        <BTooltip :title="$t('noteDetail.export')" v-if="!bookmark.isMobile">
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
  import { generatePdfBlob } from '@/utils/htmlToPdf.ts';
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
  import {
    buildNoteExportHtml,
    buildNoteExportMarkdown,
    inlineMermaidForExport,
    renderMarkdownForExport,
  } from '@/utils/noteExport';
  import { buildExportFileName, canSaveGeneratedFile, deliverGeneratedFile } from '@/utils/fileDelivery';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { deliverExportViaAndroidBridge, type NoteExportFormat } from '@/utils/androidFileExport';
  import { copyTextToClipboard } from '@/utils/clipboard';

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

  /** 手机与平板优先走系统分享：可存进「文件」也可转发到其他 App，比隐式下载更符合手机习惯。 */
  const preferShareExport = () => bookmark.isMobile || bookmark.isTablet;

  /**
   * 轻笺 Android App 的 WebView 既没有 Web Share，原生下载通道（DownloadManager）
   * 也只接受 http(s) 地址，前端生成的 `blob:` 文件在 App 内根本落不了盘。
   * 必须提前识别并给出可操作降级 —— 否则用户点导出只会毫无反应。
   */
  // 判断本身挪到了交付层（utils/fileDelivery.ts），这里只是取个贴合导出语境的名字
  const canSaveExportFile = () => canSaveGeneratedFile();

  /**
   * App 内能否走服务端中转落盘：把导出件换成短时 http 地址，交给原生系统下载。
   * 需要笔记已保存 —— 中转接口要校验笔记归属，未落库的新笔记换不到下载票据。
   */
  const canExportViaAppBridge = () => isLightNoteAndroidApp() && !!props.note?.id;

  /**
   * App 内的落盘尝试。
   * 返回 true 表示本次导出已有结果（落盘成功，或内容过大已给出明确提示），调用方就此结束；
   * 返回 false 表示没能处理，调用方继续走自己的降级（文本退剪贴板、PDF 退提示）。
   */
  async function handleExportInApp(
    content: string | Blob,
    fileName: string,
    mimeType: string,
    format: NoteExportFormat,
    operation: string,
  ): Promise<boolean> {
    if (!canExportViaAppBridge()) return false;

    // 上传+换票据在弱网下要等几秒,没有反馈会被当成没点上
    const closeUploading = message.loading(t('noteDetail.exportPreparing'), 0);
    let outcome;
    try {
      outcome = await deliverExportViaAndroidBridge({
        noteId: String(props.note.id),
        content,
        fileName,
        format,
        mimeType,
      });
    } finally {
      closeUploading();
    }

    if (outcome.ok) {
      /*
       * 这里只是「换到票据、交给系统下载」，文件还没落盘 —— 原来在这一步报
       * 「已保存到下载目录」是在说一件还没发生的事，紧接着进度条又跑一遍、
       * 完成时再报一次成功，用户根本分不清哪个是真的。
       * 真正的「已保存到…」由进度模块在落盘后统一报，这里不再自己报成功。
       */
      recordOperation({ module: '笔记', operation });
      return true;
    }
    if (outcome.reason === 'too_large') {
      // 内容过大时复制到剪贴板同样没意义(剪贴板也放不下、粘贴端也难处理),直接给明确出路
      message.warning(outcome.message || t('noteDetail.exportTooLargeInApp'));
      return true;
    }
    return false;
  }

  /**
   * App 内无法落盘时的降级：文本格式至少能复制出去，粘贴到其他应用里。
   * 走 copyTextToClipboard 而不是裸 navigator.clipboard —— 部分 WebView（实测鸿蒙
   * 「卓易通」兼容层）的 Clipboard API 不可用，那里需要 execCommand 降级才能复制成功。
   */
  async function copyExportContent(content: string) {
    if (await copyTextToClipboard(content)) {
      message.warning(t('noteDetail.exportCopiedInApp'));
    } else {
      message.error(t('noteDetail.exportUnavailableInApp'));
    }
  }

  /** 统一交付：取消分享既不提示也不记成功日志，只有真正交付成功才写操作日志。 */
  async function deliverExportFile(
    content: string | Blob,
    fileName: string,
    mimeType: string,
    operation: string,
  ) {
    try {
      const result = await deliverGeneratedFile({
        content,
        fileName,
        mimeType,
        preferShare: preferShareExport(),
      });
      if (result === 'cancelled') return;
      if (result === 'unavailable') {
        // 正常流程会被 canSaveExportFile() 提前挡在 App 分支，走到这里说明判断和交付层不一致，
        // 那也不能报成功：宁可给一句「App 内导不了」，也不要谎报已保存
        message.warning(t('noteDetail.exportUnavailableInApp'));
        return;
      }
      message.success(t(result === 'shared' ? 'noteDetail.exportShared' : 'noteDetail.exportDownloaded'));
      recordOperation({ module: '笔记', operation });
    } catch (error) {
      console.error('笔记导出失败:', error);
      message.error(t('noteDetail.exportFailed'));
    }
  }

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

  function openMobileExport() {
    openExportModal();
    recordOperation(OPERATION_LOG_MAP.note.exportNote);
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

    // 导出与 readonly 无关(桌面端同样不受限):只读笔记也允许导出留档
    options.push({
      label: t('noteDetail.export'),
      icon: icon.noteDetail.exportLine,
      function: openMobileExport,
    });

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
        // PDF 是二进制,没有剪贴板降级:只有服务端中转也走不通时才提前拦住,
        // 免得白跑一遍几秒的长图渲染。中转可用时照常导出。
        if (!canSaveExportFile() && !canExportViaAppBridge()) {
          message.warning(t('noteDetail.exportPdfUnavailableInApp'));
          return;
        }
        const title = props.note.title || t('noteDetail.unnamedDoc');
        // 手机上渲染长笔记要几秒,没有反馈会被当成没点上
        const closeRendering = message.loading(t('noteDetail.exportPdfRendering'), 0);
        try {
          const blob = await generatePdfBlob(selector);
          closeRendering();
          const pdfFileName = buildExportFileName(title, t('noteDetail.unnamedDoc'), 'pdf');
          const pdfOperation = `导出PDF成功【${title}】`;
          if (!canSaveExportFile()) {
            // 中转也没成时必须给提示:用户已经等了几秒渲染,静默返回会被当成按钮坏了
            if (!(await handleExportInApp(blob, pdfFileName, 'application/pdf', 'pdf', pdfOperation))) {
              message.warning(t('noteDetail.exportPdfUnavailableInApp'));
            }
            return;
          }
          await deliverExportFile(blob, pdfFileName, 'application/pdf', pdfOperation);
        } catch (error) {
          closeRendering();
          console.error('PDF 导出失败:', error);
          message.error(t('noteDetail.exportFailed'));
        }
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
        const content = props.note.content || '';
        // md 笔记的 content 是 Markdown 源码,直接塞进 <body> 只会显示 `#`、`- [ ]` 原文,
        // 必须先按站内同口径渲染成 HTML。
        // 富文本笔记的正文已经是 HTML,但里面的 mermaid 源码块同样要在导出时渲染成内联 SVG
        // ——导出文件跑不了 JS,不预渲染就只剩一段图表源码。
        const body =
          props.noteType === 'markdown'
            ? await renderMarkdownForExport(content)
            : await inlineMermaidForExport(content);
        const html = buildNoteExportHtml(title, body);
        const htmlFileName = buildExportFileName(title, t('noteDetail.unnamedDoc'), 'html');
        const htmlOperation = `导出HTML成功【${title}】`;
        if (!canSaveExportFile()) {
          // 先试服务端中转落成真文件,不行才退回剪贴板
          if (await handleExportInApp(html, htmlFileName, 'text/html', 'html', htmlOperation)) return;
          await copyExportContent(html);
          return;
        }
        await deliverExportFile(html, htmlFileName, 'text/html', htmlOperation);
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
        // md 笔记的 content 已经是 Markdown:再过一遍 turndown(HTML→MD)会把语法逐个
        // 转义成 \# / \*\*、并吃掉换行压成一行,只有 html 笔记才需要转换。
        const markdown = buildNoteExportMarkdown(
          title,
          props.note.content || '',
          props.noteType || 'html',
          (html) => turndownService.turndown(html),
        );
        const mdFileName = buildExportFileName(title, t('noteDetail.unnamedDoc'), 'md');
        const mdOperation = `导出Markdown成功【${title}】`;
        if (!canSaveExportFile()) {
          // 先试服务端中转落成真文件,不行才退回剪贴板
          if (await handleExportInApp(markdown, mdFileName, 'text/markdown', 'md', mdOperation)) return;
          await copyExportContent(markdown);
          return;
        }
        await deliverExportFile(markdown, mdFileName, 'text/markdown', mdOperation);
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
