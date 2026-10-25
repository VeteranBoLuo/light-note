import type { LotteryPrize } from '@/composables/useGrowth';
import icon from '@/config/icon';
import { formatAiTokens } from './growthAssetChange';

export interface LotteryRecord {
  id: string;
  mode: 'free' | 'paid';
  cost: number;
  createdAt: string;
  results: LotteryPrize[];
}

type Translate = (key: string, params?: Record<string, string | number>) => string;
export const prizeIcon = (prize: LotteryPrize) =>
  ({ points: icon.growth.coin, storage: icon.growth.storage, card: icon.growth.checkin, ai_pack: icon.growth.ai })[
    prize.kind
  ];

export function prizeValue(prize: LotteryPrize, locale: string) {
  if (prize.kind === 'ai_pack') return `+${formatAiTokens(prize.amount, locale)}`;
  if (prize.kind === 'card') return `×${prize.amount.toLocaleString(locale)}`;
  if (prize.kind === 'storage')
    return `+${prize.amount >= 1024 ? `${+(prize.amount / 1024).toFixed(1)}GB` : `${prize.amount}MB`}`;
  return `+${prize.amount.toLocaleString(locale)}`;
}

export function prizeKindLabel(prize: LotteryPrize, t: Translate) {
  return t(`growth.lotteryPrizeKinds.${prize.kind}`);
}

export function prizeLabel(prize: LotteryPrize, t: Translate, locale: string) {
  if (prize.kind === 'points') return t('growth.prizePoints', { n: prize.amount });
  if (prize.kind === 'ai_pack') return t('growth.prizeAiAmount', { n: formatAiTokens(prize.amount, locale) });
  if (prize.kind === 'card') return t('growth.prizeCard', { n: prize.amount });
  return t('growth.prizeStorage', {
    n: prize.amount >= 1024 ? `${+(prize.amount / 1024).toFixed(1)}GB` : `${prize.amount}MB`,
  });
}

export function recordLabel(record: LotteryRecord, t: Translate) {
  return t(
    record.mode === 'free'
      ? 'growth.lotteryFreePoolTab'
      : record.results.length === 10
        ? 'growth.lotteryPaidTen'
        : 'growth.lotteryPaidOne',
  );
}
