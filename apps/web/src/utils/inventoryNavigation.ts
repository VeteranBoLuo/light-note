import type { LocationQueryRaw } from 'vue-router';

export type InventoryTab = 'overview' | 'points';
export type RewardSection = 'inventory' | 'shop' | 'lottery';

export function isLegacyPointsReward(reward: unknown): boolean {
  return reward === 'ledger' || reward === 'center';
}

export function inventoryTabFromQuery(query: LocationQueryRaw): InventoryTab {
  return isLegacyPointsReward(query.reward) || query.inventoryTab === 'points' ? 'points' : 'overview';
}

export function rewardSectionFromQuery(query: LocationQueryRaw, fallback: RewardSection = 'inventory'): RewardSection {
  if (isLegacyPointsReward(query.reward)) return 'inventory';
  return query.reward === 'inventory' || query.reward === 'shop' || query.reward === 'lottery'
    ? query.reward
    : fallback;
}

/** 积分旧入口统一落在背包内；保留语言、渲染配置等无关 query。 */
export function inventoryPointsRoute(query: LocationQueryRaw = {}) {
  return {
    path: '/growth',
    query: { ...query, section: 'rewards', reward: 'inventory', inventoryTab: 'points' },
  };
}
