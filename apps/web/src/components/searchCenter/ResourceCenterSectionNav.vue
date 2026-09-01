<template>
  <div
    class="resource-center-section-bar"
    role="tablist"
    :aria-label="t('resourceCenter.title')"
  >
    <div class="resource-center-section-nav">
      <BButton
        class="section-nav-item"
        :class="{ active: activeSection === 'resources' }"
        role="tab"
        :aria-selected="activeSection === 'resources'"
        @click="goTo('resources')"
      >
        {{ t('resourceCenter.sections.resources') }}
      </BButton>
      <BButton
        class="section-nav-item"
        :class="{ active: activeSection === 'organize' }"
        role="tab"
        :aria-selected="activeSection === 'organize'"
        @click="goTo('organize')"
      >
        <SvgIcon :src="icon.ai.organize" size="15" aria-hidden="true" />
        {{ t('resourceCenter.sections.organize') }}
      </BButton>
    </div>
    <BButton
      class="knowledge-map-view"
      :class="{ active: isKnowledgeMapView }"
      :aria-label="t('resourceCenter.knowledgeGraph')"
      role="tab"
      :aria-selected="isKnowledgeMapView"
      @click="toggleKnowledgeMap"
    >
      <SvgIcon :src="icon.noteTemplate.knowledge" size="16" aria-hidden="true" />
      <span class="knowledge-map-view__label knowledge-map-view__label--full">
        {{ t('resourceCenter.knowledgeGraph') }}
      </span>
      <span class="knowledge-map-view__label knowledge-map-view__label--short" aria-hidden="true">
        {{ t('resourceCenter.knowledgeGraphShort') }}
      </span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi';
  import icon from '@/config/icon';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const isKnowledgeMapView = computed(() => route.path === '/search' && route.query.section === 'map');

  const activeSection = computed(() => {
    if (isKnowledgeMapView.value) return 'map';
    if (route.path.startsWith('/organize')) return 'organize';
    return 'resources';
  });

  function goTo(section: 'resources' | 'organize') {
    const target = section === 'organize' ? '/organize' : '/search';
    if (router.resolve(target).fullPath === route.fullPath) return;
    recordOperation({
      module: '资源中心',
      operation: section === 'organize' ? '切换整理中心视图' : '切换全部资源视图',
    });
    // 同级分区切换不产生历史记录，否则返回键要按很多次才能离开资源中心
    router.replace(target);
  }

  function toggleKnowledgeMap() {
    if (isKnowledgeMapView.value) return;
    const query = route.path === '/search' ? { ...route.query, section: 'map' } : { section: 'map' };
    recordOperation({
      module: '资源中心',
      operation: '切换知识地图视图',
    });
    router.replace({ path: '/search', query });
  }
</script>

<style scoped lang="less">
  .resource-center-section-bar {
    min-width: 0;
    height: 38px;
    display: inline-flex;
    align-items: stretch;
    gap: 0;
    padding: 4px;
    border-radius: 10px;
    background: var(--hover-background);
    box-sizing: border-box;
  }

  .resource-center-section-nav {
    display: contents;
  }

  .section-nav-item {
    height: 30px;
    padding: 0 13px;
    border-radius: 7px;
    background: transparent;
    color: var(--desc-color);
  }

  .section-nav-item:hover {
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }

  .section-nav-item.active {
    background: var(--background-color);
    color: var(--primary-color);
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  }

  .knowledge-map-view {
    height: 30px;
    padding: 0 13px;
    gap: 6px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--desc-color);
    white-space: nowrap;
  }

  .knowledge-map-view:hover {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }

  .knowledge-map-view.active {
    background: var(--background-color);
    color: var(--primary-color);
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  }

  .knowledge-map-view__label--short {
    display: none;
  }

  @media (max-width: 767px) {
    .resource-center-section-bar {
      width: 100%;
      height: 52px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border-radius: 12px;
      background: var(--workspace-panel-bg-color);
    }

    .resource-center-section-nav {
      display: contents;
    }

    .section-nav-item {
      width: 100%;
      min-width: 0;
      height: var(--mobile-touch-size, 44px);
      padding-inline: 8px;
      border: 1px solid transparent;
      background: transparent !important;
      box-shadow: none;
    }

    .section-nav-item :deep(svg) {
      display: none;
    }

    .section-nav-item.active {
      border-color: var(--primary-color);
      color: var(--primary-color);
      background: var(--card-background) !important;
      font-weight: 650;
    }

    .knowledge-map-view {
      width: 100%;
      min-width: 0;
      height: var(--mobile-touch-size, 44px);
      padding-inline: 8px;
      border-color: transparent;
      border-radius: 7px;
      background: transparent !important;
      box-shadow: none;
    }

    .knowledge-map-view :deep(svg) {
      display: none;
    }

    .knowledge-map-view.active {
      border-color: var(--resource-tag-color);
      color: var(--resource-tag-color);
      background: var(--card-background) !important;
      font-weight: 650;
      box-shadow: none;
    }

    .knowledge-map-view__label--full {
      display: inline;
    }

    .knowledge-map-view__label--short {
      display: none;
    }
  }
</style>
