<template>
  <div class="recommendation-container">
    <div class="recommendation-title">轻笺小提示</div>
    <div class="recommendation-list">
      <div
        v-for="(item, index) in recommendationItems"
        :key="index"
        class="recommendation-item"
        @click="handleRecommendationClick(item)"
      >
        {{ item }}
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { gt } from '@/utils/global.ts';

  const emit = defineEmits(['recommendation-click']);
  const recommendationItems = ref([gt('ai.howToCreateBookmark'), gt('ai.cloudSpaceUsage'), gt('ai.howToLinkBookmarkAndTag')]);

  function handleRecommendationClick(item) {
    emit('recommendation-click', item);
  }
</script>

<style scoped lang="less">
  .recommendation-container {
    padding: 1.5rem 1.5rem 0.5rem;
    background: var(--menu-container-bg-color);
    border-radius: 16px;
    margin: 0 1.5rem 1rem;
    border: 1px solid #dbeafe;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
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
    background: white;
    padding: 0.5rem 1rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    color: #4b5563;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .recommendation-item:hover {
    background: #f0f9ff;
    color: #10b981;
    border-color: #3b82f6;
  }
</style>
