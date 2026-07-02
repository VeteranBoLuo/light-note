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

  // 「问我的库」类问题:直接检索/总结用户自己存的书签/笔记/文件,是轻笺智域最高价值的用法,优先展示
  const myLibraryQuestions = [
    t('ai.savedAbout'),
    t('ai.crossSearch'),
    t('ai.recentBookmarks'),
    t('ai.myBookmarks'),
    t('ai.myNotes'),
    t('ai.myTags'),
    t('ai.trashContent'),
    t('ai.storageUsage'),
  ];

  // 「怎么用」类帮助问题:次要
  const helpQuestions = [
    t('ai.howToCreateBookmark'),
    t('ai.cloudSpaceUsage'),
    t('ai.howToCreateTag'),
    t('ai.howToManageBookmarks'),
    t('ai.howToEditNote'),
    t('ai.howToImportExportBookmarks'),
    t('ai.bookmarkTagUsage'),
  ];

  const recommendationItems = ref<string[]>([]);

  const pickRandom = (arr: string[], n: number) => [...arr].sort(() => 0.5 - Math.random()).slice(0, n);

  // 优先「问我的库」(2 条) + 帮助类(1 条),强化「能问你自己存的东西」这一心智
  function selectRandomQuestions() {
    recommendationItems.value = [...pickRandom(myLibraryQuestions, 2), ...pickRandom(helpQuestions, 1)];
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
