<template>
  <div
    class="public-review-panel"
    :class="{ 'is-compact': compact, 'is-manual': !showAssessment, 'is-integrated': integrated }"
  >
    <section class="public-review-material">
      <div class="review-version"
        ><BChip tone="neutral"
          >{{
            t(
              'publicResources.' +
                (report
                  ? 'reportEvidence'
                  : publishedView
                    ? 'publicPreview'
                    : displayRevision > 1
                      ? 'updateSubmission'
                      : 'newSubmission'),
            )
          }}
          · V{{ displayRevision }}</BChip
        ><span>{{ detail.authorName }}</span></div
      >
      <BTabs v-model:active-tab="tab" variant="line" :options="tabs" />
      <template v-if="tab === 'content' && current">
        <p v-if="report" class="review-warning"
          >{{ t('publicResources.reportEvidence') }} · V{{ report.evidence.revision }}<br />{{ report.reason }}</p
        >
        <PublicResourceAiAssessment v-if="integrated" :assessment="assessment" :enabled="showAssessment" />
        <PublicationContent :material="{ ...current, kind: detail.kind }" />
        <p v-if="detail.kind === 'bookmark'" class="review-muted">{{ t('publicResources.linkScope') }}</p>
      </template>
      <div v-else-if="tab === 'compare'" class="review-comparison"
        ><section
          ><h3>{{ t('publicResources.oldVersion') }}</h3
          ><PublicationContent v-if="published" :material="{ ...published, kind: detail.kind }" /><p v-else>{{
            t('publicResources.noPrevious')
          }}</p></section
        ><section
          ><h3>{{ t('publicResources.newVersion') }}</h3
          ><PublicationContent v-if="latest" :material="{ ...latest, kind: detail.kind }" /></section
      ></div>
      <template v-else-if="tab === 'history'"
        ><p v-if="historyError" role="alert"
          >{{ historyError }} <BButton @click="loadHistory(historyPage)">{{ t('publicResources.retry') }}</BButton></p
        ><BLoading :loading="historyLoading"
          ><ol class="review-history"
            ><li v-for="action in actions" :key="action.publicId"
              ><strong>{{ t('publicResources.actions.' + action.action) }}</strong
              ><small>{{ action.actorName }} · {{ formatTime(action.createdAt) }} · V{{ action.revision || '—' }}</small
              ><p v-if="action.reason">{{ action.reason }}</p></li
            ></ol
          ></BLoading
        ><BPagination
          v-if="historyTotal > 20"
          :current="historyPage"
          :page-size="20"
          :total="historyTotal"
          @page-change="loadHistory"
      /></template>
    </section>
    <aside class="public-review-assessment">
      <PublicResourceAiAssessment v-if="!integrated" :assessment="assessment" :enabled="showAssessment" />
      <p v-if="detail.reason" class="review-warning">{{ detail.reason }}</p>
      <div class="review-actions">
        <template v-if="report"
          ><BButton :disabled="busy || report.status !== 'pending'" @click="emit('decision', 'dismiss')">{{
            t('publicResources.dismiss')
          }}</BButton
          ><BButton
            type="danger"
            :disabled="busy || report.status !== 'pending'"
            @click="emit('decision', 'removeReport')"
            >{{ t('publicResources.remove') }}</BButton
          ></template
        >
        <template v-else-if="!publishedView && detail.hasPending && !detail.removed && !detail.withdrawn"
          ><BButton type="primary" :disabled="busy" @click="emit('decision', 'approve')">{{
            t('publicResources.approve')
          }}</BButton
          ><BButton :disabled="busy" @click="emit('decision', 'reject')">{{
            t('publicResources.reject')
          }}</BButton></template
        >
        <BButton
          v-if="!report && detail.publishedRevision && !detail.removed && !detail.withdrawn"
          type="danger"
          :disabled="busy"
          @click="emit('decision', 'remove')"
          >{{ t('publicResources.remove') }}</BButton
        >
        <BButton v-if="!report && detail.removed" :disabled="busy" @click="emit('decision', 'unlock')">{{
          t('publicResources.unlock')
        }}</BButton>
      </div>
    </aside>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    publicGet,
    type ModerationDetail,
    type ModerationAction,
    type PublicReport,
    type PublicPage,
  } from '@/api/publicResources';
  import PublicationContent from './PublicationContent.vue';
  import PublicResourceAiAssessment from './PublicResourceAiAssessment.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  const props = defineProps<{
      detail: ModerationDetail;
      report?: PublicReport | null;
      busy?: boolean;
      compact?: boolean;
      aiEnabled?: boolean;
      publishedView?: boolean;
      integrated?: boolean;
    }>(),
    emit = defineEmits<{ decision: [action: string] }>(),
    { t, locale } = useI18n();
  const tab = ref('content'),
    actions = ref<ModerationAction[]>([]),
    historyPage = ref(1),
    historyTotal = ref(0),
    historyLoading = ref(false),
    historyError = ref('');
  let historyGeneration = 0;
  const latest = computed(() => props.detail.revisions.find((r) => r.revision === props.detail.latestRevision)),
    published = computed(() => props.detail.revisions.find((r) => r.revision === props.detail.publishedRevision)),
    current = computed(() => props.report?.evidence || (props.publishedView ? published.value : latest.value));
  const displayRevision = computed(() => current.value?.revision || props.detail.latestRevision);
  const assessment = current;
  const showAssessment = computed(() => props.aiEnabled || !!assessment.value?.ai);
  const tabs = computed(() =>
      ['content', 'compare', 'history'].map((key) => ({ key, label: t('publicResources.' + key) })),
    ),
    formatTime = (value: string) => new Date(value).toLocaleString(locale.value);
  async function loadHistory(page = 1) {
    const current = ++historyGeneration;
    historyPage.value = page;
    historyLoading.value = true;
    historyError.value = '';
    try {
      const data = await publicGet<PublicPage<ModerationAction>>('moderation/' + props.detail.publicId + '/history', {
        page,
      });
      if (current === historyGeneration) {
        actions.value = data.items;
        historyTotal.value = data.total;
      }
    } catch {
      if (current === historyGeneration) historyError.value = t('publicResources.error');
    } finally {
      if (current === historyGeneration) historyLoading.value = false;
    }
  }
  watch(
    () => props.detail.publicId,
    () => {
      historyGeneration++;
      tab.value = 'content';
      actions.value = props.detail.actions;
      historyTotal.value = 0;
    },
    { immediate: true },
  );
  watch(tab, (value) => {
    if (value === 'history') void loadHistory(1).catch(() => {});
  });
  onBeforeUnmount(() => {
    historyGeneration++;
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .public-review-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) .ui-layout(260px) [];
    gap: .ui-space(20px) [];
    min-width: 0;
  }
  .public-review-material {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .review-version {
    display: flex;
    gap: .ui-space(8px) [];
    align-items: center;
    margin-bottom: .ui-space(12px) [];
  }
  .public-review-assessment {
    min-width: 0;
    padding-left: .ui-space(20px) [];
    border-left: 1px solid var(--workspace-border);
  }
  h3 {
    margin: .ui-space(12px) [] 0;
    font-size: .ui-font(16px) [];
  }
  h4 {
    font-size: .ui-font(13px) [];
    margin-top: .ui-space(20px) [];
  }
  p {
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .review-muted,
  .review-history small {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .review-warning {
    padding: .ui-space(12px) [];
    border: 1px solid var(--warning-color);
    border-radius: 10px;
    color: var(--warning-color);
  }
  .review-categories,
  .review-actions {
    display: flex;
    gap: .ui-space(8px) [];
    flex-wrap: wrap;
  }
  .review-actions {
    flex-direction: column;
    margin-top: .ui-space(24px) [];
  }
  blockquote {
    margin: .ui-space(12px) [] 0;
    padding: .ui-space(12px) [];
    border-left: 2px solid var(--warning-color);
    background: var(--workspace-canvas);
  }
  blockquote p {
    margin: .ui-space(4px) [] 0;
    white-space: pre-wrap;
  }
  .review-comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: .ui-space(16px) [];
  }
  .review-comparison > section {
    min-width: 0;
  }
  .review-history {
    padding-left: .ui-space(20px) [];
  }
  .review-history li {
    margin-bottom: .ui-space(16px) [];
  }
  .review-history small {
    display: block;
    margin-top: .ui-space(4px) [];
  }
  .is-compact {
    grid-template-columns: minmax(0, 1fr);
  }
  .is-compact .public-review-assessment {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid var(--workspace-border);
  }
  .is-compact .review-comparison {
    grid-template-columns: minmax(0, 1fr);
  }
  .is-manual {
    grid-template-columns: minmax(0, 1fr);
  }
  .is-manual .public-review-assessment {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid var(--workspace-border);
  }
  .is-manual .review-actions {
    flex-direction: row;
    margin-top: .ui-space(16px) [];
  }
  @media (max-width: 767px) {
    .is-compact {
      padding: .ui-space(16px) [];
      box-sizing: border-box;
    }
    .review-actions > .b_btn {
      width: 100%;
      height: .ui-control(44px) [];
      line-height: 1.5;
    }
  }

  .public-review-panel.is-integrated {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 0;
    padding: 0;
  }
  .is-integrated .public-review-material {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: .ui-space(24px) [];
  }
  .is-integrated .public-review-assessment {
    flex-shrink: 0;
    padding: .ui-space(12px) [] .ui-space(20px) [];
    border-left: 0;
    border-top: 1px solid var(--workspace-divider);
  }
  .is-integrated .review-actions {
    flex-direction: row;
    justify-content: flex-end;
    margin: 0;
  }
  .is-integrated .review-actions > .b_btn {
    width: auto;
  }
  .is-integrated :deep(.publication-content) {
    max-width: .ui-layout(740px) [];
    margin: 0 auto;
  }
  .is-integrated :deep(.publication-content h2) {
    font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', serif;
    font-size: .ui-font(28px) [];
  }
  .is-integrated :deep(.publication-content__text) {
    line-height: 2;
  }
  .is-integrated .review-actions > .primary_btn {
    order: 1;
  }
</style>
