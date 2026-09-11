<template>
  <div class="points-usage-page" :class="{ 'is-embedded': embedded }">
    <main class="points-usage-shell">
      <header v-if="!embedded" class="points-usage-hero">
        <BButton class="points-usage-back" @click="goBack">
          <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
          <span>{{ t('common.back') }}</span>
        </BButton>

        <div class="points-usage-heading">
          <span class="points-usage-heading__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.coin" size="23" />
          </span>
          <div>
            <h1>{{ t('growth.pointsUsagePageTitle') }}</h1>
            <p>{{ t('growth.pointsUsagePageDescription') }}</p>
          </div>
        </div>
      </header>

      <BCard v-if="showSummary" as="section" class="points-overview-panel" padding="20px" radius="14px">
        <PointsSummary :key="accountKey" @exchange="openRewards" />
      </BCard>
      <BCard as="section" class="points-ledger-panel" padding="20px" radius="14px">
        <PointsLedger :key="accountKey" settings-layout />
        <p class="points-ledger-note">{{ t('growth.pointsUsageSettlementHint') }}</p>
      </BCard>
    </main>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useUserStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import PointsLedger from '@/components/growth/PointsLedger.vue';
  import PointsSummary from '@/components/growth/PointsSummary.vue';
  import icon from '@/config/icon';
  withDefaults(defineProps<{ embedded?: boolean; showSummary?: boolean }>(), { embedded: false, showSummary: true });
  const { t } = useI18n();
  const user = useUserStore();
  const accountKey = computed(() => `${user.id}:${user.adminContext?.id || ''}`);
  const router = useRouter();
  function openRewards() {
    void router.push({ path: '/growth', query: { section: 'rewards', reward: 'shop' } });
  }
  function goBack() {
    if (window.history.length > 1) router.back();
    else void router.push({ path: '/growth', query: { section: 'rewards', reward: 'ledger' } });
  }
</script>
<style scoped lang="less">
  .points-usage-page {
    height: 100%;
    overflow-y: auto;
    padding: 28px 24px 64px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }
  .points-usage-shell {
    width: min(100%, 1000px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .points-usage-page.is-embedded {
    height: auto;
    overflow: visible;
    padding: 0;
    background: transparent;
  }
  .is-embedded .points-usage-shell {
    width: 100%;
    max-width: none;
  }
  .points-usage-hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .points-usage-back {
    align-self: flex-start;
  }
  .points-usage-heading {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .points-usage-heading__icon {
    color: var(--primary-color);
  }
  .points-usage-heading h1 {
    margin: 0;
    font-size: 24px;
  }
  .points-usage-heading p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--desc-color);
  }
  .points-overview-panel,
  .points-ledger-panel {
    --b-card-background: var(--card-background);
    box-shadow: none;
  }
  .points-ledger-note {
    margin: 16px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--card-border-color);
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  @media (max-width: 767px) {
    .points-usage-page {
      padding: 16px 14px 48px;
    }
    .points-overview-panel,
    .points-ledger-panel {
      padding: 16px;
    }
  }
</style>
