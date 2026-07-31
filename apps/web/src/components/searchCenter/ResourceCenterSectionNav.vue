<template>
  <div class="resource-center-section-nav" role="tablist" :aria-label="t('resourceCenter.title')">
    <BButton
      class="section-nav-item"
      :class="{ active: activeSection === 'resources' }"
      role="tab"
      :aria-selected="activeSection === 'resources'"
      @click="goTo('/search')"
    >
      {{ t('resourceCenter.sections.resources') }}
    </BButton>
    <BButton
      class="section-nav-item"
      :class="{ active: activeSection === 'inbox' }"
      role="tab"
      :aria-selected="activeSection === 'inbox'"
      @click="goTo('/inbox')"
    >
      {{ inboxSectionLabel }}
      <span v-if="displayCountValue" class="section-nav-count">{{ displayInboxCount }}</span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { recordOperation } from '@/api/commonApi';
  import { isMobileResourceInboxTab } from '@/config/mobileNavigation';
  import { bookmarkStore, inboxStore } from '@/store';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();

  const activeSection = computed(() => {
    if (!route.path.startsWith('/inbox')) return 'resources';
    if (!bookmark.isMobile) return 'inbox';
    return isMobileResourceInboxTab(route.query.tab) ? 'inbox' : 'resources';
  });
  const displayCountValue = computed(() => (bookmark.isMobile ? inbox.pendingTotal : inbox.actionTotal));
  const displayInboxCount = computed(() => (displayCountValue.value > 99 ? '99+' : String(displayCountValue.value)));
  const inboxSectionLabel = computed(() =>
    bookmark.isMobile ? t('resourceCenter.sections.pendingResources') : t('resourceCenter.sections.inbox'),
  );

  function goTo(path: '/search' | '/inbox') {
    const target = path === '/inbox' && bookmark.isMobile ? { path, query: { tab: 'all' } } : path;
    if (router.resolve(target).fullPath === route.fullPath) return;
    recordOperation({
      module: '资源中心',
      operation: path === '/inbox' ? (bookmark.isMobile ? '切换待整理视图' : '切换待处理视图') : '切换全部资源视图',
    });
    // 同级分区切换不产生历史记录，否则返回键要按很多次才能离开资源中心
    router.replace(target);
  }
</script>

<style scoped lang="less">
  .resource-center-section-nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
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

  @media (max-width: 767px) {
    .resource-center-section-nav {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      box-sizing: border-box;
    }

    .section-nav-item {
      width: 100%;
      min-width: 0;
    }
  }
</style>
