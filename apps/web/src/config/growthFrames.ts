// 头像框装扮样式:id → 可识别的视觉变体(商店预览、顶部佩戴处共用)。
// 与后端 SHOP_ITEMS 的 frame_* id 对应;后端管经济,前端管样式。
export const FRAME_VARIANTS = {
  frame_mint: 'mint',
  frame_ink: 'ink',
  frame_gold: 'gold',
  frame_sakura: 'sakura',
  frame_neon: 'neon',
  frame_sunset: 'sunset',
  frame_ocean: 'ocean',
  frame_aurora: 'aurora',
  frame_galaxy: 'galaxy',
  frame_flame: 'flame',
  frame_dragon: 'dragon',
  frame_celestial: 'celestial',
} as const;

export type FrameId = keyof typeof FRAME_VARIANTS;
export type FrameVariant = (typeof FRAME_VARIANTS)[FrameId];

export const FRAME_IDS = Object.freeze(Object.keys(FRAME_VARIANTS) as FrameId[]);

// 对应可识别的视觉变体;未知/未佩戴装扮返回 null,避免错误渲染成某一款框体。
export function frameVariant(id?: string | null): FrameVariant | null {
  return id && id in FRAME_VARIANTS ? FRAME_VARIANTS[id as FrameId] : null;
}
