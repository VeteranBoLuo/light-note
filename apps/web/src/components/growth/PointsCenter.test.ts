import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const pointsGoal = readSource('src/components/growth/PointsGoal.vue');
const growthPage = readSource('src/view/growth/GrowthPage.vue');
const api = readSource('src/api/growthApi.ts');
const adminPanels = [
  'src/view/admin/components/pointsOps/PointsOps.vue',
  'src/view/admin/components/pointsOps/PointsGovernanceOverview.vue',
  'src/view/admin/components/pointsOps/PointsSourcesPanel.vue',
  'src/view/admin/components/pointsOps/PointsReconciliationPanel.vue',
  'src/view/admin/components/pointsOps/PointsCampaignPanel.vue',
  'src/view/admin/components/pointsOps/PointsSimulatorPanel.vue',
].map(readSource);
const pointsOps = readSource('src/view/admin/components/pointsOps/PointsOps.vue');
const governanceOverview = readSource('src/view/admin/components/pointsOps/PointsGovernanceOverview.vue');

describe('积分目标与治理界面防回归', () => {
  it('积分目标只通过服务端目录保存，估算明确采用稳定收入且支持低压力模式', () => {
    expect(pointsGoal).toContain('summary.value?.goalOptions');
    expect(pointsGoal).toContain('saveGoal(true)');
    expect(pointsGoal).toContain('pointsCenterGoalDisclaimer');
    expect(pointsGoal).toContain('summary.lowPressureMode');
    expect(pointsGoal).toContain('pointsCenterGoalLowPressure');
    expect(pointsGoal).not.toMatch(/<input\b|<select\b/u);
    expect(api).toContain('/growth/preferences/points-goal');
    expect(api).toContain('/growth/points/summary');
  });

  it('成长页的积分摘要与兑换目标遵循服务端功能开关', () => {
    expect(growthPage).toContain('features?.pointsCenter');
    expect(growthPage).toContain(':show-summary="pointsCenterEnabled"');
    expect(growthPage).toContain(':show-goal="pointsCenterEnabled"');
  });

  it('新增样式全部 scoped，后台只使用自研 B 组件且不新增全局根样式', () => {
    expect(pointsGoal).toMatch(/<style[^>]*scoped/u);
    for (const source of adminPanels) {
      expect(source).toMatch(/<style[^>]*scoped/u);
      expect(source).not.toMatch(/<(?:input|select|table)\b/u);
      expect(source).not.toMatch(/<a-[a-z]/u);
    }
  });

  it('积分健康趋势提供精确数值提示，余额 Top 20 可进入用户 360 查账', () => {
    expect(governanceOverview).toContain('<BTooltip');
    expect(governanceOverview).toContain('trendTooltip(item)');
    expect(governanceOverview).toContain('当前积分余额 Top 20');
    expect(governanceOverview).toContain('@row-click="openUser"');
    expect(pointsOps).toContain('@select-user="openUser360"');
    expect(pointsOps).toContain("activeTab.value = 'user360'");
  });
});
