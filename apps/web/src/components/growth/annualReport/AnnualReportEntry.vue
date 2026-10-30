<template>
  <div v-if="shown" class="annual-entry" :class="{ 'is-unseen': entry.unseen.value }">
    <BButton
      type="text"
      class="annual-entry__main"
      v-click-log="{ module: '年度报告', operation: `打开年度报告-${source}` }"
      @click="open"
    >
      <span class="annual-entry__icon" aria-hidden="true">
        <SvgIcon :src="icon.todoWorkspace.star" size="18" />
      </span>
      <span class="annual-entry__text">
        <b>{{ t('annualReport.entry.rowTitle', { year: entry.year }) }}</b>
        <small>{{ t('annualReport.entry.rowSub') }}</small>
      </span>
      <span class="annual-entry__go">{{ t('annualReport.entry.open') }}</span>
    </BButton>
    <BButton
      v-if="dismissible"
      type="text"
      icon-only
      class="annual-entry__dismiss"
      :aria-label="t('annualReport.entry.dismiss')"
      @click="entry.markSeen"
    >
      <SvgIcon :src="icon.common.close" size="14" />
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useAnnualReportEntry } from '@/composables/useAnnualReportEntry';

  /**
   * 年度报告入口行。「今日」：未看过时显示，可关闭（关闭即记为已读）；
   * 移动成长中心：入口期内一直显示，没看过时带红点。
   */
  const props = withDefaults(defineProps<{ dismissible?: boolean; source: string }>(), { dismissible: true });
  const { t } = useI18n();
  const router = useRouter();
  const entry = useAnnualReportEntry();
  const shown = computed(() => (props.dismissible ? entry.unseen.value : entry.visible.value));

  function open() {
    void router.push(entry.route);
  }
</script>

<style scoped lang="less">
  .annual-entry {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    min-height: var(--ui-layout-56, 56px);
    padding: 0 var(--ui-space-6, 6px) 0 var(--ui-space-14, 14px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    background: var(--workspace-content);
    color: var(--text-color);
  }
  .annual-entry__main.b_btn {
    flex: 1;
    justify-content: flex-start;
    gap: var(--ui-space-12, 12px);
    width: auto;
    min-width: 0;
    height: auto;
    min-height: var(--ui-layout-56, 56px);
    padding: 0;
    background: transparent;
    color: inherit;
    line-height: normal;
    text-align: left;
    white-space: normal;
  }
  .annual-entry__icon {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    border-radius: 10px;
    background: linear-gradient(135deg, #615ced, #45d9ff);
    color: #fff;
  }
  .is-unseen .annual-entry__icon::after {
    position: absolute;
    top: -3px;
    right: -3px;
    width: var(--ui-layout-8, 8px);
    height: var(--ui-layout-8, 8px);
    border-radius: 50%;
    background: #f43f5e;
    box-shadow: 0 0 0 2px var(--workspace-content);
    content: '';
  }
  .annual-entry__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .annual-entry__text b {
    overflow: hidden;
    font-size: var(--ui-font-15, 15px);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .annual-entry__text small {
    margin-top: var(--ui-space-2, 2px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .annual-entry__go {
    flex: 0 0 auto;
    padding: var(--ui-space-10, 10px) var(--ui-space-6, 6px);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-14, 14px);
  }
  .annual-entry__dismiss {
    flex: 0 0 auto;
    width: var(--ui-control-36, 36px);
    height: var(--ui-control-36, 36px);
    color: var(--desc-color);
  }
  .annual-entry__main.b_btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
    border-radius: 10px;
  }
</style>
