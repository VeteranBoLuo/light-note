<template>
  <div v-if="recommendationItems.length" class="recommendation-container">
    <div class="recommendation-title">{{ round > 0 ? $t('ai.followUpTip') : $t('ai.tip') }}</div>
    <div class="recommendation-list">
      <BButton
        v-for="item in visibleRecommendationItems"
        :key="round + ':' + item"
        class="recommendation-item"
        @click="handleRecommendationClick(item, $event)"
        v-click-log="{ module: 'AI助手', operation: `点击推荐问题【${item}】` }"
      >
        {{ item }}
      </BButton>
      <BButton
        v-if="showMobileToggle"
        class="recommendation-more"
        :aria-expanded="mobileExpanded"
        @click="mobileExpanded = !mobileExpanded"
      >
        {{ mobileExpanded ? t('ai.recommendationLess') : t('ai.recommendationMore') }}
      </BButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { recommendedQuestionKeys } from './aiRecommendationPolicy';

  const { t } = useI18n();
  const route = useRoute();
  const layout = bookmarkStore();
  const user = useUserStore();
  const mobileExpanded = ref(false);

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

    const keys = recommendedQuestionKeys(route.path, {
      role: user.role,
      adminMode: user.adminContext?.mode || 'normal',
    });

    const available = keys.map((key) => t(`ai.${key}`)).filter((question) => !used.has(question));
    if (!available.length) return [];

    // 每轮按固定步长轮换，同时排除已经问过的问题，避免回答后原样重复同一组快捷提问。
    const offset = (props.round * 2) % available.length;
    return [...available.slice(offset), ...available.slice(0, offset)].slice(0, 3);
  });
  const showMobileToggle = computed(() => layout.isMobile && recommendationItems.value.length > 2);
  const visibleRecommendationItems = computed(() =>
    showMobileToggle.value && !mobileExpanded.value
      ? recommendationItems.value.slice(0, 2)
      : recommendationItems.value,
  );

  watch(
    () => [props.round, route.path, props.items],
    () => {
      mobileExpanded.value = false;
    },
  );

  function handleRecommendationClick(item: string, event?: MouseEvent) {
    // 点击后主动失焦:button 点击会保持 :focus,回答后新一轮快捷提问若复用相同位置的 DOM,残留的
    // :focus-visible 绿色描边会让"新的对应位置那一颗"错误地显示成已选中。配合 key 带上 round 重建节点,双保险。
    (event?.currentTarget as HTMLElement | null)?.blur?.();
    emit('recommendation-click', item);
  }
</script>

<style scoped lang="less">
  .recommendation-container {
    display: flex;
    align-items: center;
    width: 100%;
    height: 48px;
    min-width: 0;
    gap: 10px;
    overflow: hidden;
  }

  .recommendation-title {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    margin: 0;
    color: var(--resource-note-color);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
  }

  .recommendation-list {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }

  .recommendation-list::-webkit-scrollbar {
    display: none;
  }

  .recommendation-item {
    width: max-content;
    max-width: min(280px, 80%);
    height: 32px;
    min-height: 32px;
    flex: 0 0 auto;
    overflow: hidden;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    padding: 0 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    line-height: 1.35;
    scroll-snap-align: start;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #4b5563;
    border: 0;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: none;
  }

  .recommendation-item:hover {
    color: var(--resource-note-color);
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
      height: 44px;
      min-height: 44px;
      padding: 2px 0;
      box-sizing: border-box;
      align-items: center;
      gap: 6px;
      overflow: hidden;
    }

    .recommendation-title {
      padding-left: 0;
      font-size: 0.6875rem;
      color: color-mix(in srgb, var(--primary-color) 72%, var(--desc-color));
    }

    .recommendation-list {
      display: flex;
      min-width: 0;
      gap: 6px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
    }

    .recommendation-item {
      width: max-content;
      height: 40px;
      min-height: 40px;
      max-width: min(240px, 72vw);
      padding: 0 12px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 14%, var(--surface-border-color));
      border-radius: 10px;
      background: var(--card-background);
      color: var(--text-color);
      box-shadow: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: manipulation;
    }

    .recommendation-more {
      width: max-content;
      min-width: 72px;
      min-height: 40px;
      flex: 0 0 auto;
      color: var(--primary-color);
      background: transparent;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: manipulation;
    }
  }
</style>
