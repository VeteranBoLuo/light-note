// 头像框装扮样式:id → 环形渐变(唯一样式源,商店预览与佩戴处共用)。
// 与后端 SHOP_ITEMS 的 frame_* id 对应;后端管经济,前端管样式。
const RINGS: Record<string, string> = {
  frame_gold: 'linear-gradient(135deg,#fde68a,#f59e0b,#b45309)',
  frame_sakura: 'linear-gradient(135deg,#fbcfe8,#f472b6,#db2777)',
  frame_neon: 'linear-gradient(135deg,#22d3ee,#3b82f6,#a855f7)',
  frame_galaxy: 'conic-gradient(from 0deg,#6366f1,#22d3ee,#a855f7,#f472b6,#6366f1)',
};

// 返回该装扮的环形背景;无/未知返回 null
export function frameRing(id?: string | null): string | null {
  return id && RINGS[id] ? RINGS[id] : null;
}

// 头像/徽章外层包裹样式:有框则渲染渐变环 + 内边距,无框返回空对象(不影响布局)
export function frameWrapStyle(id?: string | null, pad = 3): Record<string, string> {
  const ring = frameRing(id);
  if (!ring) return {};
  return { background: ring, padding: `${pad}px`, borderRadius: '50%', display: 'inline-flex' };
}
