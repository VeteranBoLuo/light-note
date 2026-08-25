import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { AfdianSupportOrder, AfdianSupportState } from '@/api/supportApi';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

import SupportAccountPanel from './SupportAccountPanel.vue';

const rewardStatuses = [
  ['credited', 600_000],
  ['pending_link', 0],
  ['manual_review', 0],
  ['legacy_excluded', 0],
  ['reversal_review', 600_000],
  ['ineligible', 0],
] as const;

function rewardOrder(
  [rewardStatus, grantedTokens]: (typeof rewardStatuses)[number],
  index: number,
): AfdianSupportOrder {
  return {
    id: `order-${index}`,
    amount: '6.00',
    month: 1,
    productType: 0,
    optionKey: 'coffee',
    ownershipSource: 'checkout',
    confirmedAt: '2026-08-25 12:00:00',
    rewardStatus,
    rewardReasonCode: null,
    rewardTokens: 600_000,
    grantedTokens,
  };
}

let host: HTMLElement | null = null;
let app: ReturnType<typeof createApp> | null = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  host = null;
});

describe('赞助账号面板永久额度状态', () => {
  it('分别展示已到账、待复核、历史排除和反转复核等状态', async () => {
    const state: AfdianSupportState = {
      authenticated: true,
      oauthAvailable: true,
      orderSyncAvailable: true,
      linked: true,
      linkedAt: '2026-08-25 10:00:00',
      providerAccount: { name: '测试支持者', avatarUrl: null },
      orderCount: rewardStatuses.length,
      totalAmount: '36.00',
      grantedTokens: 1_200_000,
      lastSupportAt: '2026-08-25 12:00:00',
      publicPreference: { participateInRanking: true, showIdentity: false, adminHidden: false },
      recentOrders: rewardStatuses.map(rewardOrder),
    };
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(SupportAccountPanel, { state, unlinking: false, preferenceSaving: false });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
      }),
    );
    app.mount(host);
    await nextTick();

    expect(host.textContent).toContain('120万');
    expect(host.textContent).toContain('+60万 永久 AI');
    expect(host.textContent).toContain('关联账号后赠送');
    expect(host.textContent).toContain('额度待人工复核');
    expect(host.textContent).toContain('历史订单不参与赠送');
    expect(host.textContent).toContain('订单状态复核中');
    expect(host.textContent).toContain('该订单不参与赠送');
    expect(host.querySelectorAll('.support-account-panel__order')).toHaveLength(rewardStatuses.length);
  });
});
