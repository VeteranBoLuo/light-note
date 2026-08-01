<template>
  <div class="tag-hub">
    <BTabs v-model:active-tab="activeView" :options="viewOptions" variant="segment" class="tag-hub__tabs" />
    <GlobalGraph v-if="activeView === 'map'" class="tag-hub__map" />
    <template v-else>
      <TagTableMobile v-if="bookmark.isMobile" />
      <TagTable v-else />
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import TagTable from '@/components/manage/tagMg/TagTable.vue';
  import { bookmarkStore } from '@/store';
  import TagTableMobile from '@/components/manage/tagMg/TagTableMobile.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import GlobalGraph from '@/view/graph/GlobalGraph.vue';

  const bookmark = bookmarkStore();
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const routeView = () => (route.query.view === 'map' ? 'map' : 'list');
  const activeView = ref(routeView());
  const viewOptions = computed(() => [
    { key: 'list', label: t('tagManage.tabs.list') },
    { key: 'map', label: t('tagManage.tabs.map') },
  ]);

  watch(
    () => route.query.view,
    () => {
      activeView.value = routeView();
    },
  );
  watch(activeView, (view) => {
    const nextView = view === 'map' ? 'map' : undefined;
    if (route.query.view === nextView) return;
    const query = { ...route.query };
    if (nextView) query.view = nextView;
    else delete query.view;
    router.replace({ path: '/manage/tagMg', query });
  });
</script>

<style scoped lang="less">
  .tag-hub {
    display: flex;
    min-height: 100%;
    flex-direction: column;
  }

  .tag-hub__tabs {
    z-index: 2;
    flex: 0 0 auto;
    margin: 12px 20px 0;
  }

  .tag-hub__map {
    flex: 1;
    min-height: 620px;
  }

  @media (max-width: 700px) {
    .tag-hub__tabs {
      margin: 10px 12px 0;
    }

    .tag-hub__map {
      min-height: 0;
    }
  }
</style>
