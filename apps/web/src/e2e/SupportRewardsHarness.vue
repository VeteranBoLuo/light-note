<template>
  <main class="support-rewards-harness">
    <header>
      <span>Pure support / visual QA</span>
      <h1>纯支持账号与排行榜状态矩阵</h1>
      <p>本地隔离视觉夹具，只验证支持归属、隐私与历史订单展示，不连接爱发电或发放权益。</p>
    </header>

    <section v-for="fixture in fixtures" :key="fixture.key" class="support-rewards-harness__state">
      <div class="support-rewards-harness__label">
        <strong>{{ fixture.title }}</strong>
        <span>{{ fixture.description }}</span>
      </div>
      <SupportAccountPanel
        :state="fixture.state"
        :unlinking="fixture.unlinking"
        :preference-saving="fixture.preferenceSaving"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
  import SupportAccountPanel from '@/view/support/SupportAccountPanel.vue';
  import type { AfdianSupportState } from '@/api/supportApi';

  const publicPreference = {
    participateInRanking: true,
    showIdentity: false,
    adminHidden: false,
  };

  const fixtures: Array<{
    key: string;
    title: string;
    description: string;
    state: AfdianSupportState;
    unlinking: boolean;
    preferenceSaving: boolean;
  }> = [
    {
      key: 'guest',
      title: '游客',
      description: '只展示登录说明，不泄露任何赞助归属。',
      state: {
        authenticated: false,
        oauthAvailable: true,
        orderSyncAvailable: true,
        linked: false,
        orderCount: 0,
        totalAmount: '0.00',
        publicPreference,
        recentOrders: [],
      },
      unlinking: false,
      preferenceSaving: false,
    },
    {
      key: 'unlinked',
      title: '已登录、未关联',
      description: '可关联爱发电账号，统计为空。',
      state: {
        authenticated: true,
        oauthAvailable: true,
        orderSyncAvailable: true,
        linked: false,
        orderCount: 0,
        totalAmount: '0.00',
        publicPreference,
        recentOrders: [],
      },
      unlinking: false,
      preferenceSaving: false,
    },
    {
      key: 'linked',
      title: '已关联、匿名参与榜单',
      description: '纯支持与旧规则历史支持都可归入支持记录，权益购买不会出现在这里。',
      state: {
        authenticated: true,
        oauthAvailable: true,
        orderSyncAvailable: true,
        linked: true,
        linkedAt: '2026-08-25 10:00:00',
        providerAccount: { name: '轻笺支持者', avatarUrl: null },
        orderCount: 2,
        totalAmount: '24.00',
        lastSupportAt: '2026-08-25 16:30:00',
        publicPreference,
        recentOrders: [
          {
            id: 'donation',
            amount: '18.00',
            month: 1,
            productType: 0,
            optionKey: 'server',
            orderPurpose: 'donation',
            ownershipSource: 'oauth_checkout',
            confirmedAt: '2026-08-25 16:30:00',
            rewardStatus: 'no_entitlement',
            rewardReasonCode: 'pure_support_no_entitlement',
            rewardTokens: 0,
            grantedTokens: 0,
            rewardStorageMb: 0,
            grantedStorageMb: 0,
            intentType: 'donation',
            skuId: null,
            firstPurchaseApplied: false,
          },
          {
            id: 'legacy',
            amount: '6.00',
            month: 1,
            productType: 0,
            optionKey: 'coffee',
            orderPurpose: 'legacy_support',
            ownershipSource: 'oauth',
            confirmedAt: '2026-08-20 08:00:00',
            rewardStatus: 'credited',
            rewardReasonCode: null,
            rewardTokens: 600_000,
            grantedTokens: 600_000,
            rewardStorageMb: 0,
            grantedStorageMb: 0,
            intentType: 'legacy',
            skuId: null,
            firstPurchaseApplied: false,
          },
        ],
      },
      unlinking: false,
      preferenceSaving: false,
    },
    {
      key: 'ranking-excluded',
      title: '已退出排行榜',
      description: '支持记录仍归属于本人，但累计榜不再统计和展示。',
      state: {
        authenticated: true,
        oauthAvailable: true,
        orderSyncAvailable: true,
        linked: true,
        providerAccount: { name: '低调支持者', avatarUrl: null },
        orderCount: 1,
        totalAmount: '50.00',
        lastSupportAt: '2026-08-25 12:00:00',
        publicPreference: { ...publicPreference, participateInRanking: false, showIdentity: false },
        recentOrders: [],
      },
      unlinking: false,
      preferenceSaving: false,
    },
    {
      key: 'sync-unavailable',
      title: '同步不可用与操作中',
      description: '失败提示和按钮加载态保持可辨认。',
      state: {
        authenticated: true,
        oauthAvailable: true,
        orderSyncAvailable: false,
        linked: true,
        providerAccount: { name: '同步维护中', avatarUrl: null },
        orderCount: 1,
        totalAmount: '6.00',
        publicPreference: { ...publicPreference, adminHidden: true },
        recentOrders: [],
      },
      unlinking: true,
      preferenceSaving: true,
    },
  ];
</script>

<style lang="less">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }

  html,
  body {
    overflow: auto;
  }

  body {
    display: block;
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .support-rewards-harness {
    display: grid;
    width: min(1040px, 100%);
    min-height: 100vh;
    margin: 0 auto;
    padding: 32px 24px 72px;
    gap: 22px;
  }

  .support-rewards-harness > header {
    padding: 22px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }

  .support-rewards-harness h1 {
    margin: 8px 0;
    font-size: clamp(24px, 4vw, 36px);
  }

  .support-rewards-harness p,
  .support-rewards-harness header > span,
  .support-rewards-harness__label span {
    color: var(--desc-color);
  }

  .support-rewards-harness__state {
    display: grid;
    gap: 10px;
  }

  .support-rewards-harness__label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding-inline: 4px;
  }

  @media (max-width: 600px) {
    .support-rewards-harness {
      padding: 18px 12px 48px;
      gap: 18px;
    }

    .support-rewards-harness > header {
      padding: 18px;
    }

    .support-rewards-harness__label {
      display: grid;
      gap: 4px;
    }
  }
</style>
