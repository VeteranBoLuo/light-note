<template>
  <main ref="pageRef" v-auto-scrollbar class="opinion-page" :class="{ 'opinion-page--mobile': bookmark.isMobile }">
    <CommonContainer v-if="bookmark.isMobile" embedded-mobile :title="t('personCenter.feedback')" @backClick="goBack">
      <OpinionPanel :initial-tab="initialTab" @replyViewed="handleReplyViewed" @submitted="handleSubmitted" />
    </CommonContainer>
    <div v-else class="opinion-page__container">
      <header class="opinion-page__header">
        <BButton type="text" class="opinion-page__back" @click="goBack">
          <SvgIcon :src="icon.arrow_left" size="18" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <div class="opinion-page__heading">
          <h1>{{ t('personCenter.feedback') }}</h1>
          <p>{{ t('personCenter.opinions.pageIntro') }}</p>
        </div>
      </header>
      <div class="opinion-page__surface">
        <OpinionPanel :initial-tab="initialTab" @replyViewed="handleReplyViewed" @submitted="handleSubmitted" />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import OpinionPanel from './OpinionPanel.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { bookmarkStore } from '@/store';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const pageRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(pageRef);
  const initialTab = computed(() => (route.query.tab === 'history' ? 'history' : 'form'));

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }
  function handleReplyViewed() {
    if (!route.query.markViewed) return;
    const nextQuery = { ...route.query };
    delete nextQuery.markViewed;
    router.replace({ path: route.path, query: nextQuery });
  }
  function handleSubmitted() {
    router.replace({ path: route.path, query: { ...route.query, tab: 'history' } });
  }
</script>

<style scoped lang="less">
  .opinion-page {
    height: 100vh;
    height: 100dvh;
    width: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: var(--ui-space-40, 40px) var(--ui-space-24, 24px);
    color: var(--text-color);
    background: var(--surface-panel-bg);
  }
  .opinion-page__container {
    width: 100%;
    max-width: var(--ui-layout-1050, 1050px);
    margin: 0 auto;
  }
  .opinion-page__header {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-20, 20px);
    margin-bottom: var(--ui-space-28, 28px);
  }
  .opinion-page__back.b_btn {
    height: var(--ui-control-32, 32px);
    flex: none;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-2, 2px);
    padding: 0;
    color: var(--desc-color);
  }
  .opinion-page__heading {
    min-width: 0;
    padding-left: var(--ui-space-20, 20px);
    border-left: 1px solid var(--surface-border-color);
  }
  .opinion-page__heading h1 {
    margin: 0;
    font-size: var(--ui-font-24, 24px);
    line-height: 1.4;
    font-weight: 600;
  }
  .opinion-page__heading p {
    margin: var(--ui-space-6, 6px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
  }
  .opinion-page__surface {
    padding: var(--ui-space-28, 28px) var(--ui-space-32, 32px);
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-card-bg);
    box-shadow: var(--surface-card-shadow);
  }
  .opinion-page--mobile {
    padding: 0;
    overflow: hidden;
    background: var(--background-color);
  }
  .opinion-page--mobile > :deep(.common-container--embedded-mobile) {
    height: 100%;
  }
  .opinion-page--mobile :deep(.phone-container--embedded) {
    padding: 0 var(--ui-space-20, 20px);
  }
  .opinion-page--mobile :deep(.phone-container--embedded .phone-navigation) {
    height: var(--ui-layout-56, 56px);
    flex-basis: var(--ui-layout-56, 56px);
    font-size: var(--ui-font-18, 18px);
    font-weight: 600;
  }
  .opinion-page--mobile :deep(.phone-container--embedded .phone-body) {
    padding-top: 0;
    padding-bottom: var(--ui-space-20, 20px);
  }
</style>
