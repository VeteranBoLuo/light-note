<template>
  <CommonContainer v-if="bookmark.isMobile" :title="t('personCenter.feedback')" @backClick="goBack">
    <OpinionPanel page-mode :initial-tab="initialTab" @replyViewed="handleReplyViewed" @submitted="handleSubmitted" />
  </CommonContainer>

  <div v-else class="opinion-page">
    <div class="opinion-page__bg" />
    <section class="opinion-page__container">
      <header class="opinion-page__hero">
        <button class="opinion-page__back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="18" />
          <span>{{ t('common.back') }}</span>
        </button>
        <div class="opinion-page__hero-main">
          <div class="opinion-page__eyebrow">{{ t('personCenter.feedback') }}</div>
          <h1 class="opinion-page__title">{{ t('personCenter.opinions.pageTitle') }}</h1>
          <p class="opinion-page__desc">{{ t('personCenter.opinions.pageDesc') }}</p>
        </div>
      </header>

      <div class="opinion-page__body">
        <main class="opinion-page__main">
          <OpinionPanel
            page-mode
            :initial-tab="initialTab"
            @replyViewed="handleReplyViewed"
            @submitted="handleSubmitted"
          />
        </main>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import OpinionPanel from '@/components/personCenter/opinions/OpinionPanel.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();

  const initialTab = computed(() => (route.query.tab === 'history' ? 'history' : 'form'));

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }

  function handleReplyViewed() {
    user.unreadOpinionReplyTotal = 0;
    if (route.query.markViewed) {
      const nextQuery = { ...route.query };
      delete nextQuery.markViewed;
      router.replace({
        path: route.path,
        query: nextQuery,
      });
    }
  }

  function handleSubmitted() {
    router.replace({
      path: route.path,
      query: {
        ...route.query,
        tab: 'history',
      },
    });
  }
</script>

<style scoped lang="less">
  .opinion-page {
    min-height: 100vh;
    position: relative;
    padding: 32px 24px 40px;
    box-sizing: border-box;
    background:
      radial-gradient(
        circle at top left,
        color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at top right,
        color-mix(in srgb, var(--resource-note-color) 12%, transparent),
        transparent 24%
      ),
      var(--page-background, var(--background-color));
  }

  .opinion-page__bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.5;
  }

  .opinion-page__container {
    position: relative;
    max-width: 1180px;
    margin: 0 auto;
    padding-bottom: 88px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .opinion-page__hero {
    border: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
    border-radius: 24px;
    padding: 24px 28px;
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--resource-bookmark-color) 8%, var(--background-color)),
        transparent 60%
      ),
      var(--background-color);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .opinion-page__back {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: var(--background-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .opinion-page__eyebrow {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sub-text-color);
  }

  .opinion-page__title {
    margin: 6px 0 10px;
    font-size: 32px;
    line-height: 1.15;
    color: var(--text-color);
  }

  .opinion-page__desc {
    margin: 0;
    max-width: 700px;
    line-height: 1.7;
    color: var(--sub-text-color);
  }

  .opinion-page__body {
    min-height: calc(100vh - 290px);
  }

  .opinion-page__side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: sticky;
    top: 20px;
  }

  .opinion-page__side-card,
  .opinion-page__main {
    border: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
    border-radius: 22px;
    background: color-mix(in srgb, var(--background-color) 96%, transparent);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.06);
  }

  .opinion-page__side-card {
    padding: 18px;
    color: var(--sub-text-color);
    line-height: 1.7;
  }

  .opinion-page__side-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-color);
    margin-bottom: 8px;
  }

  .opinion-page__side-card p {
    margin: 0;
  }

  .opinion-page__main {
    padding: 20px;
    min-width: 0;
    height: min(720px, calc(100vh - 290px));
    overflow: hidden;
  }

  @media (max-width: 960px) {
    .opinion-page {
      min-height: 100vh;
      padding: 18px 14px 24px;
    }

    .opinion-page__hero {
      padding: 18px;
      border-radius: 20px;
    }

    .opinion-page__title {
      font-size: 26px;
    }

    .opinion-page__body {
      grid-template-columns: 1fr;
      min-height: auto;
    }

    .opinion-page__side {
      position: static;
    }

    .opinion-page__main {
      height: auto;
      overflow: visible;
    }
  }
</style>
