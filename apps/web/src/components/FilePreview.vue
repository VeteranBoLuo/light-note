<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="previewRootRef"
      class="fullscreen-preview"
      :class="{ 'html-fullscreen-mode': isHtmlFullscreen }"
    >
      <div class="preview-header">
        <div class="preview-title">
          <span class="file-type-badge">{{ getFileTypeName(currentCategory) }}</span>
          <span class="file-name" :title="fileInfo.fileName">{{ fileInfo.fileName }}</span>
        </div>
        <div class="preview-actions">
          <BTooltip
            v-if="previewType === 'html' && !loading && !error"
            :title="t('cloudSpace.previewPanel.enterFullscreen')"
          >
            <BButton
              size="small"
              class="action-btn header-fullscreen-btn"
              :aria-label="t('cloudSpace.previewPanel.enterFullscreen')"
              @click="enterHtmlFullscreen"
            >
              <SvgIcon :src="icon.ai.maximize" size="17" />
            </BButton>
          </BTooltip>
          <BTooltip :title="t('cloudSpace.previewPanel.close')">
            <BButton
              size="small"
              class="action-btn header-close-btn"
              :aria-label="t('cloudSpace.previewPanel.close')"
              @click="handleClose"
            >
              <SvgIcon :src="icon.common.close" size="17" />
            </BButton>
          </BTooltip>
        </div>
      </div>
      <div v-if="isHtmlFullscreen" class="fullscreen-exit-bar">
        <BTooltip :title="t('cloudSpace.previewPanel.exitFullscreen')">
          <BButton
            size="small"
            class="exit-fullscreen-btn"
            :aria-label="t('cloudSpace.previewPanel.exitFullscreen')"
            @click="exitHtmlFullscreen"
          >
            <SvgIcon :src="icon.ai.restoreWindow" size="17" />
            <span>{{ t('cloudSpace.previewPanel.exitFullscreen') }}</span>
          </BButton>
        </BTooltip>
      </div>
      <div class="preview-content" @click.stop>
        <ResourceBacklinks
          v-if="fileInfo?.id && !isHtmlFullscreen"
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
          <PdfPreview
            v-if="previewType === 'pdf'"
            :src="effectiveFileUrl"
            :file-name="fileInfo.fileName"
            class="preview-pdf-viewer"
            @rendered="onRendered"
            @error="onPdfError"
          />

          <!-- 1.5 HTML 交互预览：必须与轻笺页面隔离，禁止直接 v-html 注入 -->
          <iframe
            v-else-if="previewType === 'html' && htmlBlobUrl"
            :src="htmlBlobUrl"
            :title="fileInfo.fileName"
            :sandbox="HTML_PREVIEW_SANDBOX"
            :referrerpolicy="HTML_PREVIEW_REFERRER_POLICY"
            class="html-preview-iframe"
            allow="fullscreen"
            @load="onLoad"
            @error="onError"
          />

          <!-- 2. 视频预览 -->
          <VideoPreview
            v-else-if="previewType === 'video'"
            :key="String(fileInfo.id)"
            :video-url="effectiveFileUrl"
            :mime-type="mediaMimeType"
            :format-label="mediaFormatLabel"
            class="preview-video"
            @loaded="onRendered"
            @error="onMediaError"
          />

          <!-- 2.5 音频预览 -->
          <div v-else-if="previewType === 'audio'" class="preview-audio-container">
            <div class="preview-audio-card">
              <div class="preview-audio-summary">
                <div class="preview-audio-artwork">
                  <SvgIcon :src="icon.cloudSpace.fileIcon.audio" size="42" aria-hidden="true" />
                </div>
                <div class="preview-audio-meta">
                  <span class="preview-audio-name" :title="fileInfo.fileName">{{ fileInfo.fileName }}</span>
                  <span class="preview-audio-format">{{ mediaFormatLabel || t('cloudSpace.audio') }}</span>
                </div>
              </div>
              <audio
                :key="String(fileInfo.id)"
                class="preview-audio"
                controls
                preload="metadata"
                @loadedmetadata="onRendered"
                @error="onMediaError"
              >
                <source :src="effectiveFileUrl" :type="mediaMimeType || undefined" />
              </audio>
            </div>
          </div>

          <!-- 3. 图片预览 -->
          <div v-else-if="previewType === 'image'" class="preview-image-container">
            <img
              :src="effectiveFileUrl"
              :alt="fileInfo.fileName"
              class="preview-image"
              :style="{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${scale}) rotate(${rotate}deg)`,
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none',
              }"
              draggable="false"
              @load="onImageLoad"
              @error="onError"
              @click="previewImage"
              @dblclick="handleImageDblClick"
              @mousedown="startDrag"
              @mousemove="drag"
              @mouseup="stopDrag"
              @mouseleave="stopDrag"
              @touchstart="startTouch"
              @touchmove="moveTouch"
              @touchend="endTouch"
              @touchcancel="endTouch"
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
            <template v-if="isMarkdownFile">
              <div
                ref="markdownContainerRef"
                v-html="markdownContent"
                class="markdown-container"
                @click="handleMarkdownLink"
                v-mermaid
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

          <!-- 8. 不支持预览的文件类型 -->
          <div v-else-if="unsupportedTypes.includes(previewType)" class="unsupported-preview">
            <div class="unsupported-icon">
              <SvgIcon :src="icon.cloudSpace.preview.unknown" size="72" />
            </div>
            <h3>{{ unsupportedTitle }}</h3>
            <p>{{ unsupportedDescription }}</p>
          </div>
        </div>

        <!-- 预览控制栏：悬浮在内容区内，避免额外占用预览高度 -->
        <div v-if="!loading && !isHtmlFullscreen && (showNext || fileInfo.fileUrl)" class="preview-controls">
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
  import PdfPreview from '@/components/cloudSpace/PdfPreview.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { acquireTopLayerEscapeLock } from '@/utils/topLayerEscape';
  import ResourceBacklinks from '@/components/noteLibrary/detail/ResourceBacklinks.vue';
  import {
    CLOUD_FILE_CATEGORY_LABEL_KEY,
    getCloudFileCategory,
    getCloudMediaMimeType,
    getCloudMediaPlaybackSupport,
    getCloudPreviewType,
    isLegacyOfficeFile,
  } from '@/constants/cloudFileCategory.ts';
  import {
    HTML_PREVIEW_REFERRER_POLICY,
    HTML_PREVIEW_SANDBOX,
    injectHtmlPreviewAnchorBridge,
  } from '@/utils/htmlPreview.ts';
  import {
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    requestMobileOverlayHistoryClose,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';

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
  const MIN_IMAGE_SCALE = 0.1;
  const MAX_IMAGE_SCALE = 5;
  const MAX_TEXT_PREVIEW_CHARS = 1_000_000;
  let touchGesture: 'pan' | 'pinch' | null = null;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinchStartCenter = { x: 0, y: 0 };
  let pinchStartPosition = { x: 0, y: 0 };
  const textContent = ref('');
  const wrapText = ref(true);
  const htmlBlobUrl = ref<string>('');
  const previewRootRef = ref<HTMLElement | null>(null);
  const isHtmlFullscreen = ref(false);
  let previewHistoryHandle: MobileOverlayHistoryHandle | null = null;
  const markdownContainerRef = ref<HTMLElement | null>(null);
  const markdownContent = ref('');
  let activePreviewFileId = '';
  let textAbortController: AbortController | null = null;

  let officeStyleLoaded = false;
  let markdownLibLoaded = false;
  let markdownParser: ((markdown: string) => string) | null = null;
  let markdownSanitizer: ((html: string) => string) | null = null;
  let previousBodyOverflow = '';
  let releaseEscapeLock: (() => void) | null = null;

  const currentCategory = computed(() => getCloudFileCategory(props.fileInfo));
  const previewType = computed(() => getCloudPreviewType(props.fileInfo));
  const mediaMimeType = computed(() => getCloudMediaMimeType(props.fileInfo));
  const mediaPlaybackSupport = computed(() => getCloudMediaPlaybackSupport(props.fileInfo));
  const mediaFormatLabel = computed(() => {
    const fileName = String(props.fileInfo?.fileName || '');
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.trim().toUpperCase() : '';
    return extension || mediaMimeType.value.split('/').pop()?.split(';')[0]?.toUpperCase() || '';
  });
  const legacyOfficeFile = computed(() => isLegacyOfficeFile(props.fileInfo));
  const unsupportedTitle = computed(() =>
    t(
      legacyOfficeFile.value ? 'cloudSpace.previewPanel.legacyOfficeTitle' : 'cloudSpace.previewPanel.unsupportedTitle',
    ),
  );
  const unsupportedDescription = computed(() =>
    t(legacyOfficeFile.value ? 'cloudSpace.previewPanel.legacyOfficeDesc' : 'cloudSpace.previewPanel.unsupportedDesc'),
  );
  const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`);
  const unsupportedTypes = ['unsupported'];
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

    template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
      const href = (link.getAttribute('href') || '').trim();
      if (!/^https?:/i.test(href)) return;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
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
        if (!previewHistoryHandle) {
          previewHistoryHandle = registerMobileOverlayHistory(() => {
            previewHistoryHandle = null;
            emit('update:visible', false);
            emit('close');
          });
        }
        await startPreview(props.fileInfo);
        return;
      }
      if (!newVisible) {
        textAbortController?.abort();
        textAbortController = null;
        void exitHtmlFullscreen();
        activePreviewFileId = '';
        releaseHtmlBlobUrl();
        document.body.style.overflow = previousBodyOverflow;
        if (previewHistoryHandle) {
          releaseMobileOverlayHistory(previewHistoryHandle);
          previewHistoryHandle = null;
        }
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
    textAbortController?.abort();
    textAbortController = null;
    loading.value = true;
    error.value = false;
    errorMessage.value = '';
    textContent.value = '';
    markdownContent.value = '';
    resetImageView();
    releaseHtmlBlobUrl();
    try {
      if (['word', 'excel', 'ppt'].includes(previewType.value)) {
        await ensureOfficeStylesLoaded();
      }
      if (previewType.value === 'html') {
        await loadHtmlBlob(effectiveFileUrl.value);
      } else if (previewType.value === 'text') {
        await loadTextContent(effectiveFileUrl.value);
      } else if (
        (previewType.value === 'video' || previewType.value === 'audio') &&
        mediaPlaybackSupport.value === 'unsupported'
      ) {
        error.value = true;
        errorMessage.value = t('cloudSpace.previewPanel.mediaUnsupported');
        loading.value = false;
      } else if (unsupportedTypes.includes(previewType.value)) {
        loading.value = false;
      }
    } catch (err) {
      error.value = true;
      errorMessage.value = t('cloudSpace.previewPanel.loadFailed');
      loading.value = false;
    }
  }

  function releaseHtmlBlobUrl() {
    if (!htmlBlobUrl.value) return;
    URL.revokeObjectURL(htmlBlobUrl.value);
    htmlBlobUrl.value = '';
  }

  async function loadHtmlBlob(url?: string) {
    if (!url) {
      error.value = true;
      errorMessage.value = t('cloudSpace.previewPanel.invalidUrl');
      loading.value = false;
      return;
    }

    const expectedFileId = activePreviewFileId;
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }
      const sourceBlob = await response.blob();
      if (expectedFileId !== activePreviewFileId) return;

      // 强制使用 text/html，兼容对象存储把 .html 误标为 application/octet-stream 的情况。
      const source = await sourceBlob.text();
      if (expectedFileId !== activePreviewFileId) return;
      const htmlBlob = new Blob([injectHtmlPreviewAnchorBridge(source)], { type: 'text/html;charset=utf-8' });
      htmlBlobUrl.value = URL.createObjectURL(htmlBlob);
      // 保持加载态，直到 iframe 真正完成导航并触发 onLoad。
    } catch (err) {
      if (expectedFileId !== activePreviewFileId) return;
      console.error('加载HTML文件失败:', err);
      error.value = true;
      errorMessage.value = t('cloudSpace.previewPanel.textLoadFailed');
      loading.value = false;
    }
  }

  // 加载文本内容
  async function loadTextContent(url?: string) {
    const expectedFileId = activePreviewFileId;
    if (!url) {
      textContent.value = t('cloudSpace.previewPanel.invalidUrl');
      loading.value = false;
      return;
    }

    const controller = new AbortController();
    textAbortController = controller;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      let content = '';
      let truncated = false;
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          content += decoder.decode(value, { stream: true });
          if (content.length > MAX_TEXT_PREVIEW_CHARS) {
            content = content.slice(0, MAX_TEXT_PREVIEW_CHARS);
            truncated = true;
            await reader.cancel().catch(() => undefined);
            break;
          }
        }
        if (!truncated) content += decoder.decode();
      } else {
        content = await response.text();
        if (content.length > MAX_TEXT_PREVIEW_CHARS) {
          content = content.slice(0, MAX_TEXT_PREVIEW_CHARS);
          truncated = true;
        }
      }

      if (content.length > MAX_TEXT_PREVIEW_CHARS) {
        content = content.slice(0, MAX_TEXT_PREVIEW_CHARS);
        truncated = true;
      }

      if (expectedFileId !== activePreviewFileId) return;
      textContent.value = truncated ? content + `\n\n${t('cloudSpace.previewPanel.contentTruncated')}` : content;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError' || expectedFileId !== activePreviewFileId) return;
      console.error('加载文本文件失败:', err);
      textContent.value = t('cloudSpace.previewPanel.textLoadFailed');
      throw err;
    } finally {
      if (textAbortController === controller) textAbortController = null;
      if (expectedFileId === activePreviewFileId) loading.value = false;
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

  function onMediaError() {
    loading.value = false;
    error.value = true;
    errorMessage.value = t('cloudSpace.previewPanel.mediaLoadFailed');
  }

  function onPdfError(err: unknown) {
    console.error('PDF 文档渲染失败:', err);
    loading.value = false;
    error.value = true;
    errorMessage.value = t('cloudSpace.previewPanel.pdfLoadFailed');
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
      message.success(t('cloudSpace.previewPanel.copySuccess'));
    } catch (err) {
      console.error('复制失败:', err);
      message.error(t('cloudSpace.previewPanel.copyFailed'));
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

    if (/^(https?:|mailto:|tel:)/i.test(href)) return;

    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) {
      event.preventDefault();
      message.warning(t('cloudSpace.previewPanel.relativeLinkUnavailable'));
      return;
    }

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

  async function enterHtmlFullscreen() {
    const previewRoot = previewRootRef.value;
    if (previewType.value !== 'html' || !previewRoot) return;

    // 先进入轻笺沉浸态，Fullscreen API 不可用或被浏览器拒绝时仍可正常使用。
    isHtmlFullscreen.value = true;
    if (typeof previewRoot.requestFullscreen !== 'function') return;

    try {
      await previewRoot.requestFullscreen();
    } catch {
      // 浏览器可能因权限或运行环境拒绝原生全屏，此时保留页面内沉浸态作为兼容降级。
    }
  }

  async function exitHtmlFullscreen() {
    isHtmlFullscreen.value = false;
    const previewRoot = previewRootRef.value;
    if (!previewRoot || document.fullscreenElement !== previewRoot || typeof document.exitFullscreen !== 'function')
      return;

    try {
      await document.exitFullscreen();
    } catch (err) {
      console.warn('退出浏览器全屏失败:', err);
    }
  }

  function handleFullscreenChange() {
    if (document.fullscreenElement === previewRootRef.value) {
      isHtmlFullscreen.value = true;
      return;
    }
    isHtmlFullscreen.value = false;
  }

  function resetImageView() {
    rotate.value = 0;
    scale.value = 1;
    imagePosition.value = { x: 0, y: 0 };
    resetTouchGesture();
  }

  function handleClose() {
    releaseHtmlBlobUrl();
    resetImageView();
    if (previewHistoryHandle && requestMobileOverlayHistoryClose(previewHistoryHandle)) return;
    previewHistoryHandle = null;
    emit('update:visible', false);
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
    scale.value = Math.min(scale.value * 1.2, MAX_IMAGE_SCALE);
  }

  function zoomOut() {
    scale.value = Math.max(scale.value / 1.2, MIN_IMAGE_SCALE);
    if (scale.value <= 1) imagePosition.value = { x: 0, y: 0 };
  }

  function resetZoom() {
    scale.value = 1;
    rotate.value = 0;
    imagePosition.value = { x: 0, y: 0 };
    resetTouchGesture();
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

  function getTouchPoint(touch: Touch) {
    return { x: touch.clientX, y: touch.clientY };
  }

  function getTouchCenter(touches: TouchList) {
    const first = getTouchPoint(touches[0]);
    const second = getTouchPoint(touches[1]);
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function getTouchDistance(touches: TouchList) {
    const first = getTouchPoint(touches[0]);
    const second = getTouchPoint(touches[1]);
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function resetTouchGesture() {
    touchGesture = null;
    pinchStartDistance = 0;
    isDragging.value = false;
  }

  function startTouch(e: TouchEvent) {
    if (previewType.value !== 'image') return;
    if (e.touches.length >= 2) {
      touchGesture = 'pinch';
      pinchStartDistance = getTouchDistance(e.touches);
      pinchStartScale = scale.value;
      pinchStartCenter = getTouchCenter(e.touches);
      pinchStartPosition = { ...imagePosition.value };
      isDragging.value = false;
      e.preventDefault();
      return;
    }

    if (e.touches.length === 1 && scale.value > 1) {
      const point = getTouchPoint(e.touches[0]);
      touchGesture = 'pan';
      dragStart.value = {
        x: point.x - imagePosition.value.x,
        y: point.y - imagePosition.value.y,
      };
      isDragging.value = true;
      e.preventDefault();
    }
  }

  function moveTouch(e: TouchEvent) {
    if (previewType.value !== 'image') return;
    if (e.touches.length >= 2) {
      if (touchGesture !== 'pinch' || pinchStartDistance <= 0) startTouch(e);
      const distanceRatio = getTouchDistance(e.touches) / pinchStartDistance;
      const center = getTouchCenter(e.touches);
      scale.value = Math.min(Math.max(pinchStartScale * distanceRatio, MIN_IMAGE_SCALE), MAX_IMAGE_SCALE);
      imagePosition.value = {
        x: pinchStartPosition.x + center.x - pinchStartCenter.x,
        y: pinchStartPosition.y + center.y - pinchStartCenter.y,
      };
      if (scale.value <= 1) imagePosition.value = { x: 0, y: 0 };
      isDragging.value = false;
      e.preventDefault();
      return;
    }

    if (e.touches.length === 1 && touchGesture === 'pan' && isDragging.value) {
      const point = getTouchPoint(e.touches[0]);
      imagePosition.value = {
        x: point.x - dragStart.value.x,
        y: point.y - dragStart.value.y,
      };
      e.preventDefault();
    }
  }

  function endTouch(e: TouchEvent) {
    if (e.touches.length === 0) {
      resetTouchGesture();
      return;
    }

    if (e.touches.length === 1 && touchGesture === 'pinch') {
      const point = getTouchPoint(e.touches[0]);
      touchGesture = scale.value > 1 ? 'pan' : null;
      isDragging.value = scale.value > 1;
      dragStart.value = {
        x: point.x - imagePosition.value.x,
        y: point.y - imagePosition.value.y,
      };
    }
  }

  function getFileTypeName(type: string) {
    const labelKey = CLOUD_FILE_CATEGORY_LABEL_KEY[getCloudFileCategory({ category: type })];
    return t(labelKey);
  }

  // 键盘事件
  function handleKeyDown(e: KeyboardEvent) {
    if (!props.visible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (isHtmlFullscreen.value) {
        void exitHtmlFullscreen();
        return;
      }
      handleClose();
      return;
    }

    if (isHtmlFullscreen.value) return;
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

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('mousedown', handleMiddleDblClick);
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
  });

  onUnmounted(() => {
    textAbortController?.abort();
    textAbortController = null;
    syncEscapeLock(false);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('wheel', handleWheel);
    document.removeEventListener('mousedown', handleMiddleDblClick);
    document.removeEventListener('selectstart', preventSelect);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    if (previewHistoryHandle) releaseMobileOverlayHistory(previewHistoryHandle);
    previewHistoryHandle = null;
    document.body.style.overflow = previousBodyOverflow;
    releaseHtmlBlobUrl();
    void exitHtmlFullscreen();
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

    &:fullscreen {
      width: 100vw;
      height: 100vh;
    }

    &.html-fullscreen-mode {
      grid-template-rows: 40px minmax(0, 1fr);

      .preview-header {
        display: none;
      }

      .preview-content {
        grid-row: 2;
      }
    }

    .fullscreen-exit-bar {
      grid-row: 1;
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
      padding: 0 max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left));
      border-bottom: 1px solid var(--card-border-color);
      background: color-mix(in srgb, var(--background-color) 94%, var(--primary-color) 6%);
      box-sizing: border-box;
    }

    .exit-fullscreen-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      height: 34px;
      padding: 0 12px;
      border: 1px solid color-mix(in srgb, var(--card-border-color) 78%, transparent);
      border-radius: 10px;
      color: var(--text-color);
      background: var(--primary-btn-bg-color);
    }

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
        border: 1px solid var(--resource-file-color);
        border-radius: 999px;
        background: color-mix(in srgb, var(--resource-file-color) 12%, transparent);
        color: var(--resource-file-color);
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

        .header-close-btn,
        .header-fullscreen-btn {
          width: 30px;
          min-width: 30px;
          height: 30px;
          padding: 0;
          border-radius: 9px;
          color: var(--desc-color);
        }

        .header-fullscreen-btn {
          color: var(--text-color);
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

        .html-preview-iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: var(--background-color);
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
          box-sizing: border-box;
          padding: 24px 20px 88px;

          .preview-audio-card {
            width: min(560px, 100%);
            padding: 22px;
            box-sizing: border-box;
            border: 1px solid var(--card-border-color);
            border-radius: 16px;
            background: var(--card-background);
            box-shadow: var(--surface-card-shadow);
          }

          .preview-audio-summary {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: 0;
            margin-bottom: 18px;
          }

          .preview-audio-artwork {
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            border: 1px solid var(--resource-file-color);
            border-radius: 18px;
            background: color-mix(in srgb, var(--resource-file-color) 10%, var(--card-background));
          }

          .preview-audio-meta {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
          }

          .preview-audio-name {
            overflow: hidden;
            color: var(--text-color);
            font-size: 15px;
            font-weight: 650;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .preview-audio-format {
            color: var(--desc-color);
            font-size: 12px;
            font-weight: 600;
          }

          .preview-audio {
            display: block;
            width: 100%;
            accent-color: var(--resource-file-color);
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
            touch-action: none;
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

        .unsupported-preview {
          text-align: center;
          padding: 60px 40px 104px;

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

  @media (max-width: 767px) {
    .header-fullscreen-btn {
      display: none;
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

        .preview-main .preview-audio-container {
          padding: 14px 12px 76px;

          .preview-audio-card {
            padding: 16px;
            border-radius: 13px;
          }

          .preview-audio-artwork {
            width: 54px;
            height: 54px;
            border-radius: 15px;
          }
        }

        .preview-controls {
          bottom: max(10px, env(safe-area-inset-bottom));
          max-width: calc(100% - 16px);
          padding: 6px;
          border-radius: 13px;

          .action-btn {
            width: 40px;
            min-width: 40px;
            height: 40px;
            border-radius: 11px;
          }

          .zoom-value-btn {
            width: 58px;
            min-width: 58px;
          }
        }
      }

      .preview-header .preview-actions {
        .header-close-btn,
        .header-fullscreen-btn {
          width: 40px;
          min-width: 40px;
          height: 40px;
          border-radius: 11px;
        }
      }

      &.html-fullscreen-mode {
        grid-template-rows: 40px minmax(0, 1fr);
      }
    }
  }
</style>
