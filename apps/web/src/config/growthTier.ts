/**
 * 段位 tier(1~5)与徽章配色的单一事实源。
 *
 * 等级越高 tier 越大、配色越"贵重",升级动画也据此分级隆重度。
 * 原先 tierOf 阈值 + tier 渐变散落在 GrowthCard / RankLadder / PersonCenter / LevelUpOverlay
 * 各写一遍,改档位/配色要动四五处;现统一收口到这里,改一处即可。
 *
 * 注:LevelUpOverlay 的庆祝动画额外有光环/放射光/皇冠等特效(不止背景色),
 * 那部分特效仍在其组件内,但 tier 的"计算"一律走本文件的 tierOf。
 */

export type Tier = 1 | 2 | 3 | 4 | 5;

/** 据等级求 tier 档位(1~5) */
export function tierOf(level: number): Tier {
  const l = Number(level) || 1;
  return l >= 13 ? 5 : l >= 10 ? 4 : l >= 7 ? 3 : l >= 4 ? 2 : 1;
}

/** tier 徽章渐变背景(与升级动画徽章基础色一致) */
export const TIER_GRADIENTS: Record<Tier, string> = {
  1: 'linear-gradient(135deg, #6b7280, #9ca3af)',
  2: 'linear-gradient(135deg, #2563eb, #38bdf8)',
  3: 'linear-gradient(135deg, #7c3aed, #a855f7)',
  4: 'linear-gradient(135deg, #d97706, #fbbf24)',
  5: 'linear-gradient(135deg, #db2777, #f43f5e, #fb923c)',
};

/** 便捷:据等级直接取徽章渐变 */
export function tierGradient(level: number): string {
  return TIER_GRADIENTS[tierOf(level)];
}
