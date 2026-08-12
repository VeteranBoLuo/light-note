<template>
  <div class="rc">
    <div class="rc-head">
      <div class="rc-title"><SvgIcon :src="icon.noteDetail.history" size="18" />{{ t('growth.recapTitle') }}</div>
    </div>

    <div v-if="weekly.length" class="rc-section">
      <div class="rc-sec-head">
        <span class="rc-sec-title"><SvgIcon :src="icon.growth.tenure" size="15" />{{ t('growth.recapRecent') }}</span>
        <span class="rc-sec-sub">{{ t('growth.recapRecentSub') }}</span>
      </div>
      <div class="rc-list">
        <div
          v-for="it in weekly"
          :key="it.type + it.id"
          v-click-log="{ module: '成长', operation: it.type === 'note' ? '打开内容回顾-笔记' : '打开内容回顾-书签' }"
          class="rc-item dom-hover"
          @click="open(it)"
        >
          <span class="rc-item-icon"><SvgIcon :src="itemIcon(it)" size="16" /></span>
          <span class="rc-item-title">{{ it.title }}</span>
          <span class="rc-item-year">{{ dateOf(it.time) }}</span>
          <div v-if="!readOnly" class="rc-item-actions">
            <BButton size="small" @click.stop="updateState(it, 'snooze_7d')">{{ t('growth.recapSnooze') }}</BButton>
            <BButton size="small" @click.stop="updateState(it, 'dismiss')">{{ t('growth.recapDismiss') }}</BButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="onThisDay.length" class="rc-section">
      <div class="rc-sec-head">
        <span class="rc-sec-title"><SvgIcon :src="icon.common.calendar" size="15" />{{ t('growth.recapOnThisDay') }}</span>
        <span class="rc-sec-sub">{{ t('growth.recapOnThisDaySub') }}</span>
      </div>
      <div class="rc-list">
        <div
          v-for="it in onThisDay"
          :key="it.type + it.id"
          class="rc-item dom-hover"
          v-click-log="{ module: '成长', operation: it.type === 'note' ? '打开那年今日-笔记' : '打开那年今日-书签' }"
          @click="open(it)"
        >
          <span class="rc-item-icon"><SvgIcon :src="itemIcon(it)" size="16" /></span>
          <span class="rc-item-title">{{ it.title }}</span>
          <span class="rc-item-year">{{ yearOf(it.time) }}</span>
          <div v-if="!readOnly" class="rc-item-actions">
            <BButton size="small" @click.stop="updateState(it, 'snooze_7d')">{{ t('growth.recapSnooze') }}</BButton>
            <BButton size="small" @click.stop="updateState(it, 'dismiss')">{{ t('growth.recapDismiss') }}</BButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="buried.length" class="rc-section">
      <div class="rc-sec-head">
        <span class="rc-sec-title"><SvgIcon :src="icon.growth.storage" size="15" />{{ t('growth.recapBuried') }}</span>
        <span class="rc-sec-sub">{{ t('growth.recapBuriedSub') }}</span>
      </div>
      <div class="rc-list">
        <div
          v-for="it in buried"
          :key="it.type + it.id"
          class="rc-item dom-hover"
          v-click-log="{ module: '成长', operation: it.type === 'note' ? '打开沉淀回顾-笔记' : '打开沉淀回顾-书签' }"
          @click="open(it)"
        >
          <span class="rc-item-icon"><SvgIcon :src="itemIcon(it)" size="16" /></span>
          <span class="rc-item-title">{{ it.title }}</span>
          <span class="rc-item-year">{{ dateOf(it.time) }}</span>
          <div v-if="!readOnly" class="rc-item-actions">
            <BButton size="small" @click.stop="updateState(it, 'snooze_7d')">{{ t('growth.recapSnooze') }}</BButton>
            <BButton size="small" @click.stop="updateState(it, 'dismiss')">{{ t('growth.recapDismiss') }}</BButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!allItems.length" class="rc-empty">
      <strong>{{ t('growth.recapEmptyTitle') }}</strong>
      <span>{{ t('growth.recapEmptyDesc') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useGrowth, type RecapItem } from '@/composables/useGrowth.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  const { t } = useI18n();
  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const readOnly = computed(() => props.readOnly);
  const router = useRouter();
  const { recap, loadRecap, setRecapState } = useGrowth();

  const weekly = computed(() => recap.value?.weekly || []);
  const onThisDay = computed(() => recap.value?.onThisDay || []);
  const buried = computed(() => recap.value?.buried || []);
  const allItems = computed(() => [...weekly.value, ...onThisDay.value, ...buried.value]);

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
    if (it.type === 'note') {
      router.push('/noteLibrary/' + it.id);
    } else if (it.url) {
      window.open(it.url, '_blank', 'noopener');
    }
  }

  function itemIcon(item: RecapItem) {
    return item.type === 'note' ? icon.resource.note : icon.resource.bookmark;
  }

  async function updateState(item: RecapItem, action: 'snooze_7d' | 'dismiss') {
    if (readOnly.value) return;
    try {
      const response = await setRecapState(item, action);
      if (response?.status === 200 && response.data?.ok) {
        message.success(t(action === 'snooze_7d' ? 'growth.recapSnoozed' : 'growth.recapDismissed'));
        recordOperation({ module: '成长', operation: action === 'snooze_7d' ? '内容回顾稍后提醒' : '内容回顾不再推荐' });
      }
    } catch (error) {
      console.warn('更新内容回顾偏好失败:', error);
      message.error(t('growth.recapStateFailed'));
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
    display: flex;
    align-items: center;
    gap: 7px;
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
    display: inline-flex;
    align-items: center;
    gap: 5px;
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
  .rc-item-actions { display: flex; align-items: center; gap: 4px; opacity: 0; transition: opacity 0.15s; }
  .rc-item:hover .rc-item-actions, .rc-item:focus-within .rc-item-actions { opacity: 1; }
  .rc-item-actions :deep(.b_btn) { min-height: 27px; padding: 2px 7px; font-size: 11px; }
  .rc-empty {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 10px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--primary-color) 5%, transparent);
  }
  .rc-empty strong {
    font-size: 13px;
    color: var(--text-color);
  }
  .rc-empty span {
    font-size: 12px;
    color: var(--desc-color);
  }
  @media (max-width: 640px) {
    .rc-item { flex-wrap: wrap; }
    .rc-item-actions { width: 100%; margin-left: 26px; opacity: 1; }
  }
</style>
