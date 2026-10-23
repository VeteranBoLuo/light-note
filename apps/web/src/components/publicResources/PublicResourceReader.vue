<template>
  <section
    class="public-resource-reader"
    :class="[embedded ? 'is-embedded' : 'is-page', { 'has-resource': !!resource }]"
    :aria-busy="loading"
    :style="readerStyle"
  >
    <div class="public-reader-paper">
      <div v-if="loading" class="public-reader-loading">
        <BLoading inline loading :title="t('publicResources.loading')" />
      </div>
      <div v-else-if="loadError" class="public-reader-message" role="alert">
        <h1 v-if="!embedded">{{
          t('publicResources.detail.' + (loadError === 'unavailable' ? 'unavailableTitle' : 'loadFailed'))
        }}</h1>
        <p>{{ t(loadError === 'unavailable' ? 'publicResources.unavailable' : 'publicResources.detail.loadError') }}</p>
        <div class="public-reader-message-actions">
          <BButton v-if="loadError !== 'unavailable' || embedded" @click="load">{{
            t('publicResources.retry')
          }}</BButton>
          <BButton v-if="!embedded" @click="emit('back')">{{ t('publicResources.detail.backSource') }}</BButton>
        </div>
      </div>
      <template v-else-if="resource">
        <template v-if="embedded">
          <div class="public-reader-identity">
            <BChip tone="neutral">{{ t('publicResources.public') }}</BChip
            ><span>{{ resource.author.name }}</span>
            <small
              >{{ t('publicResources.publishedAt', { time: formatTime(resource.publishedAt) }) }} · V{{
                resource.revision
              }}</small
            >
          </div>
          <PublicationContent :material="resource" />
          <p class="public-reader-hint">{{ t('publicResources.readOnly') }}</p>
          <p v-if="resource.kind === 'bookmark'" class="public-reader-hint">{{ t('publicResources.linkScope') }}</p>
        </template>
        <article v-else class="public-reader-article" :aria-label="resource.title">
          <header class="public-reader-heading">
            <div class="public-reader-eyebrow">
              <span class="public-reader-kind" :class="`is-${resource.kind}`">
                <SvgIcon :src="icon.resource[resource.kind]" size="14" />{{ t('publicResources.' + resource.kind) }}
              </span>
              <span class="public-reader-version-hint">{{ t('publicResources.detail.authorVersion') }}</span>
            </div>
            <h1>{{ resource.title }}</h1>
            <div class="public-reader-byline public-reader-mobile-byline">
              <span class="public-reader-author">
                <span class="public-reader-avatar" aria-hidden="true">{{ authorInitial }}</span
                >{{ resource.author.name }}
              </span>
              <time :datetime="resource.publishedAt">{{
                t('publicResources.publishedAt', { time: formatTime(resource.publishedAt) })
              }}</time>
              <span aria-hidden="true">·</span><span>V{{ resource.revision }}</span>
            </div>
          </header>
          <div class="public-reader-content">
            <a
              v-if="resource.kind === 'bookmark'"
              class="public-reader-url"
              :href="resource.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{{ displayUrl }}</span
              ><SvgIcon :src="icon.noteTree.openPage" size="14" aria-hidden="true" />
            </a>
            <div class="public-reader-text">{{ resource.kind === 'note' ? resource.body : resource.description }}</div>
            <p class="public-reader-guidance">{{
              t(resource.kind === 'bookmark' ? 'publicResources.linkScope' : 'publicResources.detail.noteSnapshot')
            }}</p>
          </div>
        </article>
        <div
          ref="sideRef"
          class="public-reader-side"
          :role="embedded ? undefined : 'complementary'"
          :aria-label="embedded ? undefined : t('publicResources.detail.publicationInfo')"
        >
          <div v-if="!embedded" class="public-reader-publication">
            <p class="public-reader-rail-label">{{ t('publicResources.detail.publicAuthor') }}</p>
            <div class="public-reader-author public-reader-rail-author">
              <span class="public-reader-avatar" aria-hidden="true">{{ authorInitial }}</span>
              <span>{{ resource.author.name }}</span>
            </div>
            <dl class="public-reader-publication-data">
              <dt>{{ t('publicResources.publicTime') }}</dt
              ><dd
                ><time :datetime="resource.publishedAt">{{ formatTime(resource.publishedAt) }}</time></dd
              >
              <dt>{{ t('publicResources.detail.revision') }}</dt
              ><dd>V{{ resource.revision }}</dd>
            </dl>
            <p class="public-reader-confirmed"
              ><SvgIcon class="public-reader-confirmation-icon" :src="icon.organize.check" size="16" />{{
                t('publicResources.detail.authorVersion')
              }}</p
            >
          </div>
          <component
            :is="!embedded && isMobile ? MobileStickyActionBar : 'div'"
            ref="controlsRef"
            v-bind="!embedded && isMobile ? { aboveNavigation: false } : {}"
            class="public-reader-controls"
          >
            <div v-if="saved" class="public-reader-saved" :class="{ 'is-trash': saved.inTrash }" role="status">
              <div>
                <p
                  ><SvgIcon v-if="!saved.inTrash" :src="icon.organize.check" size="16" />{{
                    t(saved.inTrash ? 'publicResources.trashCopy' : 'publicResources.saved')
                  }}</p
                >
                <small v-if="saved.existing && saved.kind === 'bookmark' && !saved.inTrash">{{
                  t('publicResources.detail.existingBookmark')
                }}</small>
              </div>
              <BButton v-if="embedded" @click="openCopy">{{
                t(saved.inTrash ? 'publicResources.openTrash' : 'publicResources.detail.openCopy')
              }}</BButton>
            </div>
            <footer class="public-reader-actions">
              <BButton
                v-if="!saved || embedded"
                class="public-reader-save"
                type="primary"
                :loading="writer.busy.value"
                @click="saveCopy"
              >
                <SvgIcon v-if="!embedded && !isMobile" :src="icon.resource[resource.kind]" size="16" />{{
                  t(resource.kind === 'note' ? 'publicResources.saveNote' : 'publicResources.saveBookmark')
                }}
              </BButton>
              <BButton v-else class="public-reader-copy" type="primary" @click="openCopy">{{
                t(saved.inTrash ? 'publicResources.openTrash' : 'publicResources.detail.openCopy')
              }}</BButton>
              <BButton v-if="embedded" @click="readFull">{{ t('publicResources.read') }}</BButton>
              <a
                v-else-if="resource.kind === 'bookmark'"
                class="public-reader-open-site"
                :href="resource.url"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="t('publicResources.detail.openWebsite')"
                :title="t('publicResources.detail.openWebsite')"
              >
                <span>{{ t('publicResources.detail.openWebsite') }}</span
                ><SvgIcon :src="icon.noteTree.openPage" size="16" aria-hidden="true" />
              </a>
              <BButton
                class="public-reader-report"
                :type="embedded ? undefined : 'text'"
                :disabled="writer.busy.value"
                @click="openReport"
                >{{
                  t(embedded || isMobile ? 'publicResources.report' : 'publicResources.detail.reportResource')
                }}</BButton
              >
            </footer>
            <p v-if="!embedded" class="public-reader-copy-hint">{{ t('publicResources.detail.copyIndependent') }}</p>
            <p v-if="operationError" class="public-reader-error" role="alert">{{ operationError }}</p>
          </component>
        </div>
      </template>
    </div>
    <BModal
      v-model:visible="reportVisible"
      :title="t('publicResources.report')"
      :show-footer="false"
      width="var(--ui-layout-460, 460px)"
      :close-disabled="writer.busy.value"
    >
      <div class="public-report-form"
        ><BInput
          v-model:value="reportReason"
          type="textarea"
          :maxlength="500"
          :placeholder="t('publicResources.reportPlaceholder')"
          :aria-label="t('publicResources.reportReason')"
        /><p v-if="operationError" class="public-reader-error" role="alert">{{ operationError }}</p
        ><BButton type="primary" :disabled="!reportReason.trim()" :loading="writer.busy.value" @click="submitReport">{{
          t('publicResources.reportSubmit')
        }}</BButton></div
      >
    </BModal>
  </section>
</template>
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import type { PublicResourceDetail, PublicResourceSaveResult } from '@lightnote/shared/public-resources';
  import { publicGet } from '@/api/publicResources';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  import { usePublicResourceWrite } from '@/composables/usePublicResourceWrite';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { resolveSearchReturnPath } from '@/utils/searchReturnNavigation';
  import { findVerticalScrollContainer } from '@/utils/scrolling';
  import PublicationContent from './PublicationContent.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  const props = withDefaults(
    defineProps<{ resourceId: string; embedded?: boolean; scrollContainer?: HTMLElement | null }>(),
    { embedded: false, scrollContainer: null },
  );
  const emit = defineEmits<{ back: [] }>();
  const { t, locale } = useI18n(),
    scope = usePublicResourceScope(),
    writer = usePublicResourceWrite(),
    router = useRouter(),
    route = useRoute();
  const resource = ref<PublicResourceDetail | null>(null),
    loading = ref(false),
    loadError = ref<'' | 'unavailable' | 'error'>(''),
    operationError = ref(''),
    saved = ref<PublicResourceSaveResult | null>(null),
    reportVisible = ref(false),
    reportReason = ref('');
  const isMobile = useMobileLayout();
  const controlsRef = ref<HTMLElement | ComponentPublicInstance | null>(null);
  const sideRef = ref<HTMLElement | null>(null);
  const mobileActionsHeight = ref(0);
  const railHeight = ref(0),
    viewportHeight = ref(0);
  const readerStyle = computed(() => {
    if (props.embedded) return undefined;
    if (isMobile.value)
      return mobileActionsHeight.value
        ? { '--public-reader-mobile-actions-height': `${mobileActionsHeight.value}px` }
        : undefined;
    return railHeight.value && viewportHeight.value
      ? {
          '--public-reader-side-height': `${railHeight.value}px`,
          '--public-reader-viewport-height': `${viewportHeight.value}px`,
        }
      : undefined;
  });
  // A tall rail can move up with the page until its bottom actions fit, without a second scroller.
  watch(
    [sideRef, () => props.scrollContainer, isMobile, () => props.embedded],
    ([side, viewport, mobile, embedded], _, onCleanup) => {
      if (!side || !viewport || mobile || embedded) return;
      const measure = () => {
        railHeight.value = side.getBoundingClientRect().height;
        viewportHeight.value = viewport.clientHeight;
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure);
        observer.observe(side);
        observer.observe(viewport);
        onCleanup(() => observer.disconnect());
      }
    },
    { flush: 'post' },
  );
  // The bar can grow after a saved-copy or error response; keep the last paragraph reachable.
  watch(
    [controlsRef, isMobile, () => props.embedded],
    ([control, mobile, embedded], _, onCleanup) => {
      if (!control || !mobile || embedded) return;
      const element = control instanceof HTMLElement ? control : control.$el;
      if (!(element instanceof HTMLElement)) return;
      const measure = () => {
        const height = element.getBoundingClientRect().height;
        if (height === mobileActionsHeight.value) return;
        const viewport = findVerticalScrollContainer(element);
        const scrollTop = viewport?.scrollTop || 0;
        const atEnd = viewport && viewport.scrollHeight - viewport.clientHeight - scrollTop <= 1;
        mobileActionsHeight.value = height;
        if (atEnd)
          void nextTick(() => {
            if (element.isConnected && isMobile.value && Math.abs(viewport.scrollTop - scrollTop) <= 1) {
              viewport.scrollTop = viewport.scrollHeight;
            }
          });
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        onCleanup(() => observer.disconnect());
      }
    },
    { flush: 'post' },
  );
  let generation = 0,
    controller: AbortController | null = null,
    savedRevision: number | null = null;
  const authorInitial = computed(() => Array.from(resource.value?.author.name.trim() || '')[0] || '');
  const displayUrl = computed(() => resource.value?.url?.replace(/^https?:\/\//i, '') || '');
  const formatTime = (value: string) => new Date(value).toLocaleDateString(locale.value);
  async function load() {
    if (!scope.eligible) return;
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    resource.value = null;
    loadError.value = '';
    operationError.value = '';
    reportVisible.value = false;
    reportReason.value = '';
    loading.value = true;
    try {
      const result = await publicGet<PublicResourceDetail>(encodeURIComponent(props.resourceId), {}, controller.signal);
      if (current !== generation) return;
      resource.value = result;
      if (savedRevision !== result.revision) saved.value = null;
      return result;
    } catch (error) {
      if (current === generation) {
        const status = (error as { status?: number })?.status;
        loadError.value = status === 404 || status === 403 ? 'unavailable' : 'error';
      }
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  async function saveCopy() {
    const current = resource.value;
    if (!current || writer.busy.value) return;
    const viewGeneration = generation;
    operationError.value = '';
    try {
      const result = await writer.execute<PublicResourceSaveResult>(current.publicId + '/save', {
        expectedVersion: current.version,
      });
      if (viewGeneration !== generation) return;
      saved.value = result;
      savedRevision = current.revision;
      message.success(t(saved.value.inTrash ? 'publicResources.trashCopy' : 'publicResources.saved'));
    } catch (e) {
      if (viewGeneration !== generation) return;
      await handleOperationFailure(e);
    }
  }
  async function handleOperationFailure(error: unknown) {
    const failure = error as { code?: string; status?: number };
    const versionChanged = failure?.code === 'PUBLIC_RESOURCE_VERSION_CONFLICT';
    if (versionChanged || [401, 403, 404].includes(failure?.status || 0)) {
      // Revalidate instead of leaving a withdrawn snapshot or retrying a report against a different revision.
      if (await load())
        operationError.value = t(versionChanged ? 'publicResources.detail.refreshedState' : 'publicResources.error');
    } else operationError.value = t('publicResources.error');
  }
  function openCopy() {
    if (!saved.value) return;
    if (saved.value.inTrash) {
      void router.push('/trash');
      return;
    }
    void router.push(
      saved.value.kind === 'note'
        ? '/noteLibrary/' + saved.value.id
        : { path: '/home', query: { locate: saved.value.id } },
    );
  }
  function readFull() {
    const from = resolveSearchReturnPath(route.fullPath) || resolveSearchReturnPath(route.query.from);
    void router.push({ path: '/public-resources/' + props.resourceId, query: from ? { from } : {} });
  }
  function openReport() {
    operationError.value = '';
    reportVisible.value = true;
  }
  async function submitReport() {
    if (!resource.value || !reportReason.value.trim() || writer.busy.value) return;
    const viewGeneration = generation;
    operationError.value = '';
    try {
      await writer.execute(resource.value.publicId + '/report', {
        revision: resource.value.revision,
        reason: reportReason.value.trim(),
      });
      if (viewGeneration !== generation) return;
      reportVisible.value = false;
      reportReason.value = '';
      message.success(t('publicResources.reportSent'));
    } catch (e) {
      if (viewGeneration !== generation) return;
      await handleOperationFailure(e);
    }
  }
  watch(
    [() => props.resourceId, () => scope.identity],
    () => {
      generation++;
      controller?.abort();
      resource.value = null;
      saved.value = null;
      savedRevision = null;
      reportVisible.value = false;
      reportReason.value = '';
      operationError.value = '';
      loading.value = false;
      loadError.value = '';
      if (scope.eligible) void load();
      else loadError.value = 'unavailable';
    },
    { immediate: true, flush: 'sync' },
  );
  useForegroundRefresh({ staleMs: 0, canRefresh: () => scope.eligible && !writer.busy.value, refresh: load });
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
    resource.value = null;
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .public-resource-reader {
    min-width: 0;
    color: var(--text-color);
  }
  .public-reader-paper {
    min-width: 0;
  }
  .is-embedded .public-reader-paper {
    display: flex;
    flex-direction: column;
    gap: .ui-space(20px) [];
  }
  .public-reader-identity {
    display: flex;
    align-items: center;
    gap: .ui-space(8px) [];
    flex-wrap: wrap;
  }
  .public-reader-identity small,
  .public-reader-hint {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.65;
  }
  .public-reader-actions {
    display: flex;
    flex-direction: column;
    gap: .ui-space(8px) [];
  }
  .is-embedded .public-reader-actions > .b_btn {
    width: 100%;
  }
  .is-embedded .public-reader-saved {
    margin-bottom: .ui-space(16px) [];
  }
  .public-reader-saved p {
    display: flex;
    align-items: center;
    gap: .ui-space(6px) [];
    margin: 0;
    line-height: 1.7;
  }
  .public-reader-saved small {
    display: block;
    margin-top: .ui-space(4px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.8;
  }
  .public-reader-error {
    color: var(--danger-color);
  }
  .public-reader-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: .ui-space(24px) [];
    color: var(--desc-color);
  }
  .public-reader-message h1 {
    margin: 0 0 .ui-space(12px) [];
    color: var(--text-color);
    font-size: .ui-font(22px) [];
    line-height: 1.5;
  }
  .public-reader-message p {
    margin: 0 0 .ui-space(24px) [];
    font-size: .ui-font(14px) [];
    line-height: 1.8;
  }
  .public-reader-message-actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: .ui-space(12px) [];
  }

  .is-page .public-reader-paper {
    display: grid;
    grid-template-columns: minmax(0, 1fr) .ui-layout(248px) [];
    gap: .ui-space(64px) [];
    align-items: start;
  }
  .is-page .public-reader-loading,
  .is-page .public-reader-message {
    grid-column: 1 / -1;
    min-height: .ui-layout(320px) [];
    box-sizing: border-box;
    justify-content: center;
  }
  .public-reader-article {
    min-width: 0;
  }
  .public-reader-heading {
    padding-top: .ui-space(5px) [];
  }
  .public-reader-eyebrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .ui-space(8px) [];
    margin-bottom: .ui-space(14px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.7;
  }
  .public-reader-kind {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(6px) [];
    color: var(--workspace-note-text);
    font-weight: 600;
  }
  .public-reader-kind.is-bookmark {
    color: var(--workspace-purple-text);
  }
  .public-reader-version-hint {
    padding-left: .ui-space(12px) [];
    margin-left: .ui-space(3px) [];
    border-left: 1px solid var(--workspace-border);
  }
  .public-reader-heading h1 {
    margin: 0 0 .ui-space(27px) [];
    color: var(--text-color);
    font-family: 'Songti SC', STSong, 'Noto Serif CJK SC', serif;
    font-size: .ui-font(32px) [];
    font-weight: 700;
    line-height: 1.48;
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }
  .public-reader-byline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(8px) [];
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
    line-height: 1.8;
  }
  .public-reader-mobile-byline {
    display: none;
  }
  .public-reader-author {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(8px) [];
    min-width: 0;
    color: var(--text-color);
    overflow-wrap: anywhere;
  }
  .public-reader-avatar {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: .ui-layout(22px) [];
    height: .ui-layout(22px) [];
    border-radius: 50%;
    color: var(--workspace-note-text);
    background: var(--workspace-note-selected);
    font-size: .ui-font(11px) [];
  }
  .public-reader-url {
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
    box-sizing: border-box;
    min-height: .ui-control(64px) [];
    padding: .ui-space(16px) [] .ui-space(18px) [];
    margin-bottom: .ui-space(26px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    color: var(--text-color);
    font-size: .ui-font(14px) [];
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    line-height: 1.8;
    text-decoration: none;
    > span {
      min-width: 0;
      flex: 1;
      overflow-wrap: anywhere;
    }
  }
  .public-reader-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: .ui-font(16px) [];
    line-height: 2.05;
  }
  .public-reader-guidance {
    margin: .ui-space(30px) [] 0 0;
    padding-top: .ui-space(19px) [];
    border-top: 1px solid var(--workspace-border);
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.9;
  }
  .is-page .public-reader-side {
    position: sticky;
    top: .ui-space(30px) [];
    top: min(
      .ui-space(30px) [],
      calc(var(--public-reader-viewport-height, 100vh) - var(--public-reader-side-height, 0px) - .ui-space(16px) [])
    );
    align-self: start;
    min-width: 0;
    padding: .ui-space(3px) [] 0 0 .ui-space(28px) [];
    border-left: 1px solid var(--workspace-border);
  }
  .public-reader-rail-label {
    margin: 0 0 .ui-space(20px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.7;
  }
  .public-reader-rail-author {
    display: flex;
    gap: .ui-space(12px) [];
    margin-bottom: .ui-space(23px) [];
    font-size: .ui-font(15px) [];
    font-weight: 600;
    .public-reader-avatar {
      width: .ui-layout(42px) [];
      height: .ui-layout(42px) [];
      font-family: 'Songti SC', STSong, serif;
      font-size: .ui-font(19px) [];
      font-weight: 400;
    }
  }
  .public-reader-publication-data {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: .ui-space(11px) [] .ui-space(12px) [];
    margin: 0 0 .ui-space(22px) [];
    font-size: .ui-font(12px) [];
    line-height: 1.7;
    dt {
      color: var(--desc-color);
    }
    dd {
      min-width: 0;
      margin: 0;
      text-align: right;
      overflow-wrap: anywhere;
    }
  }
  .public-reader-confirmed {
    display: flex;
    align-items: flex-start;
    gap: .ui-space(5px) [];
    margin: 0 0 .ui-space(23px) [];
    padding-bottom: .ui-space(22px) [];
    border-bottom: 1px solid var(--workspace-border);
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
    line-height: 1.8;
    .public-reader-confirmation-icon {
      color: var(--workspace-note-text);
      flex-shrink: 0;
    }
  }
  .is-page .public-reader-controls {
    display: flex;
    flex-direction: column;
  }
  .is-page .public-reader-saved {
    margin-bottom: .ui-space(12px) [];
    color: var(--workspace-note-text);
    font-size: .ui-font(13px) [];
    &.is-trash {
      color: var(--text-color);
    }
  }
  .is-page .public-reader-actions {
    display: contents;
    .b_btn,
    .public-reader-open-site {
      order: 1;
      width: 100%;
      height: auto;
      min-height: .ui-control(44px) [];
      padding: .ui-space(11px) [] .ui-space(13px) [];
      border-radius: 8px;
      gap: .ui-space(7px) [];
      font-size: .ui-font(13px) [];
      line-height: 1.5;
      white-space: normal;
    }
    .public-reader-open-site {
      margin-top: .ui-space(9px) [];
    }
    .public-reader-report {
      order: 3;
      justify-content: flex-end;
      padding-inline: 0;
      padding-top: .ui-space(13px) [];
      border-top: 1px solid var(--workspace-border);
      border-radius: 0;
      color: var(--desc-color);
      font-size: .ui-font(12px) [];
    }
  }
  .public-reader-copy-hint {
    order: 2;
    margin: .ui-space(13px) [] 0 .ui-space(20px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.9;
  }
  .public-reader-open-site {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid var(--workspace-border);
    color: var(--text-color);
    text-decoration: none;
  }
  .public-reader-url:focus-visible,
  .public-reader-open-site:focus-visible {
    outline: 2px solid var(--workspace-purple-text);
    outline-offset: -2px;
  }
  @media (hover: hover) and (pointer: fine) {
    .public-reader-url:hover,
    .public-reader-open-site:hover {
      border-color: var(--workspace-purple-text);
      color: var(--workspace-purple-text);
    }
  }
  .is-page .public-reader-error {
    order: 4;
    margin: .ui-space(14px) [] 0 0;
    font-size: .ui-font(13px) [];
    line-height: 1.8;
  }
  @media (min-width: 768px) and (max-width: 1199px) {
    .is-page .public-reader-paper {
      grid-template-columns: minmax(0, 1fr) .ui-layout(220px) [];
      gap: .ui-space(28px) [];
    }
    .is-page .public-reader-side {
      padding-left: .ui-space(22px) [];
    }
  }
  @media (min-width: 768px) and (max-height: 520px) {
    .is-page .public-reader-side {
      position: static;
    }
  }
  @media (max-width: 767px) {
    .is-page.has-resource {
      padding-bottom: calc(
        var(--public-reader-mobile-actions-height, var(--ui-layout-100, 100px)) + .ui-space(20px) []
      );
    }
    .is-page .public-reader-paper {
      display: block;
    }
    .public-reader-heading {
      padding-top: 0;
      h1 {
        font-size: .ui-font(27px) [];
        line-height: 1.55;
        margin-bottom: .ui-space(15px) [];
      }
    }
    .public-reader-eyebrow {
      font-size: .ui-font(11px) [];
      gap: .ui-space(6px) [];
    }
    .public-reader-version-hint {
      margin-left: 0;
      padding-left: .ui-space(8px) [];
    }
    .public-reader-mobile-byline {
      display: flex;
      margin-bottom: .ui-space(28px) [];
    }
    .public-reader-text {
      font-size: .ui-font(15px) [];
    }
    .public-reader-url {
      padding: .ui-space(13px) [] .ui-space(14px) [];
      min-height: .ui-control(58px) [];
      font-size: .ui-font(12px) [];
      margin-bottom: .ui-space(23px) [];
    }
    .public-reader-guidance {
      font-size: .ui-font(11px) [];
      margin-top: .ui-space(29px) [];
      padding-top: .ui-space(16px) [];
    }
    .is-page .public-reader-side {
      display: contents;
    }
    .public-reader-publication,
    .public-reader-copy-hint {
      display: none;
    }
    .is-page .public-reader-controls {
      display: block;
      left: 0;
      right: 0;
      bottom: 0;
      min-height: 0;
      padding: .ui-space(11px) [] .ui-space(20px) [] max(.ui-space(11px) [], env(safe-area-inset-bottom));
      border: 0;
      border-top: 1px solid var(--workspace-border);
      border-radius: 0;
      background: var(--workspace-open-canvas);
      box-shadow: none;
    }
    .is-page .public-reader-actions {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: .ui-space(12px) [];
      .b_btn,
      .public-reader-open-site {
        min-width: 0;
        width: auto;
        min-height: .ui-control(44px) [];
        padding: .ui-space(10px) [] .ui-space(14px) [];
        font-size: .ui-font(13px) [];
      }
      .public-reader-save,
      .public-reader-copy {
        flex: 1;
      }
      .public-reader-report {
        order: 0;
        flex: 0 0 auto;
        padding-inline: .ui-space(2px) [];
        border: 0;
      }
      .public-reader-open-site {
        order: 2;
        flex: 0 0 .ui-control(44px) [];
        margin: 0;
        padding-inline: .ui-space(10px) [];
        span {
          display: none;
        }
      }
    }
    .is-page .public-reader-saved {
      font-size: .ui-font(12px) [];
      margin-bottom: .ui-space(9px) [];
    }
    .is-page .public-reader-error {
      margin-top: .ui-space(9px) [];
      font-size: .ui-font(12px) [];
    }
    .public-reader-message-actions .b_btn,
    .is-embedded .public-reader-actions > .b_btn {
      min-height: .ui-control(44px) [];
      height: auto;
      line-height: 1.5;
    }
  }
  .public-report-form {
    display: flex;
    flex-direction: column;
    gap: .ui-space(16px) [];
  }
</style>
