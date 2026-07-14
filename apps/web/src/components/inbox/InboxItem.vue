<template>
  <article :class="['inbox-item', `inbox-item--${item.resourceType}`]">
    <BCheckbox :model-value="selected" @update:model-value="$emit('select', $event)" />
    <div class="inbox-item__body" @click="$emit('open')">
      <div class="inbox-item__meta">
        <span class="inbox-item__type">{{ t(`inbox.${item.resourceType}`) }}</span>
        <span>{{ formatTime(item.collectedAt) }}</span>
      </div>
      <h3 :title="item.title">{{ item.title || t('inbox.untitled') }}</h3>
      <p v-if="plainSummary">{{ plainSummary }}</p>
      <span v-if="item.resourceType === 'bookmark'" class="inbox-item__detail">{{ item.detail }}</span>
    </div>
    <div class="inbox-item__actions">
      <BButton size="small" @click="$emit('open')">{{ t('inbox.openResource') }}</BButton>
      <BButton size="small" type="primary" :loading="completing" @click="$emit('complete')">
        {{ t('inbox.complete') }}
      </BButton>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import type { InboxItem } from '@/api/inboxApi';

  const props = defineProps<{ item: InboxItem; selected: boolean; completing?: boolean }>();
  defineEmits<{ select: [selected: boolean]; open: []; complete: [] }>();
  const { t, locale } = useI18n();
  const plainSummary = computed(() => {
    const node = document.createElement('div');
    node.innerHTML = props.item.summary || '';
    return (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  });
  const formatTime = (value: string) =>
    value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
</script>

<style scoped lang="less">
  .inbox-item {
    --type-color: #615ced;
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px;
    padding: 16px; border: 1px solid var(--card-border-color); border-left: 3px solid var(--type-color);
    border-radius: 10px; background: var(--background-color); transition: box-shadow .2s, transform .2s;
  }
  .inbox-item:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, .08); transform: translateY(-1px); }
  .inbox-item--note { --type-color: #2ecc71; }
  .inbox-item--file { --type-color: #f39c12; }
  .inbox-item__body { min-width: 0; cursor: pointer; }
  .inbox-item__meta { display: flex; gap: 8px; align-items: center; color: var(--desc-color); font-size: 12px; }
  .inbox-item__type { color: var(--type-color); font-weight: 600; }
  h3 { margin: 6px 0 4px; color: var(--text-color); font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p { margin: 0; color: var(--desc-color); font-size: 13px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .inbox-item__detail { display: block; margin-top: 5px; color: var(--desc-color); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inbox-item__actions { display: flex; gap: 8px; }
  @media (max-width: 767px) {
    .inbox-item { grid-template-columns: auto minmax(0, 1fr); align-items: start; padding: 13px; }
    .inbox-item__actions { grid-column: 2; justify-content: flex-end; }
  }
</style>
