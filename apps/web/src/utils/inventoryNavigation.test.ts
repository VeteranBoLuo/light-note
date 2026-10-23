import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import commonRouter from '@/router/modules/common';
import { inventoryPointsRoute, inventoryTabFromQuery, rewardSectionFromQuery } from './inventoryNavigation';

describe('背包积分入口兼容', () => {
  it.each(['ledger', 'center'])('旧 %s 入口选中背包的积分明细，其他奖励入口保持原去向', (reward) => {
    expect(rewardSectionFromQuery({ reward })).toBe('inventory');
    expect(inventoryTabFromQuery({ reward })).toBe('points');
    expect(inventoryPointsRoute({ reward, renderProfile: 'mobile' })).toEqual({
      path: '/growth',
      query: { section: 'rewards', reward: 'inventory', inventoryTab: 'points', renderProfile: 'mobile' },
    });
  });
  it('新入口显式选择页签，非法或数组参数回到合法默认状态', () => {
    expect(inventoryTabFromQuery({ reward: 'inventory', inventoryTab: 'points' })).toBe('points');
    expect(inventoryTabFromQuery({ inventoryTab: 'invalid' })).toBe('overview');
    expect(inventoryTabFromQuery({ inventoryTab: ['points', 'overview'] })).toBe('overview');
    expect(rewardSectionFromQuery({ reward: ['ledger', 'lottery'] })).toBe('inventory');
    expect(rewardSectionFromQuery({ reward: 'invalid' }, 'shop')).toBe('shop');
    for (const reward of ['inventory', 'lottery', 'shop'] as const) {
      expect(rewardSectionFromQuery({ reward })).toBe(reward);
    }
  });
  it.each(['/points-usage', { name: 'pointsUsage' }])('独立旧入口 %j 重定向一次，返回恢复来源页', async (entry) => {
    const record = commonRouter.find((route) => route.name === 'pointsUsage')!;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        record,
        { path: '/source', component: { render: () => null } },
        { path: '/growth', component: { render: () => null } },
      ],
    });
    await router.push('/source');
    await router.push(entry);
    expect(router.currentRoute.value.path).toBe('/growth');
    expect(router.currentRoute.value.query).toEqual({
      section: 'rewards',
      reward: 'inventory',
      inventoryTab: 'points',
    });
    const returned = new Promise<void>((resolve) => {
      const stop = router.afterEach(() => {
        stop();
        resolve();
      });
    });
    router.back();
    await returned;
    expect(router.currentRoute.value.path).toBe('/source');
  });
});
