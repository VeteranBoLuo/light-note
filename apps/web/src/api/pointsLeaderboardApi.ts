import { apiBaseGet } from '@/http/request';

export type LeaderboardType = 'week' | 'month' | 'total';
export type LeaderboardPeriod = 'current' | 'previous';

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  communityId: string | null;
  avatar: string | null;
  score: number;
  activeDays: number;
  qualified: boolean;
  isMe: boolean;
  champion: boolean;
  rewardSlot: number | null;
  rewardPoints: number;
  rewardState: 'none' | 'pending' | 'paid' | 'skipped';
}

export type LeaderboardRow = LeaderboardEntry | { rank: number; unavailable: true };

export interface LeaderboardData {
  board: LeaderboardType;
  phase: 'live' | 'closing' | 'settled';
  range: { start: string; end: string } | null;
  previousAvailable: boolean;
  canParticipate?: boolean;
  rows: LeaderboardRow[];
  mine: (LeaderboardEntry & { sources?: Record<string, number> }) | null;
  ownDays: number;
  total: number;
  scoreAtLastSeat?: number | null;
  weekly: { mode: 'observation' | 'reward'; qualifiedCount: number; slots: number; paidSlots: number } | null;
  rules: { limit: number; minimumScore: number; minimumDays: number; prizes: number[] };
}

export async function getPointsLeaderboard(board: LeaderboardType, period: LeaderboardPeriod, signal: AbortSignal) {
  const response = await apiBaseGet('/api/growth/leaderboard', { board, period }, { signal, silent: true });
  if (response.status !== 200 || !response.data) throw new Error('LEADERBOARD_LOAD_FAILED');
  return response.data as LeaderboardData;
}

export async function getWeeklyLeaderboardRank(signal: AbortSignal) {
  const response = await apiBaseGet('/api/growth/leaderboard/weekly-rank', {}, { signal, silent: true });
  if (response.status !== 200 || !response.data) throw new Error('LEADERBOARD_LOAD_FAILED');
  return response.data as { canParticipate: boolean; rank: number | null };
}
