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
    const rewards = {
      exp: Number(result.exp || 0),
      points: Number(result.points || 0),
      frames: Array.isArray(result.frames) ? result.frames.length : 0,
    };
    if (sources) {
      return t(rewards.frames ? 'growth.claimAllSuccessBySourceWithFrames' : 'growth.claimAllSuccessBySource', {
        sources,
        ...rewards,
      });
    }
    return t(rewards.frames ? 'growth.claimAllSuccessWithFrames' : 'growth.claimAllSuccess', {
      n: Number(result.claimed || 0),
      ...rewards,
    });
  }

  return {
    achievementClaimableCount,
    claimAllTooltip,
    snapshotClaimableBreakdown,
    claimSuccessMessage,
  };
}
