<template>
  <div class="recommendation-container">
    <div class="recommendation-title">{{ $t('ai.tip') }}</div>
    <div class="recommendation-list">
      <BButton
        v-for="(item, index) in recommendationItems"
        :key="index"
        class="recommendation-item"
        @click="handleRecommendationClick(item)"
        v-click-log="{ module: 'AI助手', operation: `点击推荐问题【${item}】` }"
      >
        {{ item }}
      </BButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const { t } = useI18n();
  const route = useRoute();

  const emit = defineEmits(['recommendation-click']);

  const recommendationItems = computed(() => {
    const path = route.path;
    if (path.includes('/noteLibrary/')) return [t('ai.myNotes'), t('ai.crossSearch'), t('ai.quickNote')];
    if (path.includes('/cloudSpace')) return [t('ai.storageUsage'), t('ai.crossSearch'), t('ai.trashContent')];
    if (path.includes('/tag/')) return [t('ai.myTags'), t('ai.crossSearch'), t('ai.recentBookmarks')];
    if (path.includes('/workbenches')) return [t('ai.weeklyRecap'), t('ai.growthStatus'), t('ai.recentBookmarks')];
    if (path.includes('/inbox')) return [t('ai.crossSearch'), t('ai.myTags'), t('ai.quickNote')];
    return [t('ai.recentBookmarks'), t('ai.linkHealth'), t('ai.crossSearch')];
  });

  function handleRecommendationClick(item) {
    emit('recommendation-click', item);
  }
</script>

<style scoped lang="less">
  .recommendation-container {
    padding: 0 1rem 0.5rem;
    border-radius: 16px;
  }

  .recommendation-title {
    font-size: 0.875rem;
    color: #10b981;
    font-weight: 600;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .recommendation-title::before {
    content: '🔖';
  }

  .recommendation-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .recommendation-item {
    width: auto;
    height: auto;
    background: var(--background-color);
    padding: 0.5rem 1rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    color: #4b5563;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .recommendation-item:hover {
    color: #10b981;
  }

  [data-theme='night'] .recommendation-item {
    background: var(--background-color);
    color: var(--desc-color);
    &:hover {
      color: var(--text-color);
    }
  }
</style>
