<template>
  <div v-if="active" class="page-refresh-bar" :class="`page-refresh-bar--${tone}`" aria-hidden="true"></div>
</template>

<script setup lang="ts">
  /**
   * 页面顶部的静默刷新细条。
   *
   * 用途只有一个：后台正在更新数据、但列表仍是旧内容时，给用户一个「在刷新」的提示。
   * 因此它必须是 2px 的细条而不是骨架屏或遮罩 —— 旧数据要留在屏幕上继续可读可点。
   *
   * 什么时候不要用它：下拉刷新已经有下拉指示器了，两者同时出现是重复反馈，
   * 页面应写成 `:active="silentRefreshing && !pullRefresh.refreshing.value"`。
   *
   * 挂载要求：父容器需要 position: relative（本组件用 absolute 贴住容器顶边）。
   */
  withDefaults(
    defineProps<{
      /** 是否正在静默刷新。 */
      active?: boolean;
      /** 取所在模块的资源色，让刷新提示和页面主色一致。 */
      tone?: 'primary' | 'note' | 'bookmark' | 'file' | 'tag';
    }>(),
    { active: false, tone: 'primary' },
  );
</script>

<style scoped lang="less">
  .page-refresh-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 4;
    height: 2px;
    overflow: hidden;
    pointer-events: none;

    &::after {
      content: '';
      display: block;
      width: 28%;
      height: 100%;
      border-radius: 999px;
      animation: page-refresh-slide 900ms ease-in-out infinite;
    }
  }

  /*
   * 每种色调各写一份完整的 color-mix，而不是抽一个 --bar-color 中间变量。
   * 构建期的 androidColorMixFallback 插件是按 color-mix 里的变量名分类的
   * （resource-note → note-soft-background 之类）；套一层自定义变量后它认不出类别，
   * 会把这种「弱底色 + transparent」判成 transparent，Android App 上底槽直接消失。
   */
  .page-refresh-bar--primary {
    background: color-mix(in srgb, var(--primary-color) 16%, transparent);

    &::after {
      background: var(--primary-color);
    }
  }

  .page-refresh-bar--note {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 16%, transparent);

    &::after {
      background: var(--resource-note-color, #00a884);
    }
  }

  .page-refresh-bar--bookmark {
    background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 16%, transparent);

    &::after {
      background: var(--resource-bookmark-color, #615ced);
    }
  }

  .page-refresh-bar--file {
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 16%, transparent);

    &::after {
      background: var(--resource-file-color, #ff8a00);
    }
  }

  .page-refresh-bar--tag {
    background: color-mix(in srgb, var(--resource-tag-color, #ec4899) 16%, transparent);

    &::after {
      background: var(--resource-tag-color, #ec4899);
    }
  }

  @keyframes page-refresh-slide {
    0% {
      transform: translateX(-100%);
    }

    100% {
      transform: translateX(360%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    /* 关掉动画后必须铺满整条,否则只剩一截静止的短块,看起来像卡住了。 */
    .page-refresh-bar::after {
      width: 100%;
      animation: none;
    }
  }
</style>
