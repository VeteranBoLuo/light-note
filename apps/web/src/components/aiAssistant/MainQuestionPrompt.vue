<template>
  <div class="recommendation-container">
    <div class="recommendation-title">{{ $t('ai.tip') }}</div>
    <div class="recommendation-list">
      <div
        v-for="(item, index) in recommendationItems"
        :key="index"
        class="recommendation-item"
        @click="handleRecommendationClick(item)"
        v-click-log="{ module: 'AI助手', operation: `点击推荐问题【${item}】` }"
      >
        {{ item }}
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();

  const emit = defineEmits(['recommendation-click']);

  // 预设问题池:优先展示能直接触发 AI 工具能力的实用问题(检索/洞察/实操),而非纯操作教程。
  const allQuestions = [
    t('ai.aiCapabilities'),
    t('ai.crossSearch'),
    t('ai.recentBookmarks'),
    t('ai.growthStatus'),
    t('ai.summarizeUrl'),
    t('ai.linkHealth'),
    t('ai.storageUsage'),
    t('ai.weeklyRecap'),
    t('ai.myNotes'),
    t('ai.myTags'),
    t('ai.trashContent'),
    t('ai.quickNote'),
  ];

  const recommendationItems = ref<string[]>([]);

  // 随机选择三个问题
  function selectRandomQuestions() {
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    recommendationItems.value = shuffled.slice(0, 3);
  }

  onMounted(() => {
    selectRandomQuestions();
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
    background: white;
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
