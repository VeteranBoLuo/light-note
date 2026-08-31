import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('积分资产入口与明细页契约', () => {
  const balanceSource = readSource('src/components/growth/PointsBalanceSummary.vue');
  const ledgerSource = readSource('src/components/growth/PointsLedger.vue');
  const desktopProfileSource = readSource('src/view/personCenter/PersonCenter.vue');
  const mobileProfileSource = readSource('src/view/personCenter/PersonCenterMobile.vue');
  const usagePageSource = readSource('src/view/pointsUsage/PointsUsagePage.vue');
  const zhLocaleSource = readSource('src/i18n/locales/zh-CN.ts');
  const enLocaleSource = readSource('src/i18n/locales/en-US.ts');

  it('桌面和移动个人中心都把积分与 AI 额度并列为可进入的资产卡', () => {
    for (const profileSource of [desktopProfileSource, mobileProfileSource]) {
      expect(profileSource).toContain('<PointsBalanceSummary');
      expect(profileSource).toContain('<AiQuotaSummary');
      expect(profileSource).toContain('@open-details="goPointsDetails"');
      expect(profileSource).toContain("router.push('/points-usage')");
    }
    expect(desktopProfileSource).toContain('class="profile-asset-grid"');
    expect(mobileProfileSource).toContain('class="profile-card__assets"');
    expect(desktopProfileSource).toMatch(/\.profile-asset-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
    expect(mobileProfileSource).toMatch(/\.profile-card__assets\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
    expect(desktopProfileSource).toContain(':loading="growthLoading"');
    expect(mobileProfileSource).toContain(':loading="growthLoading"');
  });

  it('积分摘要复用 BButton 和统一图标，并显式覆盖加载、不可用与详情跳转', () => {
    expect(icon.growth.coin).toBeTruthy();
    expect(icon.growth.coin).not.toBe(icon.nullImg);
    expect(balanceSource).toContain('<BButton');
    expect(balanceSource).toContain('icon.growth.coin');
    expect(balanceSource).toContain("t('personCenter.pointsLoading')");
    expect(balanceSource).toContain("t('personCenter.pointsUnavailable')");
    expect(balanceSource).toContain("'is-unavailable': unavailable");
    expect(balanceSource).toContain(':aria-busy="loading"');
    expect(balanceSource).toContain("'open-details': []");
    expect(balanceSource).toContain('min-height: 68px');
    expect(balanceSource).toContain("t('personCenter.pointsDetailHint')");
    expect(balanceSource).not.toContain('<BProgress');
    expect(balanceSource).not.toContain('text-overflow: ellipsis');
    expect(balanceSource).not.toContain('<button');
  });

  it('独立页面同时提供余额概览、知识工坊入口、可筛选账本和预扣结算说明', () => {
    expect(usagePageSource).toContain('growthApi.getPointsSummary()');
    expect(usagePageSource).toContain('<PointsLedger');
    expect(usagePageSource).toContain('summary.value?.week?.spent');
    expect(usagePageSource).toContain("return amount > 0 ? `-${amount.toLocaleString(locale.value)}` : '0';");
    expect(usagePageSource).toContain("t('growth.pointsUsageSettlementHint')");
    expect(usagePageSource).toContain(
      "router.push({ path: '/growth', query: { section: 'rewards', reward: 'shop' } })",
    );
    expect(usagePageSource).toContain("router.push('/toolbox')");
    expect(usagePageSource).toContain('icon.toolbox.home');
    expect(usagePageSource).toContain("t('growth.pointsUsageWorkshopAction')");
    expect(usagePageSource).toContain('<BCard');
    expect(usagePageSource).toContain('<BLoading');
  });

  it('知识工坊入口明确纯 AI 工具每次只选择一种结算介质', () => {
    expect(zhLocaleSource).toContain('纯 AI 工具可在执行前选择积分或 AI 额度');
    expect(zhLocaleSource).toContain('选择积分时本次只扣积分');
    expect(zhLocaleSource).not.toContain('前往知识工坊处理资料；每次执行只扣积分');
    expect(enLocaleSource).toContain('AI tools let you choose points or AI quota before each run');
    expect(enLocaleSource).not.toContain('Open Knowledge Workshop to process materials. Each run uses points only');
  });

  it('积分流水优先读取接口当前的 camelCase 时间字段，并兼容历史 snake_case', () => {
    expect(ledgerSource).toContain("row.createTime || row.create_time || ''");
    expect(ledgerSource).toContain('createTime?: string;');
    expect(ledgerSource).toContain('create_time?: string;');
  });
});
