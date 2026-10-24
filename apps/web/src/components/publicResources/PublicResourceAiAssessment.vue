<template>
  <section class="review-ai-summary">
    <template v-if="enabled">
      <h3>{{ t('publicResources.aiAdvice') }}</h3>
      <template v-if="assessment?.ai"
        ><BChip :tone="assessment.ai.decision === 'pass' ? 'success' : 'pending'">{{
          t(assessment.ai.decision === 'pass' ? 'publicResources.aiPass' : 'publicResources.aiHold')
        }}</BChip
        ><p>{{ assessment.ai.reason }}</p
        ><div class="review-categories"
          ><BChip v-for="category in assessment.ai.categories" :key="category" tone="pending">{{
            t('publicResources.categories.' + category)
          }}</BChip></div
        ><template v-if="assessment.ai.evidence.length"
          ><h4>{{ t('publicResources.aiEvidence') }}</h4
          ><blockquote v-for="(e, index) in assessment.ai.evidence" :key="index"
            ><small>§ {{ e.paragraph }}</small
            ><p>{{ e.quote }}</p></blockquote
          ></template
        ></template
      >
      <p v-else class="review-muted">{{
        t(
          assessment?.aiStatus === 'pending' || assessment?.aiStatus === 'processing'
            ? 'publicResources.aiProcessing'
            : 'publicResources.aiUnavailable',
        )
      }}</p>
      <p v-if="assessment?.aiPolicy" class="review-muted"
        >{{ t('publicResources.policy') }}: {{ assessment.aiPolicy }}<br />{{
          assessment.aiFinishedAt ? formatTime(assessment.aiFinishedAt) : ''
        }}</p
      >
    </template>

    <p v-if="!enabled" class="review-muted">{{ t('publicResources.flow.aiNotRun') }}</p></section
  >
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { PublicationRevision } from '@/api/publicResources';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  defineProps<{ assessment?: PublicationRevision; enabled?: boolean }>();
  const { t, locale } = useI18n();
  const formatTime = (value: string) => new Date(value).toLocaleString(locale.value);
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .review-ai-summary {
    padding: .ui-space(12px) [];
    border: 1px solid var(--workspace-divider);
    border-radius: 10px;
    margin-bottom: .ui-space(20px) [];
    background: var(--workspace-canvas);
    font-size: .ui-font(12px) [];
  }
  h3 {
    font-size: .ui-font(13px) [];
    margin: 0 0 .ui-space(8px) [];
  }
  h4 {
    font-size: .ui-font(12px) [];
    margin: .ui-space(10px) [] 0;
  }
  p {
    margin: .ui-space(8px) [] 0;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .review-muted {
    color: var(--desc-color);
  }
  .review-categories {
    display: flex;
    flex-wrap: wrap;
    gap: .ui-space(6px) [];
  }
  blockquote {
    margin: .ui-space(10px) [] 0 0;
    padding-left: .ui-space(12px) [];
    border-left: 2px solid var(--warning-color);
  }
  blockquote p {
    white-space: pre-wrap;
  }
</style>
