<template>
  <BModal v-model:visible="visible" :title="t('growth.pointsLogTitle')" :show-footer="false" width="420px">
    <div class="plg">
      <div v-if="!loading && !rows.length" class="plg-empty">{{ t('growth.pointsLogEmpty') }}</div>
      <div v-else class="plg-list">
        <div v-for="(r, i) in rows" :key="i" class="plg-row">
          <span class="plg-icon">{{ iconOf(r.reason) }}</span>
          <div class="plg-mid">
            <div class="plg-label">{{ labelOf(r.reason) }}</div>
            <div class="plg-time">{{ fmtTime(r.create_time) }}</div>
          </div>
          <span class="plg-delta" :class="r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'flat'">
            {{ r.delta > 0 ? '+' + r.delta : r.delta < 0 ? r.delta : '·' }}
          </span>
        </div>
      </div>
      <div class="plg-foot">
        <button v-if="rows.length < total" class="plg-more" :disabled="loading" @click="loadMore">
          {{ loading ? '…' : t('growth.pointsLogMore') }}
        </button>
        <span v-else-if="rows.length" class="plg-all">{{ t('growth.pointsLogAll') }}</span>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';

  const { t, te } = useI18n();
  const visible = defineModel<boolean>('visible');

  interface LogRow {
    delta: number;
    reason: string;
    ref: string | null;
    create_time: string;
  }
  const rows = ref<LogRow[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const PAGE = 30;

  const ICONS: Record<string, string> = {
    checkin: '📅',
    quest: '✅',
    streak_milestone: '🏁',
    achievement: '🏆',
    buy: '🛍️',
    lottery_cost: '🎰',
    lottery_win: '🪙',
    lottery_storage: '💾',
    lottery_free: '🎟️',
    weekly: '📆',
    admin: '🛠️',
    storage: '💾',
  };
  // reason 归一:storage:* 前缀归到 storage
  function baseReason(reason: string) {
    return reason.startsWith('storage:') ? 'storage' : reason;
  }
  function iconOf(reason: string) {
    return ICONS[baseReason(reason)] || '•';
  }
  function labelOf(reason: string) {
    const k = 'growth.pointsReason.' + baseReason(reason);
    return te(k) ? t(k) : reason;
  }
  // 本地时区格式化(勿用 toISOString,见 date-tz 约定)
  function fmtTime(v: string) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v || '');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function fetchPage(reset = false) {
    if (loading.value) return;
    loading.value = true;
    try {
      const offset = reset ? 0 : rows.value.length;
      const res = await growthApi.getPointsLog(PAGE, offset);
      if (res?.status === 200 && res.data) {
        const list = (res.data.rows || []) as LogRow[];
        rows.value = reset ? list : [...rows.value, ...list];
        total.value = res.data.total || 0;
      }
    } catch (err) {
      console.warn('加载积分明细失败:', err);
    } finally {
      loading.value = false;
    }
  }
  function loadMore() {
    fetchPage(false);
  }

  // 打开时拉第一页
  watch(visible, (v) => {
    if (v) {
      rows.value = [];
      total.value = 0;
      fetchPage(true);
    }
  });
</script>

<style scoped lang="less">
  .plg {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 4px 2px;
  }
  .plg-empty {
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
    padding: 30px 10px;
  }
  .plg-list {
    display: flex;
    flex-direction: column;
  }
  .plg-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 30%, transparent);
  }
  .plg-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
    flex: 0 0 auto;
  }
  .plg-mid {
    flex: 1 1 auto;
    min-width: 0;
  }
  .plg-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }
  .plg-time {
    font-size: 11px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .plg-delta {
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }
  .plg-delta.up {
    color: #16a34a;
  }
  .plg-delta.down {
    color: #dc2626;
  }
  .plg-delta.flat {
    color: var(--desc-color);
  }
  .plg-foot {
    text-align: center;
    padding: 6px 0 2px;
  }
  .plg-more {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent);
    border-radius: 999px;
    color: var(--text-color);
    font-size: 12px;
    padding: 5px 18px;
    cursor: pointer;
  }
  .plg-more:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .plg-all {
    font-size: 11px;
    color: var(--desc-color);
  }
</style>
