export const GROWTH_CLAIM_SOURCES = ['daily', 'growthTasks', 'achievements', 'weekly'] as const;

export type GrowthClaimSource = (typeof GROWTH_CLAIM_SOURCES)[number];
export type GrowthClaimBreakdown = Record<GrowthClaimSource, number>;

type ClaimableGroupLike = { count?: unknown } | null | undefined;
type ClaimableBreakdownLike = Partial<Record<GrowthClaimSource, ClaimableGroupLike>> | null | undefined;

const RECEIPT_SOURCE_MAP: Record<string, GrowthClaimSource> = {
  daily: 'daily',
  growthTask: 'growthTasks',
  achievement: 'achievements',
  weekly: 'weekly',
};

function emptyBreakdown(): GrowthClaimBreakdown {
  return { daily: 0, growthTasks: 0, achievements: 0, weekly: 0 };
}

function normalizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

/** 领取前以 claimable 接口的四类分组为唯一事实源。 */
export function resolveClaimableBreakdown(value: ClaimableBreakdownLike): GrowthClaimBreakdown {
  return {
    daily: normalizeCount(value?.daily?.count),
    growthTasks: normalizeCount(value?.growthTasks?.count),
    achievements: normalizeCount(value?.achievements?.count),
    weekly: normalizeCount(value?.weekly?.count),
  };
}

/** 领取后只统计服务端回执中真正 claimed 的项目，避免把重复领取或未完成项目算入提示。 */
export function resolveClaimedBreakdown(receipts: unknown): GrowthClaimBreakdown {
  const breakdown = emptyBreakdown();
  if (!Array.isArray(receipts)) return breakdown;

  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== 'object') continue;
    const item = receipt as { type?: unknown; status?: unknown };
    if (item.status !== 'claimed' || typeof item.type !== 'string') continue;
    const source = RECEIPT_SOURCE_MAP[item.type];
    if (source) breakdown[source] += 1;
  }
  return breakdown;
}

export function growthClaimBreakdownEntries(breakdown: GrowthClaimBreakdown) {
  return GROWTH_CLAIM_SOURCES.map((source) => ({ source, count: normalizeCount(breakdown[source]) })).filter(
    (item) => item.count > 0,
  );
}

export function growthClaimBreakdownTotal(breakdown: GrowthClaimBreakdown): number {
  return growthClaimBreakdownEntries(breakdown).reduce((sum, item) => sum + item.count, 0);
}
