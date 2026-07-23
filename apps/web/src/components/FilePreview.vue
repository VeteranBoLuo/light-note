<template>
  <Teleport to="body">
    <div v-if="visible" class="fullscreen-preview">
      <div class="preview-header">
        <div class="preview-title">
          <span class="file-type-badge">{{ getFileTypeName(currentCategory) }}</span>
          <span class="file-name" :title="fileInfo.fileName">{{ fileInfo.fileName }}</span>
        </div>
        <div class="preview-actions">
          <BTooltip :title="t('cloudSpace.previewPanel.close')">
            <BButton size="small" @click="handleClose" class="action-btn header-close-btn">
              <SvgIcon :src="icon.common.close" size="17" />
            </BButton>
          </BTooltip>
        </div>
      </div>
      <div class="preview-content" @click.stop>
        <ResourceBacklinks
          v-if="fileInfo?.id"
          class="file-preview-backlinks"
          target-type="file"
          :target-id="String(fileInfo.id)"
          placement="inline"
        />
        <!-- 加载状态 -->
        <div v-if="loading" class="preview-loading">
          <div class="b-spin">
            <div class="b-spin-indicator"></div>
            <div class="b-spin-tip">{{ t('cloudSpace.previewPanel.loading') }}</div>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="error" class="preview-error">
          <SvgIcon :src="icon.cloudSpace.preview.unknown" size="64" class="error-icon" />
          <h3>{{ t('cloudSpace.previewPanel.loadFailed') }}</h3>
          <p>{{ errorMessage }}</p>
          <BButton type="primary" @click="retry" class="retry-btn">
            <SvgIcon :src="icon.cloudSpace.preview.retry" size="16" />
            {{ t('cloudSpace.previewPanel.retry') }}
          </BButton>
        </div>

        <!-- 文件预览内容 -->
        <div :style="{ opacity: loading ? '0' : '1' }" class="preview-main flex-center">
          <!-- 1. PDF预览 -->
          <iframe
            v-if="previewType === 'pdf' && pdfBlobUrl"
            :src="pdfBlobUrl"
            class="preview-iframe"
            @load="onLoad"
            @error="onError"
          />

          <!-- 2. 视频预览 -->
          <VideoPreview
            v-else-if="previewType === 'video'"
            :video-url="effectiveFileUrl"
            class="preview-video"
            @play="onRendered"
          />

          <!-- 2.5 音频预览 -->
          <div v-else-if="previewType === 'audio'" class="preview-audio-container">
            <audio
              :src="effectiveFileUrl"
              class="preview-audio"
              controls
              preload="metadata"
              @canplay="onRendered"
              @error="onError"
            />
          </div>

          <!-- 3. 图片预览 -->
          <div v-else-if="previewType === 'image'" class="preview-image-container">
            <img
              :src="effectiveFileUrl"
              :alt="fileInfo.fileName"
              class="preview-image"
              :style="{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${scale}) rotate(${rotate}deg)`,
                cursor: scale > 1 ? 'grab' : 'default',
                userSelect: 'none',
              }"
              @load="onImageLoad"
              @error="onError"
              @click="previewImage"
              @dblclick="handleImageDblClick"
              @mousedown="startDrag"
              @mousemove="drag"
              @mouseup="stopDrag"
              @mouseleave="stopDrag"
            />
          </div>

          <!-- 4. Word文档预览 -->
          <div v-else-if="previewType === 'word'" class="office-preview-container">
            <VueOfficeDocx
              :src="effectiveFileUrl"
              @rendered="onRendered"
              @error="onOfficeError"
              class="office-preview"
            />
          </div>

          <!-- 5. Excel预览 -->
          <div v-else-if="previewType === 'excel'" class="office-preview-container">
            <VueOfficeExcel
              :src="effectiveFileUrl"
              @rendered="onRendered"
              @error="onOfficeError"
              class="office-preview"
            />
          </div>

          <!-- 6. PPT预览 -->
          <div v-else-if="previewType === 'ppt'" class="office-preview-container">
            <VueOfficePptx
              :src="effectiveFileUrl"
              @rendered="onRendered"
              @error="onOfficeError"
              class="office-preview"
            />
          </div>

          <!-- 7. 文本文件预览 -->
          <div v-else-if="previewType === 'text'" class="text-preview-container">
            <div class="text-toolbar">
              <div class="text-toolbar-actions">
                <BTooltip :title="t('cloudSpace.previewPanel.autoWrap')">
                  <BButton
                    size="small"
                    @click="toggleWrap"
                    :type="wrapText ? 'primary' : 'default'"
                    class="toolbar-btn"
                  >
                    <SvgIcon :src="icon.cloudSpace.preview.alignLeft" size="15" />
                  </BButton>
                </BTooltip>
                <BTooltip :title="t('cloudSpace.previewPanel.copyText')">
                  <BButton size="small" @click="copyText" class="toolbar-btn">
                    <SvgIcon :src="icon.cloudSpace.preview.copy" size="15" />
                  </BButton>
                </BTooltip>
                <span class="text-info">{{
                  t('cloudSpace.previewPanel.charCount', { count: textContent.length })
                }}</span>
              </div>
            </div>
            <template v-if="isHtmlText">
              <div v-html="textContent" class="html-container"></div>
            </template>
            <template v-else-if="isMarkdownFile">
              <div
                ref="markdownContainerRef"
                v-html="markdownContent"
                class="markdown-container"
                @click="handleMarkdownLink"
              ></div>
            </template>
            <pre
              v-else
              :class="{ 'text-wrap': wrapText, 'text-no-wrap': !wrapText }"
              class="preview-text"
              @scroll="onTextScroll"
            >
                {{ textContent }}
            </pre>
          </div>

          <!-- 8. 微软Office在线预览（备用方案） -->
          <div v-else-if="previewType === 'office-online'" class="online-preview-container">
            <iframe :src="microsoftOfficeViewerUrl" class="online-preview-iframe" @load="onLoad" @error="onError" />
            <div class="online-preview-notice">
              <SvgIcon :src="icon.cloudSpace.preview.info" size="15" />
              {{ t('cloudSpace.previewPanel.onlineNotice') }}
            </div>
          </div>

          <!-- 9. 不支持预览的文件类型 -->
          <div v-else-if="unsupportedTypes.includes(previewType)" class="unsupported-preview">
            <div class="unsupported-icon">
              <SvgIcon :src="icon.cloudSpace.preview.unknown" size="72" />
            </div>
            <h3>{{ t('cloudSpace.previewPanel.unsupportedTitle') }}</h3>
            <p>{{ t('cloudSpace.previewPanel.unsupportedDesc') }}</p>
            <div class="flex-center" style="gap: 8px">
              <BButton type="primary" @click="downloadFile" v-if="fileInfo.fileUrl">
                <SvgIcon :src="icon.cloudSpace.download" size="16" />
                {{ t('cloudSpace.previewPanel.download') }}
              </BButton>
              <BButton @click="tryOnlinePreview" v-if="canTryOnlinePreview">
                <SvgIcon :src="icon.cloudSpace.preview.globe" size="16" />
                {{ t('cloudSpace.previewPanel.tryOnline') }}
              </BButton>
            </div>
          </div>
        </div>

        <!-- 预览控制栏：悬浮在内容区内，避免额外占用预览高度 -->
        <div v-if="!loading && !error && !unsupportedTypes.includes(previewType)" class="preview-controls">
          <div v-if="showNext" class="preview-control-group">
            <BTooltip :title="t('cloudSpace.previewPanel.previous')">
              <BButton size="small" @click="handlePrev" class="action-btn">
                <SvgIcon :src="icon.arrow_left" size="17" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('cloudSpace.previewPanel.next')">
              <BButton size="small" @click="handleNext" class="action-btn">
                <SvgIcon :src="icon.arrow_left" size="17" class="next-icon" />
              </BButton>
            </BTooltip>
          </div>
          <span v-if="showNext && fileInfo.fileUrl" class="control-divider"></span>
          <div v-if="fileInfo.fileUrl" class="preview-control-group">
            <BTooltip :title="t('cloudSpace.previewPanel.download')">
              <BButton size="small" @click="downloadFile" class="action-btn">
                <SvgIcon :src="icon.cloudSpace.download" size="17" />
              </BButton>
            </BTooltip>
          </div>
          <span v-if="previewType === 'image' && (showNext || fileInfo.fileUrl)" class="control-divider"></span>
          <div v-if="previewType === 'image'" class="preview-control-group image-control-group">
            <BTooltip :title="t('cloudSpace.previewPanel.zoomOut')">
              <BButton size="small" @click="zoomOut" :disabled="scale <= 0.1" class="action-btn">
                <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="17" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('cloudSpace.previewPanel.resetZoom')">
              <BButton size="small" @click="resetZoom" class="action-btn zoom-value-btn">
                {{ zoomPercent }}
              </BButton>
            </BTooltip>
            <BTooltip :title="t('cloudSpace.previewPanel.zoomIn')">
              <BButton size="small" @click="zoomIn" :disabled="scale >= 5" class="action-btn">
                <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="17" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('cloudSpace.previewPanel.rotate')">
              <BButton size="small" @click="rotateImage" class="action-btn">
                <SvgIcon :src="icon.cloudSpace.preview.rotate" size="17" />
              </BButton>
            </BTooltip>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import VideoPreview from '@/components/base/VideoPreview.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { acquireTopLayerEscapeLock } from '@/utils/topLayerEscape';
  import ResourceBacklinks from '@/components/noteLibrary/detail/ResourceBacklinks.vue';
  import {
    CLOUD_FILE_CATEGORY_LABEL_KEY,
    getCloudFileCategory,
    getCloudPreviewType,
  } from '@/constants/cloudFileCategory.ts';

  const VueOfficeDocx = defineAsyncComponent(() => import('@vue-office/docx/lib/v3/vue-office-docx.mjs'));
  const VueOfficeExcel = defineAsyncComponent(() => import('@vue-office/excel/lib/v3/vue-office-excel.mjs'));
  const VueOfficePptx = defineAsyncComponent(() => import('@vue-office/pptx/lib/v3/vue-office-pptx.mjs'));

  const props = defineProps<{
    visible: boolean;
    showNext?: boolean;
    fileInfo?: {
      id: string;
      fileName: string;
      fileType: string;
      fileUrl?: string;
      category?: string;
    };
  }>();

  const emit = defineEmits<{
    'update:visible': [value: boolean];
    close: [];
    prev: [];
    next: [];
  }>();

  const showNext = computed(() => !!props.showNext);
  const { t } = useI18n();

  // 内部状态
  const loading = ref(false);
  const error = ref(false);
  const errorMessage = ref('');
  const rotate = ref(0);
  const scale = ref(1);
  const isDragging = ref(false);
  const dragStart = ref({ x: 0, y: 0 });
  const imagePosition = ref({ x: 0, y: 0 });
  const textContent = ref('');
  const wrapText = ref(true);
  const pdfBlobUrl = ref<string>('');
  const previewHistoryActive = ref(false);
  const markdownContainerRef = ref<HTMLElement | null>(null);
  const markdownContent = ref('');
  let activePreviewFileId = '';

  let officeStyleLoaded = false;
  let markdownLibLoaded = false;
  let markdownParser: ((markdown: string) => string) | null = null;
  let markdownSanitizer: ((html: string) => string) | null = null;
  let previousBodyOverflow = '';
  let releaseEscapeLock: (() => void) | null = null;

  const currentCategory = computed(() => getCloudFileCategory(props.fileInfo));
  const previewType = computed(() => getCloudPreviewType(props.fileInfo));
  const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`);
  const unsupportedTypes = ['unsupported'];
  const normalizedMimeType = computed(
    () =>
      String(props.fileInfo.fileType || '')
        .trim()
        .toLowerCase()
        .split(';')[0],
  );
  const isHtmlText = computed(() => normalizedMimeType.value === 'text/html');

  const isMarkdownFile = computed(() => {
    const fileName = props.fileInfo?.fileName?.toLowerCase() || '';
    return fileName?.endsWith('.md') || fileName?.endsWith('.markdown');
  });

  function buildHeadingId(text: string) {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function enrichMarkdownHeadings(html: string) {
    if (!html) return '';
    const template = document.createElement('template');
    template.innerHTML = html;

    const headingEls = template.content.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const usedIds = new Set<string>();

    headingEls.forEach((heading) => {
      const el = heading as HTMLElement;
      const text = (el.textContent || '').trim();
      let id = (el.id || '').trim() || buildHeadingId(text) || 'section';
      let uniqueId = id;
      let i = 2;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${id}-${i}`;
        i += 1;
      }
      usedIds.add(uniqueId);
      el.id = uniqueId;
    });

    return template.innerHTML;
  }

  async function ensureOfficeStylesLoaded() {
    if (officeStyleLoaded) return;
    await Promise.all([import('@vue-office/docx/lib/v3/index.css'), import('@vue-office/excel/lib/v3/index.css')]);
    officeStyleLoaded = true;
  }

  async function ensureMarkdownLibLoaded() {
    if (markdownLibLoaded) return;
    const [{ marked }, dompurifyModule] = await Promise.all([import('marked'), import('dompurify')]);
    markdownParser = (markdown: string) =>
      marked.parse(markdown, {
        gfm: true,
        breaks: true,
      }) as string;
    markdownSanitizer = (html: string) => dompurifyModule.default.sanitize(html) as string;
    markdownLibLoaded = true;
  }

  async function updateMarkdownContent() {
    if (!isMarkdownFile.value || !textContent.value) {
      markdownContent.value = '';
      return;
    }
    await ensureMarkdownLibLoaded();
    const html = markdownParser ? markdownParser(textContent.value) : '';
    const sanitized = markdownSanitizer ? markdownSanitizer(html) : html;
    markdownContent.value = enrichMarkdownHeadings(sanitized);
  }

  // 微软Office在线预览URL
  const microsoftOfficeViewerUrl = computed(() => {
    if (!props.fileInfo.fileUrl) return '';
    const encodedUrl = encodeURIComponent(props.fileInfo.fileUrl);
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
  });

  const canTryOnlinePreview = computed(() => {
    return ['word', 'excel', 'ppt'].includes(currentCategory.value);
  });

  const effectiveFileUrl = computed(() => {
    if (!props.fileInfo.fileUrl) return '';

    const url = props.fileInfo.fileUrl;

    return url;
  });

  // 监听 visible 变化，开始预览
  watch(
    () => props.visible,
    async (newVisible) => {
      syncEscapeLock(newVisible);
      if (newVisible && props.fileInfo) {
        activePreviewFileId = String(props.fileInfo.id || '');
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (!previewHistoryActive.value) {
          history.pushState({ preview: true }, '');
          previewHistoryActive.value = true;
        }
        await startPreview(props.fileInfo);
        return;
      }
      if (!newVisible) {
        activePreviewFileId = '';
        document.body.style.overflow = previousBodyOverflow;
        previewHistoryActive.value = false;
      }
    },
    { immediate: true },
  );

  function syncEscapeLock(visible: boolean) {
    if (visible && !releaseEscapeLock) {
      releaseEscapeLock = acquireTopLayerEscapeLock();
      return;
    }
    if (!visible && releaseEscapeLock) {
      releaseEscapeLock();
      releaseEscapeLock = null;
    }
  }

  watch(
    () => props.fileInfo?.id,
    (fileId, previousFileId) => {
      if (!props.visible || !fileId || fileId === previousFileId || activePreviewFileId === String(fileId)) return;
      activePreviewFileId = String(fileId);
      void startPreview(props.fileInfo);
    },
  );

  watch(
    () => [isMarkdownFile.value, textContent.value],
    () => {
      updateMarkdownContent();
    },
    { immediate: true },
  );

  // 开始预览
  async function startPreview(file: typeof props.fileInfo) {
    loading.value = true;
    error.value = false;
    errorMessage.value = '';
    textContent.value = '';
    markdownContent.value = '';
    try {
      if (['word', 'excel', 'ppt'].includes(previewType.value)) {
        await ensureOfficeStylesLoaded();
      }
      if (previewType.value === 'pdf') {
        await loadPdfBlob(effectiveFileUrl.value);
      } else if (previewType.value === 'text') {
        await loadTextContent(effectiveFileUrl.value);
      } else if (unsupportedTypes.includes(previewType.value)) {
        loading.value = false;
      }
    } catch (err) {
      error.value = true;
      errorMessage.value = t('cloudSpace.previewPanel.loadFailed');
      loading.value = false;
    }
  }

  // 加载PDF blob URL
  async function loadPdfBlob(url?: string) {
    if (!url) {
      error.value = true;
      errorMessage.value = t('cloudSpace.previewPanel.invalidUrl');
      loading.value = false;
      return;
    }

    try {
      // 先清理之前的blob URL
      if (pdfBlobUrl.value) {
        URL.revokeObjectURL(pdfBlobUrl.value);
        pdfBlobUrl.value = '';
      }

      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      pdfBlobUrl.value = blobUrl;
    } catch (err) {
      console.error('加载PDF文件失败:', err);
      error.value = true;
      errorMessage.value = t('cloudSpace.previewPanel.pdfLoadFailed');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // 加载文本内容
  async function loadTextContent(url?: string) {
    if (!url) {
      textContent.value = t('cloudSpace.previewPanel.invalidUrl');
      loading.value = false;
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }
      const content = await response.text();

      if (content.length > 1000000) {
        textContent.value = content.substring(0, 1000000) + `\n\n${t('cloudSpace.previewPanel.contentTruncated')}`;
      } else {
        textContent.value = content;
      }
    } catch (err) {
      console.error('加载文本文件失败:', err);
      textContent.value = t('cloudSpace.previewPanel.textLoadFailed');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // 事件处理
  function onLoad() {
    loading.value = false;
    error.value = false;
  }

  function onError(err?: any) {
    console.error('预览加载失败:', err);
    loading.value = false;
    error.value = true;
    errorMessage.value = err?.message || t('cloudSpace.previewPanel.genericLoadFailed');
  }

  function onImageLoad() {
    loading.value = false;
  }

  function onRendered() {
    loading.value = false;
    error.value = false;
  }

  function onOfficeError(err: any) {
    console.error(`${previewType.value} 文档渲染失败:`, err);
    loading.value = false;
    error.value = true;
    errorMessage.value = t('cloudSpace.previewPanel.officeLoadFailed', {
      message: err.message || t('cloudSpace.previewPanel.checkFile'),
    });
  }

  // 工具函数
  function toggleWrap() {
    wrapText.value = !wrapText.value;
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(textContent.value);
      console.log('文本已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
    }
  }

  function normalizeAnchorKey(value: string) {
    return decodeURIComponent(value)
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  }

  function findAnchorTarget(container: HTMLElement, rawHash: string) {
    const decodedHash = decodeURIComponent(rawHash);
    const candidateIds = [rawHash, decodedHash, rawHash.toLowerCase(), decodedHash.toLowerCase()];

    for (const id of candidateIds) {
      if (!id) continue;
      const exact = container.querySelector(`[id="${id}"]`) as HTMLElement | null;
      if (exact) return exact;
    }

    const normalizedHash = normalizeAnchorKey(rawHash);
    if (!normalizedHash) return null;

    const headingEls = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
    return (
      headingEls.find((el) => normalizeAnchorKey(el.id || '') === normalizedHash) ||
      headingEls.find((el) => normalizeAnchorKey(el.textContent || '') === normalizedHash) ||
      null
    );
  }

  function handleMarkdownLink(event: Event) {
    const target = event.target as HTMLElement | null;
    const link = target?.closest('a') as HTMLAnchorElement | null;
    if (!link) return;

    const href = (link.getAttribute('href') || '').trim();
    if (!href) return;

    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      return;
    }

    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) return;

    const rawHash = href.slice(hashIndex + 1);
    if (!rawHash) return;

    event.preventDefault();
    const container = markdownContainerRef.value;
    if (!container) return;

    const targetElement = findAnchorTarget(container, rawHash);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function onTextScroll() {}

  function previewImage() {
    // 这里可以调用外部的图片预览逻辑
  }

  function tryOnlinePreview() {
    if (canTryOnlinePreview.value) {
      // 这里可以修改 fileInfo 为 office-online 类型
    }
  }

  function downloadFile() {
    if (!props.fileInfo.fileUrl) return;

    const link = document.createElement('a');
    link.href = props.fileInfo.fileUrl;
    link.download = props.fileInfo.fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    recordOperation({
      module: '文件预览',
      operation: `下载文件成功【${props.fileInfo.fileName || props.fileInfo.id}】`,
    });
  }

  function retry() {
    startPreview(props.fileInfo);
  }

  function handleClose() {
    // 清理PDF blob URL
    if (pdfBlobUrl.value) {
      URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = '';
    }
    rotate.value = 0; // 重置旋转角度
    scale.value = 1; // 重置缩放
    imagePosition.value = { x: 0, y: 0 }; // 重置位置
    if (previewHistoryActive.value) {
      history.back();
      return;
    }
    emit('close');
  }

  function handlePrev() {
    emit('prev');
  }

  function handleNext() {
    emit('next');
  }

  function rotateImage() {
    rotate.value = (rotate.value + 90) % 360;
  }

  function zoomIn() {
    scale.value = Math.min(scale.value * 1.2, 5); // 最大5倍
  }

  function zoomOut() {
    scale.value = Math.max(scale.value / 1.2, 0.1); // 最小0.1倍
  }

  function resetZoom() {
    scale.value = 1;
    rotate.value = 0;
    imagePosition.value = { x: 0, y: 0 };
  }

  function handleImageDblClick() {
    if (previewType.value !== 'image') return;
    if (scale.value === 1) {
      zoomIn();
      zoomIn();
      return;
    }
    resetZoom();
  }

  function handleMiddleDblClick(e: MouseEvent) {
    if (!props.visible) return;
    if (e.button !== 1 || e.detail !== 2) return;
    if (previewType.value !== 'image') return;
    e.preventDefault();
    resetZoom();
  }

  function startDrag(e: MouseEvent) {
    if (scale.value > 1) {
      isDragging.value = true;
      dragStart.value = {
        x: e.clientX - imagePosition.value.x,
        y: e.clientY - imagePosition.value.y,
      };
      e.preventDefault();
    }
  }

  function drag(e: MouseEvent) {
    if (isDragging.value) {
      imagePosition.value = {
        x: e.clientX - dragStart.value.x,
        y: e.clientY - dragStart.value.y,
      };
      e.preventDefault();
    }
  }

  function stopDrag() {
    isDragging.value = false;
  }

  function getFileTypeName(type: string) {
    if (type === 'office-online') return t('common.preview');
    const labelKey = CLOUD_FILE_CATEGORY_LABEL_KEY[getCloudFileCategory({ category: type })];
    return t(labelKey);
  }

  // 键盘事件
  function handleKeyDown(e: KeyboardEvent) {
    if (!props.visible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      handleClose();
      return;
    }

    if (!showNext.value) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  }

  function preventSelect(e: Event) {
    if (isDragging.value) {
      e.preventDefault();
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!props.visible) return;
    if (e.ctrlKey && previewType.value === 'image') {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
      return;
    }
  }

  function handlePopState() {
    if (previewHistoryActive.value && props.visible) {
      previewHistoryActive.value = false;
      emit('close');
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('mousedown', handleMiddleDblClick);
    document.addEventListener('selectstart', preventSelect);
    window.addEventListener('popstate', handlePopState);
  });

  onUnmounted(() => {
    syncEscapeLock(false);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('wheel', handleWheel);
    document.removeEventListener('mousedown', handleMiddleDblClick);
    document.removeEventListener('selectstart', preventSelect);
    window.removeEventListener('popstate', handlePopState);
    document.body.style.overflow = previousBodyOverflow;
    // 清理PDF blob URL
    if (pdfBlobUrl.value) {
      URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = '';
    }
  });
</script>

<style lang="less" scoped>
  .fullscreen-preview {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 48px minmax(0, 1fr);
    background: var(--background-color);
    color: var(--text-color);
    z-index: 900;
    isolation: isolate;
    overflow: hidden;

    .preview-header {
      position: relative;
      z-index: 30;
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      background: color-mix(in srgb, var(--background-color) 94%, var(--primary-color) 6%);
      color: var(--text-color);
      padding: 0 14px;
      box-sizing: border-box;
      justify-content: center;
      border-bottom: 1px solid var(--card-border-color);

      .preview-title {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        max-width: min(720px, calc(100% - 96px));
      }

      .file-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        font-weight: 600;
      }

      .file-type-badge {
        flex: 0 0 auto;
        padding: 3px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--primary-color) 12%, transparent);
        color: var(--primary-color);
        font-size: 11px;
        font-weight: 600;
      }

      .preview-actions {
        position: absolute;
        right: 12px;
        display: flex;
        gap: 8px;

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-close-btn {
          width: 30px;
          min-width: 30px;
          height: 30px;
          padding: 0;
          border-radius: 9px;
          color: var(--desc-color);
        }
      }
    }

    .preview-content {
      position: relative;
      min-width: 0;
      min-height: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--primary-color) 5%, transparent), transparent 30%),
        var(--background-color);

      .file-preview-backlinks {
        position: absolute;
        top: 12px;
        left: 14px;
        z-index: 20;
        // 反链是辅助信息，不应在文件预览中抢占画面；长标题仍可在卡片内省略显示。
        width: min(320px, calc(100% - 48px));
        box-shadow: 0 8px 24px color-mix(in srgb, #000 12%, transparent);
      }

      .preview-loading {
        position: absolute;
        z-index: 10;
        text-align: center;
        padding: 40px;

        .b-spin {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .b-spin-indicator {
          width: 32px;
          height: 32px;
          border: 3px solid var(--card-border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: b-spin-rotate 0.8s linear infinite;
        }

        .b-spin-tip {
          color: var(--desc-color, #666);
          font-size: 14px;
        }
      }

      .preview-error {
        z-index: 10;
        text-align: center;
        padding: 40px;
        position: absolute;
        .error-icon {
          color: var(--error-color, #ff4d4f);
          margin-bottom: 16px;
        }

        h3 {
          margin-bottom: 8px;
          color: var(--text-color);
        }

        p {
          color: var(--desc-color);
          margin-bottom: 20px;
        }

        .retry-btn {
          display: inline-flex;
          gap: 6px;
          margin-top: 16px;
        }
      }

      .preview-main {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;

        .preview-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .preview-pdf-viewer {
          width: 100%;
          height: 100%;
          border: none;
        }

        .preview-video {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .preview-audio-container {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;

          .preview-audio {
            width: min(560px, 90%);
          }
        }

        .preview-image-container {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 24px 24px 86px;
          box-sizing: border-box;
          overflow: hidden;

          .preview-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 4px;
            box-shadow: 0 10px 30px color-mix(in srgb, #000 14%, transparent);
          }
        }

        .office-preview-container {
          width: 100%;
          height: 100%;
          background: var(--background-color);
          position: absolute;
          top: 0;
          left: 0;

          .office-preview {
            width: 100%;
            height: 100%;
            border: none;
          }
        }

        .text-preview-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--background-color);

          .text-toolbar {
            padding: 12px 16px;
            border-bottom: 1px solid var(--card-border-color);
            background: var(--menu-body-bg-color, var(--background-color));

            .text-toolbar-actions {
              display: flex;
              align-items: center;
              gap: 10px;
            }

            .toolbar-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 28px;
              padding: 0;
            }

            .text-info {
              color: var(--desc-color);
              font-size: 12px;
            }
          }

          .preview-text {
            flex: 1;
            margin: 0;
            padding: 16px 16px 86px;
            overflow: auto;
            background: var(--pre-bg-color);
            font-family: 'Monaco', 'Menlo', 'Consolas', 'Ubuntu Mono', monospace;
            font-size: 14px;
            line-height: 1.5;
            color: var(--text-color);
          }

          .text-wrap {
            white-space: pre-wrap;
            word-wrap: break-word;
          }

          .text-no-wrap {
            white-space: pre;
            overflow-x: auto;
          }
        }

        .online-preview-container {
          width: 100%;
          height: 100%;
          position: relative;

          .online-preview-iframe {
            width: 100%;
            height: calc(100% - 40px);
            border: none;
          }

          .online-preview-notice {
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
            color: var(--primary-color);
            font-size: 12px;
            border-top: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
          }
        }

        .unsupported-preview {
          text-align: center;
          padding: 60px 40px;

          .unsupported-icon {
            color: var(--desc-color);
            margin-bottom: 24px;
          }

          h3 {
            margin-bottom: 12px;
            color: var(--text-color);
          }

          p {
            color: var(--desc-color);
            margin-bottom: 24px;
            max-width: 300px;
            margin-left: auto;
            margin-right: auto;
          }
        }
      }
    }

    .preview-controls {
      position: absolute;
      left: 50%;
      bottom: max(18px, env(safe-area-inset-bottom));
      z-index: 25;
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: calc(100% - 28px);
      padding: 7px;
      box-sizing: border-box;
      overflow-x: auto;
      border: 1px solid color-mix(in srgb, var(--card-border-color) 86%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, var(--menu-body-bg-color, var(--background-color)) 88%, transparent);
      box-shadow: 0 10px 30px color-mix(in srgb, #000 18%, transparent);
      backdrop-filter: blur(16px) saturate(1.25);
      transform: translateX(-50%);
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }

      .preview-control-group {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
      }

      .control-divider {
        flex: 0 0 auto;
        width: 1px;
        height: 20px;
        margin: 0 2px;
        background: var(--card-border-color);
      }

      .action-btn {
        width: 30px;
        min-width: 30px;
        height: 30px;
        padding: 0;
        border-radius: 9px;
        color: var(--text-color);
      }

      .zoom-value-btn {
        width: 54px;
        min-width: 54px;
        color: var(--desc-color);
        font-variant-numeric: tabular-nums;
      }

      .next-icon {
        transform: rotate(180deg);
      }
    }
  }

  .html-container {
    color: var(--text-color);
    padding: 9px 9px 86px;
    :deep(a) {
      text-decoration: underline !important;
      font-family: 'Arial', sans-serif;
      font-weight: 600;
    }
  }

  .markdown-container {
    flex: 1;
    margin: 0;
    padding: 16px 16px 86px;
    overflow: auto;
    color: var(--text-color);
    line-height: 1.7;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5),
    :deep(h6) {
      margin: 0.9em 0 0.5em;
      color: var(--text-color);
      font-weight: 600;
    }

    :deep(p),
    :deep(ul),
    :deep(ol),
    :deep(blockquote) {
      margin: 0.7em 0;
    }

    :deep(blockquote) {
      border-left: 4px solid #d9d9d9;
      padding-left: 12px;
      color: var(--desc-color);
    }

    :deep(code) {
      background: var(--pre-bg-color);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Consolas', 'Ubuntu Mono', monospace;
      font-size: 13px;
    }

    :deep(pre) {
      border-radius: 8px;
      padding: 12px;
      overflow: auto;
    }

    :deep(pre code) {
      background: transparent;
      padding: 0;
    }

    :deep(a) {
      color: var(--primary-color);
      text-decoration: underline;
    }

    :deep(img) {
      max-width: 100%;
      height: auto;
    }
  }

  @keyframes b-spin-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 600px) {
    .fullscreen-preview {
      grid-template-rows: 44px minmax(0, 1fr);

      .preview-header {
        padding: 0 10px;

        .preview-title {
          justify-content: flex-start;
          max-width: calc(100% - 46px);
          margin-right: auto;
        }

        .preview-actions {
          right: 8px;
        }
      }

      .preview-content {
        .preview-main .preview-image-container {
          padding: 14px 14px 78px;
        }

        .preview-controls {
          bottom: max(10px, env(safe-area-inset-bottom));
          max-width: calc(100% - 16px);
          padding: 6px;
          border-radius: 13px;
        }
      }
    }
  }
</style>
