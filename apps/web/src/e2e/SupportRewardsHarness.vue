<template>
  <main class="support-rewards-harness">
    <header>
      <span>Support rewards / visual QA</span>
      <h1>赞助永久 AI 额度状态矩阵</h1>
      <p>本地隔离视觉夹具，不连接爱发电、不发起入账，也不修改真实账号。</p>
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
        grantedTokens: 0,
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
        grantedTokens: 0,
        publicPreference,
        recentOrders: [],
      },
      unlinking: false,
      preferenceSaving: false,
    },
    {
      key: 'linked',
      title: '已关联与完整奖励状态',
      description: '覆盖成功、待关联、大额复核、历史排除、退款复核和不符合条件。',
      state: {
        authenticated: true,
        oauthAvailable: true,
        orderSyncAvailable: true,
        linked: true,
        linkedAt: '2026-08-25 10:00:00',
        providerAccount: { name: '轻笺支持者', avatarUrl: null },
        orderCount: 6,
        totalAmount: '286.00',
        grantedTokens: 5_600_000,
        lastSupportAt: '2026-08-25 16:30:00',
        publicPreference,
        recentOrders: [
          {
            id: 'credited',
            amount: '50.00',
            month: 1,
            productType: 0,
            optionKey: 'companion',
            ownershipSource: 'oauth_checkout',
            confirmedAt: '2026-08-25 16:30:00',
            rewardStatus: 'credited',
            rewardReasonCode: null,
            rewardTokens: 5_000_000,
            grantedTokens: 5_000_000,
          },
          {
            id: 'pending-link',
            amount: '18.00',
            month: 1,
            productType: 0,
            optionKey: 'server',
            ownershipSource: 'unlinked',
            confirmedAt: '2026-08-25 15:20:00',
            rewardStatus: 'pending_link',
            rewardReasonCode: 'account_not_linked',
            rewardTokens: 1_800_000,
            grantedTokens: 0,
          },
          {
            id: 'manual-review',
            amount: '206.00',
            month: 1,
            productType: 0,
            optionKey: null,
            ownershipSource: 'checkout',
            confirmedAt: '2026-08-25 14:10:00',
            rewardStatus: 'manual_review',
            rewardReasonCode: 'large_amount',
            rewardTokens: 20_600_000,
            grantedTokens: 0,
          },
          {
            id: 'legacy',
            amount: '6.00',
            month: 1,
            productType: 0,
            optionKey: 'coffee',
            ownershipSource: 'oauth',
            confirmedAt: '2026-08-20 08:00:00',
            rewardStatus: 'legacy_excluded',
            rewardReasonCode: 'before_policy_activation',
            rewardTokens: 600_000,
            grantedTokens: 0,
          },
          {
            id: 'reversal',
            amount: '6.00',
            month: 1,
            productType: 0,
            optionKey: 'coffee',
            ownershipSource: 'oauth_checkout',
            confirmedAt: '2026-08-25 12:00:00',
            rewardStatus: 'reversal_review',
            rewardReasonCode: 'provider_reversal',
            rewardTokens: 600_000,
            grantedTokens: 600_000,
          },
          {
            id: 'ineligible',
            amount: '0.00',
            month: 1,
            productType: 0,
            optionKey: null,
            ownershipSource: 'oauth',
            confirmedAt: '2026-08-25 11:00:00',
            rewardStatus: 'ineligible',
            rewardReasonCode: 'order_not_eligible',
            rewardTokens: 0,
            grantedTokens: 0,
          },
        ],
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
        grantedTokens: 600_000,
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
