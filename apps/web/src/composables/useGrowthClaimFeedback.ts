import { computed, onBeforeUnmount, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GrowthClaimable } from '@/composables/useGrowth';
import {
  growthClaimBreakdownEntries,
  growthClaimBreakdownTotal,
  resolveClaimableBreakdown,
  resolveClaimedBreakdown,
  type GrowthClaimBreakdown,
} from '@/utils/growthClaimFeedback';

export interface GrowthClaimReceipt {
  /** 只有一个来源的一项奖励。 */
  single: boolean;
  summary: string;
  /** 完整来源说明，例如「成长任务 ×1、成就 ×1」。 */
  sources: string;
  rewards: Array<{ kind: 'exp' | 'points' | 'frames'; value: number; label: string }>;
}

export type ClaimReceiptState = GrowthClaimReceipt & { id: number };

/**
 * 领取回执的展示状态：在触发领取的卡片里原位展示，一段时间后自动收起，也可手动关闭。
 * 成长页「今天」卡片与工作台成长卡共用。
 */
export function useTransientClaimReceipt(durationMs = 12000) {
  const receipt = ref<ClaimReceiptState | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    receipt.value = null;
  }
  function show(value: GrowthClaimReceipt) {
    if (timer) clearTimeout(timer);
    receipt.value = { ...value, id: Date.now() };
    timer = setTimeout(() => {
      timer = undefined;
      receipt.value = null;
    }, durationMs);
  }
  onBeforeUnmount(clear);
  return { receipt, show, clear };
}

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

  type ClaimAllResult = { receipts?: unknown; claimed?: number; exp?: number; points?: number; frames?: unknown[] };

  /** 一键领取的结构化回执：来源统计以服务端回执为准，奖励只列实际入账的维度。 */
  function claimReceipt(result: ClaimAllResult, fallback: GrowthClaimBreakdown): GrowthClaimReceipt {
    const receiptBreakdown = resolveClaimedBreakdown(result.receipts);
    const claimedBreakdown = growthClaimBreakdownTotal(receiptBreakdown) > 0 ? receiptBreakdown : fallback;
    const entries = growthClaimBreakdownEntries(claimedBreakdown);
    const total = growthClaimBreakdownTotal(claimedBreakdown) || Number(result.claimed || 0);
    const single = entries.length === 1 && entries[0].count === 1;
    const rewards = (
      [
        ['exp', Number(result.exp || 0)],
        ['points', Number(result.points || 0)],
        ['frames', Array.isArray(result.frames) ? result.frames.length : 0],
      ] as const
    )
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .map(([kind, value]) => ({ kind, value, label: t(`growth.claimRewards.${kind}`, { n: value }) }));
    return {
      single,
      summary: single ? t(`growth.claimSingleSources.${entries[0].source}`) : t('growth.claimAllSuccess', { n: total }),
      sources: formatSources(claimedBreakdown),
      rewards,
    };
  }

  function claimSuccessMessage(result: ClaimAllResult, fallback: GrowthClaimBreakdown): string {
    const receipt = claimReceipt(result, fallback);
    const summary =
      receipt.single || !receipt.sources
        ? receipt.summary
        : t('growth.claimAllSuccessBySource', { sources: receipt.sources });
    const rewardText = receipt.rewards.map((reward) => reward.label).join(t('growth.claimRewardSeparator'));
    if (!rewardText) return summary;
    // 批量领取把来源和奖励分行，窄屏不会把最后一个奖励数值挤成孤行。
    return receipt.single ? [summary, rewardText].join(t('growth.claimRewardSeparator')) : `${summary}\n${rewardText}`;
  }

  return {
    achievementClaimableCount,
    claimAllTooltip,
    snapshotClaimableBreakdown,
    claimSuccessMessage,
    claimReceipt,
  };
}
