import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const growthPageSource = read('src/view/growth/GrowthPage.vue');
const weeklySource = read('src/components/growth/WeeklyChallenge.vue');
const tasksSource = read('src/components/growth/GrowthTasks.vue');
const navigationSource = read('src/utils/growthNavigation.ts');

describe('成长领取状态与入口契约', () => {
  it('已领取和已完成状态使用存在的成功图标，不再落入默认地球图标', () => {
    expect(weeklySource).toContain('icon.message.success');
    expect(tasksSource).toContain('icon.message.success');
    expect(`${weeklySource}\n${tasksSource}`).not.toContain('icon.common.check');
  });

  it('成长模块的资源整理入口在移动端明确进入资源中心待整理分区', () => {
    expect(growthPageSource).toContain('resolveGrowthActionRoute(action, bookmark.isMobile)');
    expect(growthPageSource).toContain('resolveWeeklyChallengeRoute(step.metric, bookmark.isMobile)');
    expect(tasksSource).toContain('resolvePendingResourcesRoute(bookmark.isMobile)');
    // 每周挑战与周报共用 growthNavigation 的指标路由，整理类指标在其中进入待整理分区。
    expect(weeklySource).toContain('resolveWeeklyChallengeRoute(challenge.metric, bookmark.isMobile)');
    expect(navigationSource).toMatch(/metric === 'organize'[\s\S]*?resolvePendingResourcesRoute\(isMobile\)/);
  });
});
