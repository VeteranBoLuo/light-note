/**
 * 当前「界面缩放」倍数 —— utils/savePreference.ts 的 applyDisplaySettings 给 <html> 设的 zoom(0.9 / 1 / 1.1),
 * 无缩放返回 1。
 *
 * 为什么浮层定位要用它:CSS zoom 会缩放整棵子树(含其中 fixed/absolute 后代的坐标系),
 * 而 getBoundingClientRect()/MouseEvent.clientX 返回的是"视觉视口坐标"(已含 zoom)。若把读到的视觉坐标
 * 直接写进 teleport 到 body 的 fixed/absolute 面板 top/left,面板会被 zoom 再缩放一次 → 双重缩放、错位
 * (偏移量随距视口左上角的距离线性增大)。
 *
 * 修法:写入 fixed/absolute 定位前,把 getBoundingClientRect/clientX 得到的视觉坐标 ÷ getRootZoom(),
 * 换算回 html 局部(布局)坐标。offsetWidth/offsetHeight/clientWidth/clientHeight 本就是布局像素、无需换算。
 */
export function getRootZoom(): number {
  const el = document.documentElement;
  const z = parseFloat(el.style.zoom || getComputedStyle(el).zoom || '1');
  return z && z > 0 ? z : 1;
}
