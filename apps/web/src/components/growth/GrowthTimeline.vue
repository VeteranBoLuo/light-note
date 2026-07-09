<template>
  <div class="tl">
    <div class="tl-head">{{ t('growth.dashTimeline') }}</div>
    <div v-if="!items.length" class="tl-empty">{{ t('growth.timelineEmpty') }}</div>
    <div v-else class="tl-list">
      <div v-for="(it, i) in items" :key="i" class="tl-row">
        <span class="tl-dot" :class="`src-${it.source}`"></span>
        <span class="tl-icon">{{ iconOf(it) }}</span>
        <span class="tl-label">
          <span class="tl-kind">{{ labelOf(it) }}</span>
          <span v-if="it.name" class="tl-name">{{ it.name }}</span>
        </span>
        <span v-if="it.amount > 0" class="tl-exp">+{{ it.amount }}</span>
        <span class="tl-time">{{ fmtTime(it.time) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { TimelineItem } from '@/composables/useGrowth.ts';

  defineProps<{ items: TimelineItem[] }>();
  const { t, te, locale } = useI18n();

  const ICONS: Record<string, string> = {
    checkin: '📅',
    bookmark: '🔖',
    note: '📝',
    file: '📁',
    first_own_resource: '✨',
    milestone: '🎖️',
    profile_done: '🧑',
    manual: '🎁',
  };
  function iconOf(it: TimelineItem) {
    return ICONS[it.source] || '⭐';
  }
  function labelOf(it: TimelineItem): string {
    if (it.source === 'milestone') {
      const to = it.meta?.to ?? it.meta?.level;
      const rank = it.meta?.rank ?? it.meta?.name ?? '';
      return t('growth.timelineLevelUp', { level: to, name: rank });
    }
    const key = `growth.timelineSrc.${it.source}`;
    return te(key) ? t(key) : t('growth.timelineSrc.default');
  }
  function fmtTime(ts: string): string {
    if (!ts) return '';
    const d = new Date(String(ts).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(ts);
    const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
    const abs = Math.abs(diffSec);
    try {
      const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
      if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
      if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
    } catch {
      /* ignore */
    }
    return d.toLocaleDateString();
  }
</script>

<style scoped lang="less">
  .tl {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .tl-head {
    font-size: 14px;
    font-weight: 700;
  }
  .tl-empty {
    font-size: 12.5px;
    color: var(--desc-color);
    text-align: center;
    padding: 12px 0;
  }
  .tl-list {
    display: flex;
    flex-direction: column;
  }
  .tl-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 2px;
    font-size: 13px;
  }
  .tl-row + .tl-row {
    border-top: 1px dashed color-mix(in srgb, var(--card-border-color) 30%, transparent);
  }
  .tl-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--card-border-color);
  }
  .tl-dot.src-milestone {
    background: #fb923c;
  }
  .tl-dot.src-checkin {
    background: #22c55e;
  }
  .tl-dot.src-bookmark {
    background: var(--resource-bookmark-color, #615ced);
  }
  .tl-dot.src-note {
    background: var(--resource-note-color, #00a884);
  }
  .tl-dot.src-file {
    background: var(--resource-file-color, #ff8a00);
  }
  .tl-icon {
    flex: 0 0 auto;
    font-size: 15px;
    line-height: 1;
  }
  .tl-label {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
  }
  .tl-kind {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
  }
  .tl-name {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tl-exp {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }
  .tl-time {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--desc-color);
    opacity: 0.85;
    min-width: 52px;
    text-align: right;
  }
</style>
