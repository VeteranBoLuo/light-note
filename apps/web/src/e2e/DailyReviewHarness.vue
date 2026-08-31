<template>
  <main class="daily-review-harness">
    <header>
      <span>Daily Review / visual QA</span>
      <h1>每日回顾状态验收</h1>
      <p>{{ stateDescription }}</p>
    </header>

    <section class="daily-review-harness__surface" :data-state="visualState">
      <DailyReviewCard :read-only="visualState === 'readonly'" />
      <p v-if="visualState === 'visitor'" class="daily-review-harness__visitor-note">
        游客不生成空回顾卡片；页面保留原有登录引导。
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import DailyReviewCard from '@/components/workbenches/DailyReviewCard.vue';

  const props = defineProps<{ visualState: string }>();
  const descriptions: Record<string, string> = {
    active: '三条固定内容中的第一条；用于核对进度、主操作、换一条与更多菜单。',
    loading: '首次生成尚未返回，卡片应只显示独立加载状态。',
    error: '首次加载失败，错误提示与重试入口不能影响页面其他内容。',
    stale: '已有内容时刷新失败，保留旧内容并显示非阻断提示。',
    'completed-stale': '已完成快照刷新失败时，必须明确提示状态可能已过期。',
    'skipped-stale': '已收起快照刷新失败时，必须明确提示状态可能已过期。',
    'empty-stale': '空快照刷新失败时，必须明确提示状态可能已过期。',
    'action-error': '内容已打开但进度同步失败，条目保留并提供重试。',
    completed: '全部条目处理完成后的紧凑完成态。',
    skipped: '今天先收起后的紧凑可恢复状态。',
    empty: '确实没有符合规则的旧内容时的空状态。',
    readonly: '管理员代管上下文只读查看已有清单，不提供任何写操作。',
    visitor: '游客不生成也不展示没有意义的空卡片。',
  };
  const stateDescription = computed(() => descriptions[props.visualState] || descriptions.active);
</script>

<style lang="less">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }

  html,
  body {
    overflow: auto;
  }

  body {
    display: block;
    color: var(--text-color);
    background: var(--background-color);
    font-family: var(--app-font-family);
  }

  .daily-review-harness {
    display: grid;
    width: min(1180px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 34px 24px 72px;
    gap: 22px;
  }

  .daily-review-harness > header,
  .daily-review-harness__surface {
    padding: 22px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 18px;
    background: var(--card-background);
  }

  .daily-review-harness h1 {
    margin: 8px 0;
    font-size: clamp(24px, 4vw, 36px);
  }

  .daily-review-harness p,
  .daily-review-harness header > span {
    color: var(--desc-color);
  }

  .daily-review-harness__visitor-note {
    margin: 0;
    padding: 18px;
    border: 1px dashed var(--surface-border-color, var(--card-border-color));
    border-radius: 14px;
    text-align: center;
  }

  @media (max-width: 640px) {
    .daily-review-harness {
      padding: 18px 12px 48px;
      gap: 16px;
    }

    .daily-review-harness > header,
    .daily-review-harness__surface {
      padding: 14px;
      border-radius: 16px;
    }
  }
</style>
