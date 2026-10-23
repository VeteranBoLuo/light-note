<template>
  <section class="publication-inspector-content" :class="{ 'is-compact': compact, 'is-integrated': integrated }">
    <div class="inspector-toolbar">
      <header class="inspector-heading">
        <span class="inspector-icon" :class="'is-' + item.kind"
          ><SvgIcon :src="icon.resource[item.kind]" size="28"
        /></span>
        <div
          ><h2>{{ item.title }}</h2
          ><div class="inspector-status"
            ><BChip :tone="statusTone" size="small">{{ t('publicResources.' + publication.status) }}</BChip
            ><BChip v-if="changed" tone="pending" size="small">{{ t('publicResources.changed') }}</BChip
            ><BChip v-if="publication.oldVersionPublic" tone="neutral" size="small">{{
              t('publicResources.oldPublic')
            }}</BChip></div
          ></div
        >
      </header>
      <BTabs
        v-if="tabs.length && !compact"
        v-model:active-tab="tab"
        :options="tabs"
        variant="line"
        class="inspector-tabs"
      />
    </div>
    <div class="inspector-reader" v-auto-scrollbar>
      <BLoading v-if="loading" inline loading :title="t('publicResources.loading')" />
      <p v-else-if="error" class="inspector-error" role="alert"
        >{{ t(publicResourceErrorKey(error)) }}
        <BButton @click="error === 'PUBLIC_RESOURCE_VERSION_CONFLICT' ? emit('refresh') : load()">{{
          t('publicResources.batch.refreshState')
        }}</BButton></p
      >
      <template v-else>
        <p v-if="publication.status === 'ai_checking'" class="inspector-hint">{{ t('publicResources.aiWaiting') }}</p>
        <p v-else-if="publication.status === 'pending_review' && publication.aiCompleted" class="inspector-hint">{{
          t('publicResources.aiCompleted')
        }}</p>
        <div v-if="tab === 'records'" class="inspector-records">
          <p class="inspector-hint">{{ t('publicResources.workspace.recordsHint') }}</p>
          <ol
            ><li v-for="revision in detail?.revisions" :key="revision.revision"
              ><strong>{{ revision.title }}</strong>
              <BChip class="inspector-record-status" size="small" tone="neutral">{{
                t(
                  'publicResources.' +
                    (revision.status === 'approved'
                      ? 'workspace.approved'
                      : revision.status === 'pending_review'
                        ? 'pending_review'
                        : revision.status === 'rejected'
                          ? 'rejected'
                          : 'workspace.obsolete'),
                )
              }}</BChip>
              <small
                >{{ t('publicResources.version') }} {{ revision.revision }} ·
                {{ new Date(revision.createdAt).toLocaleString(locale) }}</small
              >
              <p v-if="revision.reason">{{ revision.reason }}</p></li
            ></ol
          >
        </div>
        <p v-else-if="compact && material" class="inspector-excerpt">{{
          material.body || material.description || material.url
        }}</p>
        <template v-else-if="material">
          <p v-if="!compact" class="inspector-hint">{{
            t(draft ? 'publicResources.workspace.previewDraftHint' : 'publicResources.workspace.previewSubmittedHint')
          }}</p>
          <PublicationContent :material="{ ...material, kind: item.kind }" />
        </template>
        <p v-if="item.kind === 'bookmark'" class="inspector-hint">{{ t('publicResources.linkScope') }}</p>
        <p v-if="publication.reason" class="inspector-error"
          >{{ t('publicResources.reason') }}：{{ publication.reason }}</p
        >
        <p v-if="item.sourceUnavailable" class="inspector-error">{{ t('publicResources.sourceUnavailable') }}</p>
        <p v-else-if="previewError" class="inspector-error">{{ t(publicResourceErrorKey(previewError)) }}</p>
        <p
          v-if="integrated && !compact && !item.sourceUnavailable && tab === 'preview' && material"
          class="inspector-hint inspector-note"
          >{{ t('publicResources.noChanges') }}</p
        >
      </template>
    </div>
    <footer
      v-if="!compact && (!integrated || (item.sourceUnavailable && canWithdrawPublication(publication)))"
      class="inspector-footer"
    >
      <p>{{ t('publicResources.noChanges') }}</p>
      <div v-if="!integrated">
        <BButton
          v-if="publication.status !== 'removed' && !item.sourceUnavailable"
          type="primary"
          :disabled="disabled || !!error || !scope.caps.submissionsEnabled"
          @click="emit('submit')"
          >{{
            t(
              publication.publishedRevision
                ? 'publicResources.workspace.submitUpdate'
                : 'publicResources.workspace.submitAgain',
            )
          }}</BButton
        >
        <BButton :disabled="disabled || item.sourceUnavailable" @click="emit('source')">{{
          t('publicResources.openSource')
        }}</BButton>
        <BButton
          v-if="canWithdrawPublication(publication)"
          type="danger"
          :disabled="disabled || !!error"
          @click="emit('withdraw')"
          >{{
            t(
              publication.publishedRevision
                ? 'publicResources.workspace.cancelPublic'
                : 'publicResources.workspace.cancelSubmission',
            )
          }}</BButton
        >
      </div>
      <BButton
        v-else-if="item.sourceUnavailable && canWithdrawPublication(publication)"
        type="danger"
        :disabled="disabled || !!error"
        @click="emit('withdraw')"
        >{{
          t(
            publication.publishedRevision
              ? 'publicResources.workspace.cancelPublic'
              : 'publicResources.workspace.cancelSubmission',
          )
        }}</BButton
      >
    </footer>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    canWithdrawPublication,
    type PublicationWorkspaceItem,
    type PublicationPreview,
  } from '@lightnote/shared/public-resources';
  import { publicGet, previewPublication, type PublicationOwnDetail } from '@/api/publicResources';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  import { publicationKey } from '@/composables/usePublicationSelection';
  import { publicResourceErrorKey } from '@/utils/publicResourceErrors';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import PublicationContent from './PublicationContent.vue';
  import icon from '@/config/icon';
  const props = defineProps<{
    item: PublicationWorkspaceItem;
    disabled?: boolean;
    compact?: boolean;
    integrated?: boolean;
  }>();
  const emit = defineEmits<{
    submit: [];
    source: [];
    withdraw: [];
    changed: [key: string, changed: boolean | null];
    refresh: [];
    material: [key: string, fingerprint: string];
  }>();
  const { t, locale } = useI18n(),
    scope = usePublicResourceScope();
  const publication = computed(() => props.item.publication!);
  const detail = ref<PublicationOwnDetail | null>(null),
    loading = ref(false),
    error = ref(''),
    previewError = ref(''),
    changed = ref<boolean | null>(null),
    tab = ref('preview'),
    draft = ref<PublicationPreview | null>(null);
  let controller: AbortController | undefined;
  let generation = 0;
  const published = computed(() =>
    detail.value?.revisions.find((r) => r.revision === publication.value.publishedRevision),
  );
  const latest = computed(() => detail.value?.revisions.find((r) => r.revision === publication.value.latestRevision));
  const material = computed(() => draft.value || latest.value || published.value);
  const tabs = computed(() => [
    ...(material.value ? [{ key: 'preview', label: t('publicResources.workspace.preview') }] : []),
    ...(detail.value?.revisions.length ? [{ key: 'records', label: t('publicResources.workspace.records') }] : []),
  ]);
  const statusTone = computed(() =>
    publication.value.status === 'published'
      ? ('success' as const)
      : ['removed', 'rejected'].includes(publication.value.status)
        ? ('danger' as const)
        : ('neutral' as const),
  );
  async function load() {
    const current = ++generation,
      identity = scope.identity,
      item = props.item,
      key = publicationKey(item),
      p = item.publication!;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    detail.value = null;
    draft.value = null;
    error.value = '';
    previewError.value = '';
    changed.value = null;
    try {
      const data = await publicGet<PublicationOwnDetail>('own/' + p.publicId, {}, request.signal);
      if (current !== generation || identity !== scope.identity) return;
      if (data.version !== p.version) {
        error.value = 'PUBLIC_RESOURCE_VERSION_CONFLICT';
        return;
      }
      detail.value = data;
      tab.value = 'preview';
      if (!item.sourceUnavailable && p.status !== 'removed' && scope.caps.submissionsEnabled) {
        try {
          const preview = await previewPublication(item.kind, item.sourceId, request.signal);
          if (current !== generation || identity !== scope.identity) return;
          draft.value = preview;
          emit('material', key, preview.fingerprint);
          const baseline = data.revisions.find((r) => r.revision === (p.publishedRevision || p.latestRevision));
          changed.value = baseline?.fingerprint ? preview.fingerprint !== baseline.fingerprint : null;
          emit('changed', key, changed.value);
        } catch (e) {
          if (current === generation)
            previewError.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
        }
      }
    } catch (e) {
      if (current === generation) error.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch(
    () => [
      publicationKey(props.item),
      props.item.updatedAt,
      props.item.sourceUnavailable,
      scope.eligible,
      props.item.publication?.version,
      scope.identity,
      scope.caps.submissionsEnabled,
    ],
    load,
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
    draft.value = null;
    detail.value = null;
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .publication-inspector-content {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
  }
  .inspector-toolbar {
    flex-shrink: 0;
  }
  .inspector-heading {
    display: flex;
    align-items: flex-start;
    gap: .ui-space(14px) [];
    padding: .ui-space(24px) [] .ui-space(24px) [] .ui-space(12px) [];
  }
  .inspector-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: .ui-control(48px) [];
    height: .ui-control(48px) [];
    flex-shrink: 0;
    border-radius: .ui-space(12px) [];
  }
  .is-note {
    color: var(--resource-note-color);
    background: var(--workspace-note-selected);
  }
  .is-bookmark {
    color: var(--resource-bookmark-color);
    background: var(--workspace-purple-selected);
  }
  .inspector-heading > div {
    flex: 1;
    min-width: 0;
  }
  .inspector-heading h2 {
    font-size: .ui-font(20px) [];
    line-height: 1.5;
    overflow-wrap: anywhere;
    margin: 0 0 .ui-space(8px) [];
  }
  .inspector-status {
    display: flex;
    flex-wrap: wrap;
    gap: .ui-space(6px) [];
  }
  .inspector-tabs {
    margin-inline: .ui-space(24px) [];
  }
  .inspector-reader {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: .ui-space(20px) [] .ui-space(24px) [];
  }
  .inspector-hint {
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
    line-height: 1.7;
  }
  .inspector-error {
    font-size: .ui-font(13px) [];
    color: var(--warning-color);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .inspector-footer {
    border-top: 1px solid var(--workspace-divider);
    padding: .ui-space(16px) [] .ui-space(24px) [];
  }
  .inspector-footer > p {
    margin: 0 0 .ui-space(10px) [];
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
    line-height: 1.5;
  }
  .inspector-footer > div {
    display: flex;
    justify-content: flex-end;
    gap: .ui-space(8px) [];
    flex-wrap: wrap;
  }
  .is-integrated .inspector-heading h2 {
    display: none;
  }
  .is-integrated .inspector-icon {
    display: none;
  }
  .is-integrated:not(.is-compact) {
    flex: 1;
    height: auto;
  }
  .is-integrated .inspector-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: .ui-space(8px) [];
    padding: 0 .ui-space(20px) [];
    border-bottom: 1px solid var(--workspace-divider);
  }
  .is-integrated .inspector-heading {
    order: 1;
    margin-left: auto;
    min-width: 0;
    padding: .ui-space(6px) [] 0;
  }
  .is-integrated .inspector-tabs {
    order: 0;
    flex-shrink: 0;
    margin: 0;
    padding: .ui-space(6px) [] 0;
    border-bottom: 0;
  }
  .is-integrated .inspector-reader {
    padding: .ui-space(12px) [] .ui-space(20px) [];
  }
  .is-integrated .inspector-footer {
    flex-shrink: 0;
    padding: .ui-space(8px) [] .ui-space(20px) [];
  }
  .is-integrated .inspector-reader > .inspector-hint:not(.inspector-note) {
    margin: 0 0 .ui-space(8px) [];
  }
  .inspector-note {
    margin: .ui-space(16px) [] 0 0;
  }
  .is-integrated .inspector-reader :deep(.publication-content) {
    max-width: .ui-layout(740px) [];
    margin: 0 auto;
  }
  .is-integrated .inspector-reader :deep(.publication-content h2) {
    font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', serif;
    font-size: .ui-font(30px) [];
  }
  .is-integrated .inspector-reader :deep(.publication-content__text) {
    line-height: 2;
  }
  .inspector-records ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .inspector-records li {
    overflow-wrap: anywhere;
    padding: .ui-space(16px) [] 0;
    border-bottom: 1px solid var(--workspace-divider);
    font-size: .ui-font(14px) [];
  }
  .inspector-records small {
    display: block;
    margin-top: .ui-space(8px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .inspector-record-status {
    margin-inline-start: .ui-space(8px) [];
  }
  .inspector-records p {
    color: var(--warning-color);
    line-height: 1.7;
  }
  .is-compact {
    height: auto;
  }
  .is-compact .inspector-toolbar {
    display: none;
  }
  .is-compact .inspector-heading {
    display: none;
  }
  .is-compact .inspector-reader {
    overflow: hidden;
    flex: initial;
    padding: 0 .ui-space(16px) [] .ui-space(12px) [];
  }
  .is-compact .inspector-hint,
  .is-compact .inspector-error {
    margin: .ui-space(4px) [] 0;
  }
  .inspector-excerpt {
    font-size: .ui-font(13px) [];
    color: var(--desc-color);
    line-height: 1.7;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 767px) {
    .is-integrated .inspector-toolbar {
      padding-inline: .ui-space(16px) [];
    }
    .is-integrated .inspector-reader {
      padding: .ui-space(12px) [] .ui-space(16px) [];
    }
    .is-integrated .inspector-reader :deep(.publication-content h2) {
      font-size: .ui-font(24px) [];
    }
    .inspector-heading,
    .inspector-reader {
      padding: .ui-space(16px) [];
    }
    .inspector-tabs {
      margin-inline: .ui-space(16px) [];
    }
    .inspector-footer {
      padding: .ui-space(16px) [] .ui-space(16px) [] max(.ui-space(16px) [], env(safe-area-inset-bottom));
    }
    .inspector-footer > div {
      justify-content: flex-start;
    }
    .inspector-footer .b_btn {
      min-height: .ui-control(44px) [];
      height: auto;
      white-space: normal;
      line-height: 1.5;
    }
  }
</style>
