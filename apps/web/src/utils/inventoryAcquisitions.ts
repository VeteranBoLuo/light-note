import type { LotteryPrize } from '@/composables/useGrowth';

export type AcquisitionKind = 'all' | 'points' | 'ai_pack' | 'card' | 'storage';
export interface AcquisitionRecord {
  id: string;
  source: string;
  createdAt: string;
  results: LotteryPrize[];
  cost?: number;
}
