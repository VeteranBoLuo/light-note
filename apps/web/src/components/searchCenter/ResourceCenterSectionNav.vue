<template>
  <div class="resource-center-section-bar">
    <div class="resource-center-section-nav" role="tablist" :aria-label="t('resourceCenter.title')">
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
        :class="{ active: activeSection === 'inbox' }"
        role="tab"
        :aria-selected="activeSection === 'inbox'"
        @click="goTo('inbox')"
      >
        {{ inboxSectionLabel }}
        <span v-if="displayCountValue" class="section-nav-count">{{ displayInboxCount }}</span>
      </BButton>
    </div>
    <BButton
      class="knowledge-map-view"
      :class="{ active: isKnowledgeMapView }"
      :aria-label="t('resourceCenter.knowledgeGraph')"
      :aria-pressed="isKnowledgeMapView"
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
  import { isMobileResourceInboxTab } from '@/config/mobileNavigation';
  import icon from '@/config/icon';
  import { bookmarkStore, inboxStore } from '@/store';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const isKnowledgeMapView = computed(() => route.path === '/search' && route.query.section === 'map');

  const activeSection = computed(() => {
    if (!route.path.startsWith('/inbox')) return 'resources';
    if (!bookmark.isMobile) return 'inbox';
    return isMobileResourceInboxTab(route.query.tab) ? 'inbox' : 'resources';
  });
  const displayCountValue = computed(() => inbox.pendingTotal);
  const displayInboxCount = computed(() => (displayCountValue.value > 99 ? '99+' : String(displayCountValue.value)));
  const inboxSectionLabel = computed(() => t('resourceCenter.sections.pendingResources'));

  function goTo(section: 'resources' | 'inbox') {
    const target =
      section === 'inbox' && bookmark.isMobile
        ? { path: '/inbox', query: { tab: 'all' } }
        : section === 'inbox'
          ? '/inbox'
          : '/search';
    if (router.resolve(target).fullPath === route.fullPath) return;
    recordOperation({
      module: '资源中心',
      operation: section === 'inbox' ? '切换待整理视图' : '切换全部资源视图',
    });
    // 同级分区切换不产生历史记录，否则返回键要按很多次才能离开资源中心
    router.replace(target);
  }

  function toggleKnowledgeMap() {
    const query = route.path === '/search' ? { ...route.query } : {};
    if (isKnowledgeMapView.value) delete query.section;
    else query.section = 'map';
    recordOperation({
      module: '资源中心',
      operation: isKnowledgeMapView.value ? '退出知识地图视图' : '切换知识地图视图',
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
    gap: 8px;
    box-sizing: border-box;
  }

  .resource-center-section-nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    box-sizing: border-box;
    background: var(--hover-background);
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

  .section-nav-count {
    min-width: 17px;
    height: 17px;
    margin-left: 5px;
    padding: 0 4px;
    border-radius: 9px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--primary-color);
    color: #fff;
    font-size: 10px;
    line-height: 1;
  }

  .knowledge-map-view {
    height: 38px;
    padding: 0 12px;
    gap: 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--background-color);
    color: var(--desc-color);
    white-space: nowrap;
  }

  .knowledge-map-view:hover {
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
  }

  .knowledge-map-view.active {
    border-color: color-mix(in srgb, var(--primary-color) 35%, var(--surface-border-color));
    background: color-mix(in srgb, var(--primary-color) 11%, var(--background-color));
    color: var(--primary-color);
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  }

  .knowledge-map-view__label--short {
    display: none;
  }

  @media (max-width: 767px) {
    .resource-center-section-bar {
      width: 100%;
      gap: 6px;
    }

    .resource-center-section-nav {
      width: auto;
      min-width: 0;
      flex: 1 1 auto;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .section-nav-item {
      width: 100%;
      min-width: 0;
      padding-inline: 8px;
    }

    .knowledge-map-view {
      min-width: 82px;
      flex: 0 0 auto;
      padding-inline: 10px;
    }

    .knowledge-map-view__label--full {
      display: none;
    }

    .knowledge-map-view__label--short {
      display: inline;
    }
  }
</style>
