<template>
  <BButton v-if="entry" class="campaign-entry" :class="{ 'campaign-entry--row': row }" @click="router.push(path)">
    <SvgIcon :src="icon.support.autumn" size="18" aria-hidden="true" />
    <span>{{ t('autumn.entry') }}</span>
    <span v-if="row" class="campaign-entry__hint">{{ entry.title }}</span>
    <SvgIcon v-if="row" :src="icon.arrow_right" size="16" aria-hidden="true" />
  </BButton>
</template>
<script setup lang="ts">
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { useCampaignEntry } from '@/composables/useCampaignEntry';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineProps<{ row?: boolean }>();
  const { entry, path } = useCampaignEntry();
  const router = useRouter();
  const { t } = useI18n();
</script>
<style scoped>
  .campaign-entry {
    gap: 7px;
    flex-shrink: 0;
    color: var(--primary-color);
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    font-size: 13px;
  }
  .campaign-entry--row {
    width: 100%;
    justify-content: flex-start;
    padding: 12px 14px;
    min-height: 44px;
    height: auto;
  }
  .campaign-entry__hint {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    color: var(--desc-color);
    font-size: 12px;
  }
</style>
