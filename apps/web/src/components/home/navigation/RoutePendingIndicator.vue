<template>
  <div class="route-pending" :class="{ 'is-slow': slow }" role="status" aria-live="polite" :style="moduleStyle">
    <!-- 品牌主标识“笺结”逐片流转，属于多色、动态的品牌资产，不走单色静态图标的 SvgIcon。 -->
    <div class="route-pending__mark" aria-hidden="true">
      <svg viewBox="0 0 256 256">
        <g v-for="(tone, index) in KNOT_TONES" :key="tone" :transform="`rotate(${index * 90} 128 128)`">
          <path
            class="route-pending__petal"
            :class="`route-pending__petal--${index + 1}`"
            :d="KNOT_PETAL"
            :fill="tone"
          />
        </g>
      </svg>
    </div>
    <div class="route-pending__label">
      <span v-if="module" class="route-pending__module" aria-hidden="true">
        <SvgIcon :src="module.icon" size="14" />
      </span>
      <span v-if="module">
        {{ t('routePending.opening') }}<span class="route-pending__name">{{ t(module.labelKey) }}</span>
      </span>
      <span v-else>{{ t('routePending.openingPage') }}</span>
    </div>
    <div class="route-pending__hint">{{ t('routePending.slow') }}</div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { RouteLocationNormalized } from 'vue-router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = defineProps<{ target: RouteLocationNormalized; slow: boolean }>();
  const { t } = useI18n();

  // 与 favicon 同源的四片纸带及其品牌紫明度层次。
  const KNOT_PETAL = 'M132 24h48c28.72 0 52 23.28 52 52v48h-48l-52-52V24z';
  const KNOT_TONES = ['#8079f8', '#655eed', '#5047d5', '#a09bfc'];

  interface PendingModule {
    labelKey: string;
    icon: string;
    color: string;
  }

  // 只为常用一级入口展示模块身份；其余页面使用通用文案，避免为每个页面维护一份配置。
  function resolveModule(name: string): PendingModule | null {
    if (name === 'workbenches')
      return { labelKey: 'navigation.workbench', icon: icon.common.calendar, color: 'var(--primary-color)' };
    if (['home', 'home:id', 'home:search'].includes(name))
      return { labelKey: 'navigation.bookmark', icon: icon.resource.bookmark, color: 'var(--resource-bookmark-color)' };
    if (['noteLibrary', 'noteDetail'].includes(name))
      return { labelKey: 'navigation.note', icon: icon.resource.note, color: 'var(--resource-note-color)' };
    if (name === 'cloudSpace')
      return { labelKey: 'navigation.cloudSpace', icon: icon.resource.file, color: 'var(--resource-file-color)' };
    if (name === 'tagMg')
      return { labelKey: 'navigation.tag', icon: icon.resource.tag, color: 'var(--resource-tag-color)' };
    if (name === 'inbox')
      return { labelKey: 'navigation.todo', icon: icon.noteDetail.toolbar.todo, color: 'var(--todo-module-color)' };
    if (name === 'searchCenter')
      return { labelKey: 'navigation.resourceCenter', icon: icon.navigation.search, color: 'var(--primary-color)' };
    if (name === 'growth')
      return { labelKey: 'growth.pageTitle', icon: icon.userCenter.growth, color: 'var(--primary-color)' };
    if (name.startsWith('community') && !name.toLowerCase().includes('admin'))
      return { labelKey: 'mobileNavigation.community', icon: icon.ai.conversations, color: 'var(--primary-color)' };
    return null;
  }

  const module = computed(() => resolveModule(String(props.target.name || '')));
  const moduleStyle = computed(() => (module.value ? { '--route-pending-color': module.value.color } : undefined));
</script>

<style lang="less" scoped>
  .route-pending {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-16, 16px);
    padding-bottom: 8vh;
    box-sizing: border-box;
    background: var(--background-color);
    animation: route-pending-in 160ms ease-out both;
  }

  .route-pending__mark {
    width: var(--ui-layout-60, 60px);
    height: var(--ui-layout-60, 60px);

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  }

  .route-pending__petal {
    animation: route-pending-knot 1.6s cubic-bezier(0.45, 0, 0.25, 1) infinite;
  }

  .route-pending__petal--2 {
    animation-delay: 0.4s;
  }

  .route-pending__petal--3 {
    animation-delay: 0.8s;
  }

  .route-pending__petal--4 {
    animation-delay: 1.2s;
  }

  .route-pending__label {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-15, 15px);
    line-height: 1.5;
    color: var(--desc-color);
  }

  .route-pending__module {
    display: inline-grid;
    place-items: center;
    width: var(--ui-layout-26, 26px);
    height: var(--ui-layout-26, 26px);
    border: 1px solid color-mix(in srgb, var(--route-pending-color) 32%, transparent);
    border-radius: var(--ui-space-8, 8px);
    color: var(--route-pending-color);
    background: color-mix(in srgb, var(--route-pending-color) 12%, transparent);
  }

  .route-pending__name {
    font-weight: 600;
    color: var(--text-color);
  }

  .route-pending__hint {
    min-height: var(--ui-space-20, 20px);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.5;
    color: var(--desc-color);
    opacity: 0;
    transition: opacity 240ms ease;
  }

  .route-pending.is-slow .route-pending__hint {
    opacity: 1;
  }

  [data-theme='night'] .route-pending {
    --route-pending-rest: 0.62;
    --route-pending-settle: 0.86;
  }

  // 2560 等超宽视口在 100% 缩放下留白很大，标识作为唯一焦点适度放大，仍以密度变量为基准。
  @media (min-width: 2200px) {
    .route-pending__mark {
      width: calc(var(--ui-layout-60, 60px) * 1.3);
      height: calc(var(--ui-layout-60, 60px) * 1.3);
    }

    .route-pending__label {
      font-size: var(--ui-font-17, 17px);
    }
  }

  @keyframes route-pending-knot {
    0%,
    100% {
      transform: translate(0, 0);
      opacity: var(--route-pending-rest, 0.42);
    }

    16% {
      /* ui-density-fixed: SVG 用户坐标内的纸带位移，随标识整体缩放，不是布局尺寸 */
      transform: translate(10px, -10px);
      opacity: 1;
    }

    42% {
      transform: translate(0, 0);
      opacity: var(--route-pending-settle, 0.78);
    }
  }

  @keyframes route-pending-in {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .route-pending {
      animation: none;
    }

    .route-pending__petal {
      animation: route-pending-breathe 2.4s ease-in-out infinite;
    }
  }

  @keyframes route-pending-breathe {
    0%,
    100% {
      opacity: 0.6;
    }

    50% {
      opacity: 1;
    }
  }
</style>
