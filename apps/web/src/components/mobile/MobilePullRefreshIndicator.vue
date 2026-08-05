<template>
  <!--
    下拉刷新指示器。视觉沿用「今日」原实现：顶部居中的小胶囊，达到阈值和刷新中转主色。

    统一用产品主色，不按书签/笔记/文件/标签分别换色 —— 它表达的是「同步动作」，
    不是资源类型。宿主容器需要 position: relative，本组件靠负 top 藏在内容上方。
  -->
  <div
    v-if="visible"
    class="mobile-pull-refresh"
    :class="{ 'is-ready': ready, 'is-refreshing': refreshing }"
    :style="{ transform: `translateY(${offset}px)` }"
    role="status"
    aria-live="polite"
  >
    {{ label }}
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = withDefaults(
    defineProps<{
      /** 已含阻尼的下拉距离 */
      distance: number;
      refreshing: boolean;
      ready: boolean;
      /** 由 composable 给出：正在下拉或正在刷新 */
      visible?: boolean;
    }>(),
    { visible: undefined },
  );

  const { t } = useI18n();

  /** 指示器最多下移到这里，再拉也不继续往下跑，避免挡住首屏内容 */
  const MAX_OFFSET = 58;

  const visible = computed(() => props.visible ?? (props.distance > 0 || props.refreshing));
  const offset = computed(() => Math.min(props.distance, MAX_OFFSET));
  const label = computed(() => {
    if (props.refreshing) return t('common.refreshing');
    return props.ready ? t('common.releaseToRefresh') : t('common.pullToRefresh');
  });
</script>

<style lang="less" scoped>
  .mobile-pull-refresh {
    position: absolute;
    top: -42px;
    left: 50%;
    z-index: 3;
    padding: 5px 10px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
    transition: transform 0.16s ease;
    translate: -50% 0;
  }

  .mobile-pull-refresh.is-ready,
  .mobile-pull-refresh.is-refreshing {
    color: var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--surface-divider-color));
  }

  /* 减少动态效果时去掉跟手的位移过渡，但文字状态仍然完整可读 */
  @media (prefers-reduced-motion: reduce) {
    .mobile-pull-refresh {
      transition: none;
    }
  }
</style>
