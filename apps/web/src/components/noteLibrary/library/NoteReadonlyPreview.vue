<template>
  <section class="note-readonly-preview" aria-live="polite">
    <header class="note-readonly-preview__header">
      <div class="note-readonly-preview__heading">
        <nav class="note-readonly-preview__breadcrumb" :aria-label="t('note.currentDirectory')">
          <BButton size="small" @click="emit('close')">{{ t('note.knowledgeRoot') }}</BButton>
          <template v-for="item in parentBreadcrumb" :key="item.id">
            <span aria-hidden="true">/</span>
            <span>{{ item.title || t('note.untitled') }}</span>
          </template>
        </nav>
        <div class="note-readonly-preview__title-row">
          <h2>{{ displayNote.title || t('note.untitled') }}</h2>
          <InboxPendingBadge v-if="previewPending" />
          <span v-if="childCount > 0" class="note-readonly-preview__child-count">
            {{ t('note.childPagesCount', { count: childCount }) }}
          </span>
          <div class="note-readonly-preview__meta">
            <span class="note-readonly-preview__mode">
              <SvgIcon :src="icon.cloudSpace.preview.sidebar" size="14" aria-hidden="true" />
              {{ t('common.preview') }}
            </span>
            <span v-if="displayTime">{{ displayTime }}</span>
          </div>
        </div>
      </div>

      <div class="note-readonly-preview__actions">
        <BButton type="primary" class="note-readonly-preview__edit" @click="emit('edit')">
          <SvgIcon :src="icon.card_edit" size="16" aria-hidden="true" />
          {{ t('common.edit') }}
        </BButton>
        <BDropdown v-if="menuOptions.length" trigger="click" align="right" :menu-options="menuOptions">
          <BButton class="note-readonly-preview__more" :aria-label="t('common.more')">
            <SvgIcon :src="icon.common.more" size="17" aria-hidden="true" />
          </BButton>
        </BDropdown>
      </div>
    </header>

    <div v-auto-scrollbar class="note-readonly-preview__scroll">
      <div v-if="loading" class="note-readonly-preview__loading">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <template v-else-if="error">
        <div class="note-readonly-preview__error">
          <strong>{{ t('common.requestFailed') }}</strong>
          <BButton size="small" @click="loadPreview">{{ t('common.retry') }}</BButton>
        </div>
      </template>
      <article v-else class="note-readonly-preview__article">
        <DrawingNoteEditor
          v-if="displayNote.type === 'drawing'"
          class="note-readonly-preview__drawing"
          :content="String(displayNote.content || '')"
          :title="String(displayNote.title || '')"
          :note-id="String(displayNote.id || noteId)"
          readonly
        />
        <div
          v-else-if="previewHtml"
          ref="previewContentRef"
          class="note-readonly-preview__content note-rich-content is-image-preview-enabled"
          @click="handlePreviewContentActivation"
          @keydown="handlePreviewImageActivation"
          v-html="previewHtml"
        ></div>
        <p v-else class="note-readonly-preview__empty">{{ t('common.none') }}</p>
      </article>
    </div>

    <BModal
      v-model:visible="resourcePreviewVisible"
      :title="t('note.resourceMention.resourceActionsTitle')"
      width="360px"
      :show-footer="false"
      @close="closeResourcePreview"
    >
      <div v-if="resourcePreview" class="note-readonly-preview__resource-preview">
        <div class="note-readonly-preview__resource-summary">
          <strong>{{ resourcePreviewTitle }}</strong>
          <span>{{ resourcePreviewType }}</span>
        </div>
        <p
          class="note-readonly-preview__resource-status"
          :class="{ 'is-unavailable': resourcePreviewState?.available === false }"
        >
          {{ resourcePreviewStatus }}
        </p>
        <div class="note-readonly-preview__resource-actions">
          <template v-if="resourcePreview.ref.type === 'file'">
            <BButton
              type="primary"
              :loading="inlineFilePreviewLoading"
              :disabled="!resourcePreviewCanOpen"
              @click="openReferencedFileInlinePreview"
            >
              {{ t('note.resourceMention.previewHere') }}
            </BButton>
            <BButton :disabled="!resourcePreviewCanOpen || inlineFilePreviewLoading" @click="openResourcePreviewTarget">
              {{ t('note.resourceMention.openInCloudSpace') }}
            </BButton>
          </template>
          <BButton v-else type="primary" :disabled="!resourcePreviewCanOpen" @click="openResourcePreviewTarget">
            {{ resourcePreviewOpenLabel }}
          </BButton>
        </div>
      </div>
    </BModal>

    <FilePreview
      v-if="inlineFilePreviewInfo"
      v-model:visible="inlineFilePreviewVisible"
      :file-info="inlineFilePreviewInfo"
      @close="closeReferencedFileInlinePreview"
    />
  </section>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { consumeNoteDetail } from '@/api/noteDetailPrefetch';
  import { resolveNoteResourceRefs, type ResolvedResourceReference } from '@/api/noteReferences';
  import { useUserStore } from '@/store';
  import { normalizeNoteContentResourceUrls, noteContentToHtml } from '@/utils/common';
  import {
    collectResourceRefsFromHtml,
    parseResourceHref,
    presentResourceReferenceChips,
    resourceRefKey,
    type ResourceRef,
  } from '@/utils/noteResourceRefs';
  import { handleNoteContentImagePreviewEvent, prepareNoteContentPreviewImages } from '@/utils/noteImagePreview';
  import { normalizeReferencedFilePreviewInfo, type ReferencedFilePreviewInfo } from '@/utils/noteResourceNavigation';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import {
    resolveAiSourceNavigation,
    type AiSource,
    type AiSourceTarget,
  } from '@/components/aiAssistant/aiSourceNavigation';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const DrawingNoteEditor = defineAsyncComponent(
    () => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
  );

  interface PreviewBreadcrumbItem {
    id: string;
    title?: string;
  }

  interface PreviewMenuOption {
    key?: string;
    label?: string;
    icon?: string;
    danger?: boolean;
    divider?: boolean;
    function?: () => void;
  }

  const props = withDefaults(
    defineProps<{
      noteId: string;
      seed?: Record<string, any> | null;
      childCount?: number;
      menuOptions?: PreviewMenuOption[];
    }>(),
    {
      seed: null,
      childCount: 0,
      menuOptions: () => [],
    },
  );
  const emit = defineEmits<{ close: []; edit: []; pendingState: [pending: boolean] }>();
  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const detail = ref<Record<string, any>>({});
  const breadcrumb = ref<PreviewBreadcrumbItem[]>([]);
  const previewHtml = ref('');
  const previewSourceHtml = ref('');
  const previewContentRef = ref<HTMLElement | null>(null);
  const resolvedResourceRefs = ref<ResolvedResourceReference[]>([]);
  const resourcePreviewVisible = ref(false);
  const resourcePreview = ref<{ ref: ResourceRef; title: string } | null>(null);
  const inlineFilePreviewVisible = ref(false);
  const inlineFilePreviewLoading = ref(false);
  const inlineFilePreviewInfo = ref<ReferencedFilePreviewInfo | null>(null);
  const loading = ref(false);
  const error = ref(false);
  let requestSeq = 0;
  let resourceResolveSeq = 0;
  let inlineFilePreviewRequestId = 0;

  const displayNote = computed(() => ({ ...(props.seed || {}), ...detail.value }));
  // 操作成功后父级会立即更新 seed；优先使用它，避免刚加载的详情副本把新状态覆盖回去。
  const previewPending = computed(() => Boolean(props.seed?.isPending ?? detail.value.isPending));
  const parentBreadcrumb = computed(() => breadcrumb.value.filter((item) => item.id !== props.noteId));
  const displayTime = computed(() => String(displayNote.value.updateTime || displayNote.value.createTime || '').trim());

  function resolvedResourceRef(ref: ResourceRef) {
    return resolvedResourceRefs.value.find((item) => item.type === ref.type && item.id === ref.id);
  }

  const resourcePreviewState = computed(() => {
    const preview = resourcePreview.value;
    return preview ? resolvedResourceRef(preview.ref) || null : null;
  });
  const resourcePreviewTitle = computed(() => {
    const preview = resourcePreview.value;
    if (!preview) return '';
    return resourcePreviewState.value?.title || preview.title || preview.ref.id;
  });
  const resourcePreviewType = computed(() => {
    const type = resourcePreview.value?.ref.type;
    return type ? t(`ai.sourceTypes.${type}`) : '';
  });
  const resourcePreviewCanOpen = computed(() => {
    const preview = resourcePreview.value;
    const state = resourcePreviewState.value;
    if (!preview || !state?.available) return false;
    return preview.ref.type !== 'bookmark' || Boolean(state.url);
  });
  const resourcePreviewStatus = computed(() => {
    const preview = resourcePreview.value;
    const state = resourcePreviewState.value;
    if (!preview || !state || (preview.ref.type === 'bookmark' && !state.url)) {
      return t('note.resourceMention.checkingResource');
    }
    return state.available ? t('note.resourceMention.resourceReady') : t('note.resourceMention.resourceUnavailable');
  });
  const resourcePreviewOpenLabel = computed(() => {
    const type = resourcePreview.value?.ref.type;
    if (type === 'bookmark') return t('note.resourceMention.openWebsite');
    if (type === 'file') return t('note.resourceMention.openFile');
    return t('note.resourceMention.openNote');
  });

  function handlePreviewImageActivation(event: MouseEvent | KeyboardEvent) {
    handleNoteContentImagePreviewEvent(event);
  }

  function handlePreviewContentActivation(event: MouseEvent) {
    if (handleNoteContentImagePreviewEvent(event)) return;
    const target = event.target;
    const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    const ref = anchor ? parseResourceHref(anchor.getAttribute('href')) : null;
    if (!ref || !anchor) return;
    event.preventDefault();
    event.stopPropagation();
    resourcePreview.value = {
      ref,
      title: String(anchor.textContent || '').trim() || ref.id,
    };
    resourcePreviewVisible.value = true;
  }

  function closeResourcePreview() {
    inlineFilePreviewRequestId += 1;
    inlineFilePreviewLoading.value = false;
    resourcePreviewVisible.value = false;
    resourcePreview.value = null;
  }

  async function navigateResourceRef(ref: ResourceRef) {
    const state = resolvedResourceRef(ref);
    if (!state?.available || (ref.type === 'bookmark' && !state.url)) {
      message.warning(t('note.resourceMention.resourceUnavailable'));
      return;
    }
    const source: AiSource = {
      type: ref.type,
      id: ref.id,
      title: state.title || ref.id,
      url: state.url,
      target: state.navigation?.target as AiSourceTarget | undefined,
      fileId: state.navigation?.fileId,
    };
    const navigation = resolveAiSourceNavigation(source);
    if (navigation.kind === 'external') {
      window.open(navigation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (navigation.kind === 'internal') await router.push(navigation.target);
  }

  async function openResourcePreviewTarget() {
    const preview = resourcePreview.value;
    if (!preview) return;
    if (!resourcePreviewCanOpen.value) {
      message.warning(resourcePreviewStatus.value);
      return;
    }
    await closeCurrentMobileOverlayThen(closeResourcePreview, () => navigateResourceRef(preview.ref));
  }

  async function openReferencedFileInlinePreview() {
    const preview = resourcePreview.value;
    if (!preview || preview.ref.type !== 'file' || inlineFilePreviewLoading.value) return;
    if (!resourcePreviewCanOpen.value) {
      message.warning(resourcePreviewStatus.value);
      return;
    }
    const expectedRefKey = resourceRefKey(preview.ref);
    const requestId = ++inlineFilePreviewRequestId;
    inlineFilePreviewLoading.value = true;
    try {
      const res = await apiBasePost('/api/file/getFileInfo', { id: preview.ref.id }, { silent: true });
      const currentPreview = resourcePreview.value;
      if (
        requestId !== inlineFilePreviewRequestId ||
        !resourcePreviewVisible.value ||
        !currentPreview ||
        resourceRefKey(currentPreview.ref) !== expectedRefKey
      ) {
        return;
      }
      const fileInfo =
        res?.status === 200 ? normalizeReferencedFilePreviewInfo(res.data, { id: preview.ref.id }) : null;
      if (!fileInfo) {
        message.warning(t('note.resourceMention.resourceUnavailable'));
        return;
      }
      await closeCurrentMobileOverlayThen(closeResourcePreview, () => {
        inlineFilePreviewInfo.value = fileInfo;
        inlineFilePreviewVisible.value = true;
      });
    } catch {
      if (requestId === inlineFilePreviewRequestId) {
        message.warning(t('note.resourceMention.resourceUnavailable'));
      }
    } finally {
      if (requestId === inlineFilePreviewRequestId) inlineFilePreviewLoading.value = false;
    }
  }

  function closeReferencedFileInlinePreview() {
    inlineFilePreviewVisible.value = false;
    inlineFilePreviewInfo.value = null;
  }

  async function decoratePreviewImages() {
    await nextTick();
    prepareNoteContentPreviewImages(previewContentRef.value, t('noteDetail.editor.imagePreview'));
  }

  async function resolvePreviewResourceRefs(html: string, parentRequestSeq: number) {
    const refs = collectResourceRefsFromHtml(html).slice(0, 100);
    const seq = ++resourceResolveSeq;
    resolvedResourceRefs.value = [];
    if (!refs.length) return;
    try {
      const resolved = await resolveNoteResourceRefs(refs);
      if (seq !== resourceResolveSeq || parentRequestSeq !== requestSeq || html !== previewSourceHtml.value) return;
      resolvedResourceRefs.value = resolved;
      previewHtml.value = presentResourceReferenceChips(html, resolved, {
        unavailableLabel: (snapshotTitle) => t('note.resourceRefUnavailable', { title: snapshotTitle }),
      });
      void decoratePreviewImages();
    } catch {
      // 引用解析失败时保留正文，但不允许未经归属校验的链接直接导航。
    }
  }

  async function loadPreview() {
    const noteId = String(props.noteId || '').trim();
    if (!noteId) return;
    const seq = ++requestSeq;
    loading.value = true;
    error.value = false;
    detail.value = {};
    breadcrumb.value = [];
    previewHtml.value = '';
    previewSourceHtml.value = '';
    resolvedResourceRefs.value = [];
    resourceResolveSeq += 1;
    closeResourcePreview();
    closeReferencedFileInlinePreview();
    try {
      const [detailResult, breadcrumbResult] = await Promise.all([
        consumeNoteDetail(user, noteId),
        apiBasePost('/api/note/queryNoteBreadcrumb', { noteId }, { silent: true }).catch(() => null),
      ]);
      if (seq !== requestSeq) return;
      if (detailResult.status !== 200 || !detailResult.data) {
        error.value = true;
        return;
      }
      detail.value = detailResult.data;
      if (Object.prototype.hasOwnProperty.call(detailResult.data, 'isPending')) {
        emit('pendingState', Boolean(detailResult.data.isPending));
      }
      breadcrumb.value = Array.isArray(breadcrumbResult?.data?.items) ? breadcrumbResult.data.items : [];
      if (detailResult.data.type === 'drawing') return;
      const normalizedContent = normalizeNoteContentResourceUrls(String(detailResult.data.content || ''));
      const renderedHtml = await noteContentToHtml(normalizedContent, detailResult.data.type);
      if (seq !== requestSeq) return;
      previewSourceHtml.value = renderedHtml;
      previewHtml.value = presentResourceReferenceChips(renderedHtml, [], {
        unavailableLabel: (snapshotTitle) => t('note.resourceRefUnavailable', { title: snapshotTitle }),
      });
      void resolvePreviewResourceRefs(renderedHtml, seq);
    } catch {
      if (seq === requestSeq) error.value = true;
    } finally {
      if (seq === requestSeq) {
        loading.value = false;
        void decoratePreviewImages();
      }
    }
  }

  watch(() => props.noteId, loadPreview, { immediate: true });
</script>

<style lang="less" scoped>
  .note-readonly-preview {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--card-background);
  }

  .note-readonly-preview__header {
    flex: 0 0 auto;
    min-height: 74px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .note-readonly-preview__drawing {
    min-height: 520px;
    height: min(72vh, 760px);
  }

  .note-readonly-preview__heading {
    min-width: 0;
  }

  .note-readonly-preview__breadcrumb,
  .note-readonly-preview__meta,
  .note-readonly-preview__title-row,
  .note-readonly-preview__actions {
    display: flex;
    align-items: center;
  }

  .note-readonly-preview__breadcrumb {
    min-width: 0;
    gap: 7px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;

    > button {
      min-height: 26px;
      padding: 0;
      border: 0;
      color: var(--desc-color);
      background: transparent;
    }

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-readonly-preview__title-row {
    min-width: 0;
    gap: 10px;
    margin-top: 3px;

    h2 {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      color: var(--text-color);
      font-size: 20px;
      line-height: 28px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .note-readonly-preview__child-count {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .note-readonly-preview__meta {
    flex: 0 0 auto;
    gap: 10px;
    margin-left: 2px;
    color: var(--muted-text-color, var(--desc-color));
    font-size: 11px;
  }

  .note-readonly-preview__mode {
    min-height: 22px;
    padding: 1px 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--resource-note-color, #00a884);
    border-radius: 999px;
    color: var(--resource-note-color, #00a884);
    background: var(--resource-note-soft-bg, #e9f8f4);
    font-weight: 650;
  }

  .note-readonly-preview__actions {
    flex: 0 0 auto;
    gap: 8px;
  }

  .note-readonly-preview__edit {
    min-height: 36px;
    padding: 0 14px;
  }

  .note-readonly-preview__more {
    width: 36px;
    min-width: 36px;
    min-height: 36px;
    padding: 0;
  }

  .note-readonly-preview__scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    padding: 22px clamp(24px, 5vw, 68px) 40px;
  }

  .note-readonly-preview__loading {
    min-height: 100%;
    display: grid;
    place-items: center;
  }

  .note-readonly-preview__article {
    width: min(100%, 780px);
    margin: 0 auto;
    color: var(--text-color);
  }

  .note-readonly-preview__content {
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.85;
    overflow-wrap: anywhere;

    :deep(> :first-child) {
      margin-top: 0;
    }

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
      margin: 1.35em 0 0.55em;
      line-height: 1.42;
    }

    :deep(p),
    :deep(ul),
    :deep(ol),
    :deep(blockquote),
    :deep(pre) {
      margin: 0.8em 0;
    }

    :deep(img) {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }

    :deep(img[data-ln-size]) {
      display: block;
      margin-inline: auto;
    }

    :deep(img[data-ln-size='original']) {
      width: auto;
    }

    :deep(img[data-ln-size='small']) {
      width: 40%;
    }

    :deep(img[data-ln-size='medium']) {
      width: 64%;
    }

    :deep(img[data-ln-size='large']) {
      width: 82%;
    }

    :deep(img[data-ln-size='full']) {
      width: 100%;
    }

    :deep(blockquote) {
      padding: 10px 14px;
      border-left: 3px solid var(--primary-color);
      color: var(--desc-color);
      background: var(--menu-body-bg-color);
    }

    :deep(pre) {
      overflow: auto;
      padding: 14px;
      border-radius: 9px;
      background: var(--menu-body-bg-color);
    }
  }

  .note-readonly-preview__resource-preview {
    min-width: min(300px, calc(90vw - 32px));
    display: grid;
    gap: 14px;
  }

  .note-readonly-preview__resource-summary {
    display: grid;
    gap: 4px;

    strong {
      overflow: hidden;
      color: var(--text-color);
      font-size: 16px;
      line-height: 1.4;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: var(--desc-color, #737782);
      font-size: 13px;
    }
  }

  .note-readonly-preview__resource-status {
    margin: 0;
    color: var(--desc-color, #737782);
    font-size: 13px;
    line-height: 1.5;

    &.is-unavailable {
      color: var(--error-color, #e5484d);
    }
  }

  .note-readonly-preview__resource-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .note-readonly-preview__error,
  .note-readonly-preview__empty {
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
  }
</style>
