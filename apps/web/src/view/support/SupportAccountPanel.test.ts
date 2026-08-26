import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { AfdianSupportOrder, AfdianSupportState } from '@/api/supportApi';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

import SupportAccountPanel from './SupportAccountPanel.vue';

function supportOrder(id: string, purpose: 'legacy_support' | 'donation'): AfdianSupportOrder {
  return {
    id,
    amount: '6.00',
    month: 1,
    productType: 0,
    optionKey: 'coffee',
    ownershipSource: 'checkout',
    orderPurpose: purpose,
    confirmedAt: '2026-08-25 12:00:00',
    rewardStatus: purpose === 'legacy_support' ? 'credited' : 'no_entitlement',
    rewardReasonCode: purpose === 'legacy_support' ? null : 'pure_support_no_entitlement',
    rewardTokens: purpose === 'legacy_support' ? 600_000 : 0,
    grantedTokens: purpose === 'legacy_support' ? 600_000 : 0,
    rewardStorageMb: 0,
    grantedStorageMb: 0,
    intentType: purpose === 'donation' ? 'donation' : 'legacy',
    skuId: null,
    firstPurchaseApplied: false,
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

describe('纯赞助账号面板', () => {
  it('只展示支持金额、笔数和用途标识，不把旧赠送或商店权益混入当前规则', async () => {
    const state: AfdianSupportState = {
      authenticated: true,
      oauthAvailable: true,
      orderSyncAvailable: true,
      linked: true,
      linkedAt: '2026-08-25 10:00:00',
      providerAccount: { name: '测试支持者', avatarUrl: null },
      orderCount: 2,
      totalAmount: '12.00',
      lastSupportAt: '2026-08-25 12:00:00',
      publicPreference: { participateInRanking: true, showIdentity: false, adminHidden: false },
      recentOrders: [supportOrder('new-donation', 'donation'), supportOrder('legacy-support', 'legacy_support')],
    };
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(SupportAccountPanel, { state, unlinking: false, preferenceSaving: false });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    await nextTick();

    expect(host.textContent).toContain('¥12.00');
    expect(host.textContent).toContain('赞助已确认');
    expect(host.textContent).toContain('历史支持 · 已按旧规则处理');
    expect(host.textContent).toContain('当前以匿名支持者展示');
    expect(host.textContent).not.toContain('永久 AI');
    expect(host.textContent).not.toContain('永久空间');
    expect(host.textContent).not.toContain('+60万');
    expect(host.querySelectorAll('.support-account-panel__order')).toHaveLength(2);
  });
});
