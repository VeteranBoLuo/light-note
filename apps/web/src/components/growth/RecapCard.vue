<template>
  <div class="rc">
    <div class="rc-head">
      <div class="rc-title">🕰️ {{ t('growth.recapTitle') }}</div>
    </div>

    <div v-if="onThisDay.length" class="rc-section">
      <div class="rc-sec-head">
        <span class="rc-sec-title">📅 {{ t('growth.recapOnThisDay') }}</span>
        <span class="rc-sec-sub">{{ t('growth.recapOnThisDaySub') }}</span>
      </div>
      <div class="rc-list">
        <div v-for="it in onThisDay" :key="it.type + it.id" class="rc-item dom-hover" @click="open(it)">
          <span class="rc-item-icon">{{ it.type === 'note' ? '📝' : '🔖' }}</span>
          <span class="rc-item-title">{{ it.title }}</span>
          <span class="rc-item-year">{{ yearOf(it.time) }}</span>
        </div>
      </div>
    </div>

    <div v-if="buried.length" class="rc-section">
      <div class="rc-sec-head">
        <span class="rc-sec-title">💤 {{ t('growth.recapBuried') }}</span>
        <span class="rc-sec-sub">{{ t('growth.recapBuriedSub') }}</span>
      </div>
      <div class="rc-list">
        <div v-for="it in buried" :key="it.type + it.id" class="rc-item dom-hover" @click="open(it)">
          <span class="rc-item-icon">{{ it.type === 'note' ? '📝' : '🔖' }}</span>
          <span class="rc-item-title">{{ it.title }}</span>
          <span class="rc-item-year">{{ dateOf(it.time) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useGrowth, type RecapItem } from '@/composables/useGrowth.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const router = useRouter();
  const { recap, loadRecap } = useGrowth();

  const onThisDay = computed(() => recap.value?.onThisDay || []);
  const buried = computed(() => recap.value?.buried || []);

  function yearOf(v: string) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : `${d.getFullYear()}`;
  }
  function dateOf(v: string) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  }

  // 书签:开原链;笔记:进笔记详情
  function open(it: RecapItem) {
    recordOperation({ module: '成长', operation: `回顾点开${it.type === 'note' ? '笔记' : '书签'}「${it.title}」` });
    if (it.type === 'note') {
      router.push('/noteLibrary/' + it.id);
    } else if (it.url) {
      window.open(it.url, '_blank', 'noopener');
    }
  }

  onMounted(() => {
    if (!recap.value) loadRecap();
  });
</script>

<style scoped lang="less">
  .rc {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .rc-title {
    font-size: 16px;
    font-weight: 700;
  }
  .rc-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rc-sec-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rc-sec-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-color);
  }
  .rc-sec-sub {
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .rc-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rc-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .rc-item:hover {
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }
  .rc-item-icon {
    flex: 0 0 auto;
    font-size: 15px;
  }
  .rc-item-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rc-item-year {
    flex: 0 0 auto;
    font-size: 11.5px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>
