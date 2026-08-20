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

  function claimSuccessMessage(receipts: unknown, fallback: GrowthClaimBreakdown): string {
    const receiptBreakdown = resolveClaimedBreakdown(receipts);
    const claimedBreakdown = growthClaimBreakdownTotal(receiptBreakdown) > 0 ? receiptBreakdown : fallback;
    const sources = formatSources(claimedBreakdown);
    return sources ? t('growth.claimAllSuccessBySource', { sources }) : '';
  }

  return {
    achievementClaimableCount,
    claimAllTooltip,
    snapshotClaimableBreakdown,
    claimSuccessMessage,
  };
}
