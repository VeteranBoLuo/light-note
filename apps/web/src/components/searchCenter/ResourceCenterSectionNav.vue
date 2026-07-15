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
      {{ t('resourceCenter.sections.inbox') }}
      <span v-if="inbox.pendingTotal" class="section-nav-count">{{ displayInboxCount }}</span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { recordOperation } from '@/api/commonApi';
  import { inboxStore } from '@/store';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const inbox = inboxStore();

  const activeSection = computed(() => (route.path.startsWith('/inbox') ? 'inbox' : 'resources'));
  const displayInboxCount = computed(() => (inbox.pendingTotal > 99 ? '99+' : String(inbox.pendingTotal)));

  function goTo(path: '/search' | '/inbox') {
    if (route.path === path) return;
    recordOperation({
      module: '资源中心',
      operation: path === '/inbox' ? '切换待整理视图' : '切换全部资源视图',
    });
    router.push(path);
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
</style>
