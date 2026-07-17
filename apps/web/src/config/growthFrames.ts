// 头像框装扮样式:id → 可识别的视觉变体(商店预览、顶部佩戴处共用)。
// 与后端 SHOP_ITEMS 的 frame_* id 对应;后端管经济,前端管样式。
const VARIANTS: Record<string, 'gold' | 'sakura' | 'neon' | 'galaxy'> = {
  frame_gold: 'gold',
  frame_sakura: 'sakura',
  frame_neon: 'neon',
  frame_galaxy: 'galaxy',
};

// 对应可识别的视觉变体;未知/未佩戴装扮返回 null,避免错误渲染成某一款框体。
export function frameVariant(id?: string | null): 'gold' | 'sakura' | 'neon' | 'galaxy' | null {
  return id && VARIANTS[id] ? VARIANTS[id] : null;
}
