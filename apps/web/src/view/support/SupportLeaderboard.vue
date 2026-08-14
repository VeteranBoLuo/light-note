<template>
  <section class="support-leaderboard" aria-labelledby="support-leaderboard-title">
    <div class="support-leaderboard__heading">
      <div>
        <span>{{ t('support.leaderboardEyebrow') }}</span>
        <h2 id="support-leaderboard-title">{{ t('support.leaderboardTitle') }}</h2>
        <p>{{ t('support.leaderboardDescription') }}</p>
      </div>
      <span v-if="leaderboard" class="support-leaderboard__count">
        {{ t('support.leaderboardParticipants', { count: leaderboard.totalParticipants }) }}
      </span>
    </div>

    <BCard class="support-leaderboard__card" padding="0" radius="18px">
      <div v-if="loading" class="support-leaderboard__state">{{ t('support.leaderboardLoading') }}</div>
      <div v-else-if="!leaderboard?.items.length" class="support-leaderboard__state">
        <strong>{{ t('support.leaderboardEmptyTitle') }}</strong>
        <span>{{ t('support.leaderboardEmptyDescription') }}</span>
      </div>
      <ol v-else>
        <li
          v-for="(item, index) in leaderboard.items"
          :key="`${item.rank}-${item.publicId || 'anonymous'}-${index}`"
        >
          <span class="support-leaderboard__rank" :class="{ 'is-top': item.rank <= 3 }">{{ item.rank }}</span>
          <img
            v-if="item.publicId"
            class="support-leaderboard__avatar"
            :src="afdianLeaderboardAvatarUrl(item.publicId)"
            :alt="item.displayName || t('support.anonymousSupporter')"
            decoding="async"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <span v-else class="support-leaderboard__avatar support-leaderboard__avatar--fallback" aria-hidden="true">
            {{ item.anonymous ? t('support.anonymousSupporter').slice(0, 1) : item.displayName?.slice(0, 1) }}
          </span>
          <div class="support-leaderboard__identity">
            <strong>{{ item.anonymous ? t('support.anonymousSupporter') : item.displayName }}</strong>
            <span>{{ t('support.leaderboardOrders', { count: item.orderCount }) }}</span>
          </div>
          <strong class="support-leaderboard__amount">¥{{ item.totalAmount }}</strong>
        </li>
      </ol>
      <div v-if="leaderboard?.mine && leaderboard.mine.rank > 10" class="support-leaderboard__mine">
        <span>{{ t('support.myLeaderboardRank') }}</span>
        <strong>#{{ leaderboard.mine.rank }}</strong>
        <span>¥{{ leaderboard.mine.totalAmount }}</span>
      </div>
    </BCard>
    <p class="support-leaderboard__footnote">{{ t('support.leaderboardFootnote') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import { afdianLeaderboardAvatarUrl, type AfdianLeaderboard } from '@/api/supportApi';

  defineProps<{ leaderboard: AfdianLeaderboard | null; loading: boolean }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .support-leaderboard {
    margin-top: 34px;
  }

  .support-leaderboard__heading {
    margin-bottom: 14px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
  }

  .support-leaderboard__heading > div > span,
  .support-leaderboard__count {
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }

  h2 {
    margin: 4px 0 0;
    font-size: clamp(21px, 2vw, 27px);
  }

  p {
    margin: 7px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
  }

  .support-leaderboard__card {
    overflow: hidden;
    border-color: var(--surface-border-color);
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    min-height: 62px;
    padding: 10px 16px;
    display: grid;
    grid-template-columns: 28px 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  li:last-child {
    border-bottom: 0;
  }

  .support-leaderboard__rank {
    color: var(--desc-color);
    text-align: center;
    font-size: 13px;
    font-weight: 700;
  }

  .support-leaderboard__rank.is-top {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--hover-background);
  }

  .support-leaderboard__avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
  }

  .support-leaderboard__avatar--fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: var(--hover-background);
    font-size: 12px;
    font-weight: 700;
  }

  .support-leaderboard__identity strong,
  .support-leaderboard__identity span {
    display: block;
  }

  .support-leaderboard__identity strong,
  .support-leaderboard__amount {
    color: var(--text-color);
    font-size: 14px;
  }

  .support-leaderboard__identity span,
  .support-leaderboard__mine,
  .support-leaderboard__state {
    color: var(--desc-color);
    font-size: 12px;
  }

  .support-leaderboard__amount {
    font-weight: 750;
  }

  .support-leaderboard__mine {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--primary-color);
    background: var(--hover-background);
  }

  .support-leaderboard__mine strong {
    color: var(--primary-color);
  }

  .support-leaderboard__state {
    min-height: 110px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    text-align: center;
  }

  .support-leaderboard__state strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .support-leaderboard__footnote {
    margin-left: 2px;
  }

  @media (max-width: 560px) {
    .support-leaderboard__heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }

    li {
      padding: 10px 12px;
      grid-template-columns: 26px 34px minmax(0, 1fr) auto;
      gap: 9px;
    }

    .support-leaderboard__avatar {
      width: 34px;
      height: 34px;
    }
  }
</style>
