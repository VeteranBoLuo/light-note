<template>
  <div
    ref="rootRef"
    class="cloud-text-card-preview"
    style="pointer-events: none"
    aria-hidden="true"
    inert
  >
    <div v-if="state.loading" class="cloud-text-card-preview__status">
      {{ t('cloudSpace.textPreviewLoading') }}
    </div>
    <div v-else-if="state.error" class="cloud-text-card-preview__status">
      {{ t('cloudSpace.previewPanel.loadFailed') }}
    </div>
    <iframe
      v-else-if="state.kind === 'html'"
      class="cloud-text-card-preview__frame"
      style="pointer-events: none"
      :srcdoc="state.html"
      sandbox=""
      tabindex="-1"
      referrerpolicy="no-referrer"
      title=""
    />
    <div
      v-else-if="state.kind === 'markdown'"
      class="cloud-text-card-preview__document"
      v-html="state.html"
      v-mermaid
    ></div>
    <pre v-else class="cloud-text-card-preview__plain">{{ state.text }}</pre>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { isHtmlFile } from '@/constants/cloudFileCategory';

  type CloudTextFile = {
    id?: string | number;
    fileName?: string;
    fileType?: string;
    fileUrl?: string;
    ext?: string;
  };

  type PreviewKind = 'html' | 'markdown' | 'text';
  type PreviewResult = {
    kind: PreviewKind;
    html: string;
    text: string;
  };

  const props = defineProps<{ fileInfo: CloudTextFile }>();
  const { t } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  const state = reactive({
    loading: true,
    error: false,
    kind: 'text' as PreviewKind,
    html: '',
    text: '',
  });

  const SOURCE_READ_LIMIT = 64 * 1024;
  const MAX_CACHE_ENTRIES = 80;
  const MAX_PARALLEL_LOADS = 4;
  const previewCache = getPreviewCache();
  let observer: IntersectionObserver | null = null;
  let loadVersion = 0;
  let hasEnteredViewport = false;

  const SAFE_TAGS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'div',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'del',
    's',
    'small',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'hr',
    'br',
    'a',
    'input',
  ];
  const SAFE_ATTRS = ['type', 'checked', 'disabled', 'colspan', 'rowspan'];

  function getPreviewCache() {
    const scope = globalThis as typeof globalThis & {
      __LIGHT_NOTE_CLOUD_TEXT_PREVIEW_CACHE__?: Map<string, Promise<PreviewResult>>;
    };
    if (!scope.__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_CACHE__) {
      scope.__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_CACHE__ = new Map();
    }
    return scope.__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_CACHE__;
  }

  function getLoadScheduler() {
    const scope = globalThis as typeof globalThis & {
      __LIGHT_NOTE_CLOUD_TEXT_PREVIEW_SCHEDULER__?: {
        active: number;
        queue: Array<() => void>;
      };
    };
    if (!scope.__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_SCHEDULER__) {
      scope.__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_SCHEDULER__ = { active: 0, queue: [] };
    }
    return scope.__LIGHT_NOTE_CLOUD_TEXT_PREVIEW_SCHEDULER__;
  }

  function scheduleLoad<T>(task: () => Promise<T>): Promise<T> {
    const scheduler = getLoadScheduler();
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        scheduler.active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            scheduler.active -= 1;
            scheduler.queue.shift()?.();
          });
      };
      if (scheduler.active < MAX_PARALLEL_LOADS) run();
      else scheduler.queue.push(run);
    });
  }

  function fileExtension(file: CloudTextFile): string {
    const explicit = String(file.ext || '')
      .trim()
      .toLowerCase();
    if (explicit) return explicit;
    const name = String(file.fileName || '').toLowerCase();
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1) : '';
  }

  function previewKind(file: CloudTextFile): PreviewKind {
    const extension = fileExtension(file);
    if (extension === 'md' || extension === 'markdown') return 'markdown';
    if (isHtmlFile(file)) return 'html';
    return 'text';
  }

  function previewCacheKey(file: CloudTextFile): string {
    return [file.id || '', file.fileUrl || '', file.fileName || '', file.fileType || ''].join('|');
  }

  function rememberPreview(key: string, task: Promise<PreviewResult>) {
    previewCache.set(key, task);
    while (previewCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = previewCache.keys().next().value;
      if (!oldestKey) break;
      previewCache.delete(oldestKey);
    }
  }

  async function readPreviewSource(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    if (!response.body) {
      return (await response.text()).slice(0, SOURCE_READ_LIMIT);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let source = '';
    while (source.length < SOURCE_READ_LIMIT) {
      const { done, value } = await reader.read();
      if (done) break;
      source += decoder.decode(value, { stream: true });
      if (source.length >= SOURCE_READ_LIMIT) {
        await reader.cancel();
        break;
      }
    }
    source += decoder.decode();
    return source.slice(0, SOURCE_READ_LIMIT);
  }

  async function sanitizeDocumentFragment(source: string, kind: PreviewKind): Promise<string> {
    const dompurifyModule = await import('dompurify');
    const DOMPurify = dompurifyModule.default;
    let html = source;
    if (kind === 'markdown') {
      const { marked } = await import('marked');
      html = marked.parse(source, { gfm: true, breaks: true }) as string;
    } else if (kind === 'html') {
      const parsed = new DOMParser().parseFromString(source, 'text/html');
      html = parsed.body?.innerHTML || source;
    }

    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: SAFE_TAGS,
      ALLOWED_ATTR: SAFE_ATTRS,
    }) as string;
    const template = document.createElement('template');
    template.innerHTML = sanitized;
    template.content.querySelectorAll('a').forEach((element) => {
      element.removeAttribute('href');
      element.removeAttribute('target');
    });
    template.content.querySelectorAll('input').forEach((element) => {
      element.setAttribute('disabled', '');
      element.setAttribute('tabindex', '-1');
    });
    return template.innerHTML;
  }

  function createHtmlPreviewDocument(body: string): string {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: blob:; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; style-src 'unsafe-inline'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #fff; color: #20232d; }
      body { padding: 12px 14px 20px; font: 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
      h1, h2, h3, h4, h5, h6 { margin: 0 0 8px; line-height: 1.3; font-size: 16px; }
      p, ul, ol, blockquote, pre, table { margin: 0 0 8px; }
      ul, ol { padding-left: 22px; }
      li + li { margin-top: 3px; }
      blockquote { padding-left: 10px; border-left: 3px solid #d9dbe7; color: #626776; }
      pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      pre { padding: 8px; border-radius: 6px; background: #f4f5f8; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 4px 6px; border: 1px solid #e2e4eb; text-align: left; }
      input { margin: 0 6px 0 0; vertical-align: -1px; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
  }

  function normalizePlainText(source: string): string {
    const compact = source.replace(/\s+/g, ' ').trim();
    if (!compact) return t('cloudSpace.textPreviewEmpty');
    return compact.length > 360 ? `${compact.slice(0, 360)}…` : compact;
  }

  async function buildPreview(file: CloudTextFile): Promise<PreviewResult> {
    const source = await readPreviewSource(String(file.fileUrl || ''));
    const kind = previewKind(file);
    if (kind === 'text') {
      return { kind, html: '', text: normalizePlainText(source) };
    }
    const safeHtml = await sanitizeDocumentFragment(source, kind);
    if (!safeHtml.trim()) {
      return { kind: 'text', html: '', text: t('cloudSpace.textPreviewEmpty') };
    }
    return {
      kind,
      html: kind === 'html' ? createHtmlPreviewDocument(safeHtml) : safeHtml,
      text: '',
    };
  }

  function resetState() {
    state.loading = true;
    state.error = false;
    state.kind = 'text';
    state.html = '';
    state.text = '';
  }

  async function loadPreview() {
    if (!hasEnteredViewport) return;
    const file = props.fileInfo;
    const url = String(file?.fileUrl || '');
    if (!url) {
      state.loading = false;
      state.error = true;
      return;
    }

    const version = ++loadVersion;
    resetState();
    const key = previewCacheKey(file);
    let task = previewCache.get(key);
    if (!task) {
      task = scheduleLoad(() => buildPreview(file));
      rememberPreview(key, task);
      task.catch(() => previewCache.delete(key));
    }

    try {
      const result = await task;
      if (version !== loadVersion) return;
      state.kind = result.kind;
      state.html = result.html;
      state.text = result.text;
      state.loading = false;
    } catch {
      if (version !== loadVersion) return;
      state.loading = false;
      state.error = true;
    }
  }

  function observeVisibility() {
    if (typeof IntersectionObserver === 'undefined' || !rootRef.value) {
      hasEnteredViewport = true;
      void loadPreview();
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        hasEnteredViewport = true;
        observer?.disconnect();
        observer = null;
        void loadPreview();
      },
      { rootMargin: '160px' },
    );
    observer.observe(rootRef.value);
  }

  watch(
    () => [props.fileInfo?.id, props.fileInfo?.fileUrl, props.fileInfo?.fileName],
    () => {
      loadVersion += 1;
      if (hasEnteredViewport) void loadPreview();
      else resetState();
    },
  );

  onMounted(observeVisibility);
  onBeforeUnmount(() => {
    loadVersion += 1;
    observer?.disconnect();
    observer = null;
  });
</script>

<style scoped lang="less">
  .cloud-text-card-preview {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: color-mix(in srgb, var(--card-background) 96%, var(--workspace-panel-bg-color));
    color: var(--text-color);
    user-select: none;
  }

  .cloud-text-card-preview__status {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .cloud-text-card-preview__frame,
  .cloud-text-card-preview__document,
  .cloud-text-card-preview__plain {
    width: 100%;
    height: 100%;
    border: 0;
    overflow: hidden;
  }

  .cloud-text-card-preview__frame {
    display: block;
    background: #fff;
  }

  .cloud-text-card-preview__document {
    padding: 12px 14px 20px;
    background: var(--card-background);
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.5;
  }

  .cloud-text-card-preview__document :deep(h1),
  .cloud-text-card-preview__document :deep(h2),
  .cloud-text-card-preview__document :deep(h3),
  .cloud-text-card-preview__document :deep(h4),
  .cloud-text-card-preview__document :deep(h5),
  .cloud-text-card-preview__document :deep(h6) {
    margin: 0 0 7px;
    font-size: 15px;
    line-height: 1.3;
  }

  .cloud-text-card-preview__document :deep(p),
  .cloud-text-card-preview__document :deep(ul),
  .cloud-text-card-preview__document :deep(ol),
  .cloud-text-card-preview__document :deep(blockquote),
  .cloud-text-card-preview__document :deep(pre),
  .cloud-text-card-preview__document :deep(table) {
    margin: 0 0 7px;
  }

  .cloud-text-card-preview__document :deep(ul),
  .cloud-text-card-preview__document :deep(ol) {
    padding-left: 20px;
  }

  .cloud-text-card-preview__document :deep(pre) {
    padding: 7px;
    border-radius: 6px;
    background: var(--workspace-panel-bg-color);
    white-space: pre-wrap;
  }

  .cloud-text-card-preview__document :deep(table) {
    width: 100%;
    border-collapse: collapse;
  }

  .cloud-text-card-preview__document :deep(th),
  .cloud-text-card-preview__document :deep(td) {
    padding: 3px 5px;
    border: 1px solid var(--card-border-color);
    text-align: left;
  }

  .cloud-text-card-preview__plain {
    margin: 0;
    padding: 13px 14px;
    box-sizing: border-box;
    color: var(--desc-color);
    font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
