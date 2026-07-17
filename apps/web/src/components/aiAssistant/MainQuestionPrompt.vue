<template>
  <div v-if="recommendationItems.length" class="recommendation-container">
    <div class="recommendation-title">{{ round > 0 ? $t('ai.followUpTip') : $t('ai.tip') }}</div>
    <div class="recommendation-list">
      <BButton
        v-for="item in recommendationItems"
        :key="item"
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

  const props = withDefaults(
    defineProps<{
      usedQuestions?: string[];
      round?: number;
      items?: string[] | null;
    }>(),
    {
      usedQuestions: () => [],
      round: 0,
    },
  );

  const emit = defineEmits<{ 'recommendation-click': [item: string] }>();

  const recommendationItems = computed(() => {
    const used = new Set(props.usedQuestions.map((question) => question.trim()));
    if (Array.isArray(props.items)) {
      return props.items
        .map((item) => String(item || '').trim())
        .filter((item, index, all) => item && !used.has(item) && all.indexOf(item) === index)
        .slice(0, 3);
    }

    const path = route.path;
    let keys = [
      'weeklyKnowledgeDigest',
      'buriedRecap',
      'linkHealth',
      'recentKnowledgeDigest',
      'weeklyRecap',
      'tagUsageOverview',
    ];
    if (path.includes('/noteLibrary')) {
      keys = [
        'recentNoteDigest',
        'noteActionItems',
        'weeklyKnowledgeDigest',
        'myNotes',
        'weeklyRecap',
        'tagUsageOverview',
      ];
    } else if (path.includes('/cloudSpace')) {
      keys = [
        'storageUsage',
        'fileTypeOverview',
        'recentCloudFiles',
        'trashContent',
        'cloudFolderOverview',
        'weeklyKnowledgeDigest',
      ];
    } else if (path.includes('/tag')) {
      keys = [
        'tagUsageOverview',
        'unusedTags',
        'recentKnowledgeDigest',
        'myTags',
        'weeklyKnowledgeDigest',
        'linkHealth',
      ];
    } else if (path.includes('/workbenches')) {
      keys = [
        'weeklyRecap',
        'weeklyChallengeStatus',
        'claimableGrowthRewards',
        'recentKnowledgeDigest',
        'linkHealth',
        'storageUsage',
      ];
    } else if (path.includes('/inbox')) {
      keys = [
        'weeklyKnowledgeDigest',
        'noteActionItems',
        'linkHealth',
        'recentKnowledgeDigest',
        'unusedTags',
        'buriedRecap',
      ];
    }

    const available = keys.map((key) => t(`ai.${key}`)).filter((question) => !used.has(question));
    if (!available.length) return [];

    // 每轮按固定步长轮换，同时排除已经问过的问题，避免回答后原样重复同一组快捷提问。
    const offset = (props.round * 2) % available.length;
    return [...available.slice(offset), ...available.slice(0, offset)].slice(0, 3);
  });

  function handleRecommendationClick(item: string) {
    emit('recommendation-click', item);
  }
</script>

<style scoped lang="less">
  .recommendation-container {
    padding: 0 0.5rem 0.375rem;
    border-radius: 14px;
  }

  .recommendation-title {
    font-size: 0.8125rem;
    line-height: 1.35;
    color: #10b981;
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .recommendation-title::before {
    content: '🔖';
  }

  .recommendation-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .recommendation-item {
    width: fit-content;
    max-width: 100%;
    height: auto;
    min-height: 30px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    line-height: 1.35;
    text-align: left;
    white-space: normal;
    color: #4b5563;
    border: 0;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: none;
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

  @media (max-width: 600px) {
    .recommendation-container {
      padding-inline: 0.25rem;
    }

    .recommendation-item {
      min-height: 40px;
      padding: 8px 12px;
    }
  }
</style>
