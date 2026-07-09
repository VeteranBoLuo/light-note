<template>
  <BModal :visible="visible" :show-footer="false" width="440px" :mask-closable="true" @update:visible="emit('update:visible', $event)">
    <div class="wr">
      <div class="wr-head">
        <span class="wr-emoji">📊</span>
        <div class="wr-head-text">
          <div class="wr-title">{{ t('growth.weeklyReportTitle') }}</div>
          <div class="wr-sub">{{ report?.generatedAt || '' }} · {{ t('growth.weeklyReportSub') }}</div>
        </div>
      </div>

      <div v-if="report" class="wr-grid">
        <div class="wr-cell wr-cell--hl">
          <b>+{{ report.exp }}</b>
          <span>{{ t('growth.wrExp') }}</span>
        </div>
        <div class="wr-cell">
          <b>{{ report.checkinDays }}</b>
          <span>{{ t('growth.wrCheckin') }}</span>
        </div>
        <div class="wr-cell wr-cell--lv">
          <b>Lv.{{ report.level }}</b>
          <span>{{ report.levelName }}</span>
        </div>
        <div class="wr-cell">
          <b>{{ report.bookmarks }}</b>
          <span>{{ t('growth.wrBookmark') }}</span>
        </div>
        <div class="wr-cell">
          <b>{{ report.notes }}</b>
          <span>{{ t('growth.wrNote') }}</span>
        </div>
        <div class="wr-cell">
          <b>{{ report.files }}</b>
          <span>{{ t('growth.wrFile') }}</span>
        </div>
      </div>

      <div class="wr-foot">{{ summary }}</div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  const props = defineProps<{ visible: boolean; report: any }>();
  const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();
  const { t } = useI18n();

  const summary = computed(() => {
    const r = props.report;
    if (!r) return '';
    const total = (r.bookmarks || 0) + (r.notes || 0) + (r.files || 0);
    if (total === 0 && !r.exp && !r.checkinDays) return t('growth.wrEmpty');
    return t('growth.wrSummary', { n: total, exp: r.exp });
  });
</script>

<style scoped lang="less">
  .wr {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 4px 2px;
  }
  .wr-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .wr-emoji {
    font-size: 34px;
    line-height: 1;
  }
  .wr-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-color);
  }
  .wr-sub {
    font-size: 12px;
    color: var(--desc-color);
    margin-top: 2px;
  }
  .wr-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .wr-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .wr-cell b {
    font-size: 22px;
    font-weight: 700;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .wr-cell span {
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .wr-cell--hl {
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 16%, transparent), color-mix(in srgb, var(--primary-color) 6%, transparent));
    border-color: color-mix(in srgb, var(--primary-color) 35%, transparent);
  }
  .wr-cell--hl b {
    color: var(--primary-color);
  }
  .wr-cell--lv b {
    background: linear-gradient(135deg, #f43f5e, #fb923c);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-foot {
    text-align: center;
    font-size: 13px;
    color: var(--desc-color);
    padding: 6px 0 2px;
    line-height: 1.6;
  }
</style>
