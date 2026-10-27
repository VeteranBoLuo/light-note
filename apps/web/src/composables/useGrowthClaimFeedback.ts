import { computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GrowthClaimable } from '@/composables/useGrowth';
import {
  growthClaimBreakdownEntries,
  growthClaimBreakdownTotal,
  resolveClaimableBreakdown,
  resolveClaimedBreakdown,
  type GrowthClaimBreakdown,
} from '@/utils/growthClaimFeedback';

export function useGrowthClaimFeedback(claimable: Readonly<Ref<GrowthClaimable | null>>) {
  const { t } = useI18n();
  const breakdown = computed(() => resolveClaimableBreakdown(claimable.value));
  const achievementClaimableCount = computed(() => breakdown.value.achievements);

  function formatSources(value: GrowthClaimBreakdown): string {
    return growthClaimBreakdownEntries(value)
      .map(({ source, count }) => t(`growth.claimSources.${source}`, { n: count }))
      .join(t('growth.claimSourceSeparator'));
  }

  const claimAllTooltip = computed(() => {
    const sources = formatSources(breakdown.value);
    const total = Number(claimable.value?.count || growthClaimBreakdownTotal(breakdown.value));
    return sources ? t('growth.claimAllTooltip', { sources }) : t('growth.claimAllTooltipFallback', { n: total });
  });

  function snapshotClaimableBreakdown(): GrowthClaimBreakdown {
    return { ...breakdown.value };
  }

  function claimSuccessMessage(
    result: { receipts?: unknown; claimed?: number; exp?: number; points?: number; frames?: unknown[] },
    fallback: GrowthClaimBreakdown,
  ): string {
    const receiptBreakdown = resolveClaimedBreakdown(result.receipts);
    const claimedBreakdown = growthClaimBreakdownTotal(receiptBreakdown) > 0 ? receiptBreakdown : fallback;
    const sources = formatSources(claimedBreakdown);
    const rewards: string[] = [];
    for (const [kind, value] of [
      ['exp', Number(result.exp || 0)],
      ['points', Number(result.points || 0)],
      ['frames', Array.isArray(result.frames) ? result.frames.length : 0],
    ] as const) {
      if (Number.isFinite(value) && value > 0) rewards.push(t(`growth.claimRewards.${kind}`, { n: value }));
    }
    const entries = growthClaimBreakdownEntries(claimedBreakdown);
    const single = entries.length === 1 && entries[0].count === 1;
    const summary = single
      ? t(`growth.claimSingleSources.${entries[0].source}`)
      : sources
        ? t('growth.claimAllSuccessBySource', { sources })
        : t('growth.claimAllSuccess', { n: Number(result.claimed || 0) });
    const rewardText = rewards.join(t('growth.claimRewardSeparator'));
    if (!rewardText) return summary;
    // 批量领取把来源和奖励分行，窄屏不会把最后一个奖励数值挤成孤行。
    return single ? [summary, rewardText].join(t('growth.claimRewardSeparator')) : `${summary}\n${rewardText}`;
  }

  return {
    achievementClaimableCount,
    claimAllTooltip,
    snapshotClaimableBreakdown,
    claimSuccessMessage,
  };
}
