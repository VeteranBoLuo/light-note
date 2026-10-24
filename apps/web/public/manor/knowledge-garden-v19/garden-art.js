// 庭院水域固定展示尺度：住进大鱼时不缩小其他住客，鱼的体长决定视觉比例。
const TANK_SHAPES = { normal: { k: 1, width: 2550 }, large: { k: 1, width: 2550 }, ocean: { k: 1, width: 2550 } };
const tankTier = (cm) => cm >= 150 ? "ocean" : cm >= 50 ? "large" : "normal";
function tankShape() { return { k: 1, width: 2550, aspect: 3 }; }
const fishDisplaySize = (cm) => cm <= 40 ? 0.63 * Math.pow(cm / 4, 0.4) : 0.63 * Math.pow(10, 0.4) * Math.pow(cm / 40, 0.65);
// 包含身体摆幅的安全边界；长身鱼使用直身素材，鳍与脊柱波额外留空。
function fishHalfHeight(kind) {
  const box = FISH_SPRITES[kind]?.box;
  const half = box ? Math.min(60, 100 * box[3] / box[2]) / 2 : 30;
  return half + (["eel", "oarfish", "ribboneel", "bichir"].includes(kind) ? 18 : 6);
}
function aquariumArt() {
  const id = "tank" + ++svgSerial;
  // 产肥位与观赏位共享当前模型的槽位顺序
  const fishes = [...state.fishSlots, ...(state.showSlots || [])].map((slot) => farmFish(slot));
  const largest = Math.max(0, ...fishes.map((f) => FISH[f?.kind]?.size || 0));
  const { k, width } = tankShape(tankTier(largest));
  const extra = width - 1536,
    glassRight = 1390 + extra;
  const residents = fishes
    .map((fish, i) => {
      if (!fish) return "";
      const info = FISH[fish.kind],
        cm = info.size,
        creature = info.group === "creature";
      // 舱体放大 k 倍，舱内坐标里的鱼就缩小 k 倍，屏幕上同一种鱼始终一样大；很小的水族按 6 cm 展示，免得看不见
      const scale = fishDisplaySize(creature ? Math.max(cm, 6) : cm) / k;
      // 鱼在中层错落分布；观赏位的水族按习性：趴底的在沙上，滑行的在中层，漂浮的在上层
      const farmCount = state.fishSlots.length,
        show = i - farmCount;
      const FISH_SPOTS = [
        [0.08, 0.36],
        [0.74, 0.56],
        [0.5, 0.74],
        [0.28, 0.58],
        [0.86, 0.3],
        [0.14, 0.4],
      ];
      const SHOW_SPOTS = {
        bottom: [[0.33, 1], [0.6, 1], [0.8, 1]],
        glide: [[0.44, 0.46], [0.58, 0.5], [0.3, 0.48]],
        drift: [[0.4, 0.22], [0.66, 0.26], [0.18, 0.28]],
      };
      const [fx, fy] = i < farmCount ? FISH_SPOTS[i % FISH_SPOTS.length] : SHOW_SPOTS[info.habitat || "drift"][show % 3];
      // 完整轮廓和游动范围都留在玻璃内
      const cx = Math.max(90 + 60 * scale, Math.min(glassRight - 10 - 60 * scale, 80 + (glassRight - 80) * fx));
      const halfH = fishHalfHeight(fish.kind) * scale;
      const cy = Math.max(110 + halfH, Math.min(930 - halfH, 110 + 820 * fy));
      const facing = creature ? 1 : i % 2 ? -1 : 1;
      return `<g class="tank-resident" data-fish="${fish.id}" data-species="${fish.kind}"${creature ? ` data-group="creature" data-habitat="${info.habitat}"` : ""} data-home-x="${fx}" data-home-y="${fy}" data-length="${cm}" data-half-height="${halfH.toFixed(3)}" data-scale="${scale.toFixed(3)}" data-cx="${Math.round(cx)}" data-cy="${Math.round(cy)}" data-facing="${facing}" transform="translate(${(cx - 50 * scale).toFixed(1)} ${(cy - 30 * scale).toFixed(1)}) scale(${scale.toFixed(3)})"><g class="aquarium-swimmer" style="--delay:-${i * 4}s"><g${facing < 0 ? ' transform="translate(100 0) scale(-1 1)"' : ""}>${fishIllustration(fish.kind)}</g></g></g>`;
    })
    .join("");
  return `<svg class="aquarium-art" viewBox="0 100 ${width} 850" preserveAspectRatio="none" data-water-top="110" data-water-bottom="930" data-glass-right="${glassRight}" data-k="${k}" aria-hidden="true"><defs><clipPath id="${id}fishclip"><path d="M80 110H${glassRight}V930H80Z"/></clipPath></defs><g clip-path="url(#${id}fishclip)">${residents}</g></svg>`;
}
function pondArt() {
  return `<svg class="pond-art" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><g class="sea-aim" fill="none" stroke="#f4fff4" stroke-width="2" vector-effect="non-scaling-stroke"><ellipse class="aim-ring" cx="430" cy="750" rx="55" ry="26"/></g><g class="fishing-tackle"><g class="rod-mount"><ellipse cy="2" rx="17" ry="5" fill="#3b382b44"/><path d="M-17-2 5-9 18-3-5 5Z" fill="#bd8647" stroke="#76522f" stroke-width="1"/><path d="M-17-2v4l12 7V5M-5 5 18-3v5L-5 9" fill="#865f36" stroke="#6e4c2d" stroke-width=".7"/><path d="M-5 0v-12q0-6 6-6t6 6V-3" fill="none" stroke="#674c2a" stroke-width="5"/><path d="M-5-1v-11q0-5 6-5t6 5v8" fill="none" stroke="#e3be69" stroke-width="2.7"/><circle cx="-10" cy="-1" r="1.2" fill="#e9cc85"/><circle cx="10" cy="-3" r="1.2" fill="#e9cc85"/></g><g class="rod-body"><path class="sea-rod" d="M650 260Q550 100 420 120" fill="none" stroke="#654325" stroke-width="5" vector-effect="non-scaling-stroke" stroke-linecap="round"/><path class="sea-rod-highlight" d="" fill="none" stroke="#e3c783" stroke-width=".8" vector-effect="non-scaling-stroke" stroke-linecap="round"/><path class="rod-grip" d="M650 260L625 215" stroke="#d1ae72" stroke-width="9" vector-effect="non-scaling-stroke" stroke-linecap="round"/><g class="rod-reel"><path d="M0-7v7" stroke="#5e4a2d" stroke-width="2"/><circle r="5.5" fill="#c49a4c" stroke="#655239" stroke-width="1.4"/><circle r="3" fill="#485c4a" stroke="#f1d78e" stroke-width=".9"/><path d="M3 2 8 6h3" stroke="#655239" stroke-width="1.8" fill="none"/><circle cx="11" cy="6" r="1.8" fill="#8c6236"/></g></g><g class="line-and-float"><path class="fishing-line" d="M420 120Q450 400 430 750" fill="none" stroke="#fff9e9" stroke-width="1.4" vector-effect="non-scaling-stroke"/><g class="sea-float" transform="translate(430 750)"><g class="float-size"><g class="bobber"><ellipse cy="1" rx="4" ry="1.3" fill="#164b5966"/><path d="M0-16V1" stroke="#eee5c8" stroke-width="1.2"/><path d="M0-16v5" stroke="#d95735" stroke-width="1.8" stroke-linecap="round"/><ellipse cy="-3" rx="3" ry="5" fill="#faf0d4" stroke="#80643a" stroke-width=".5"/><path d="M-2.9-4.5h5.8v3h-5.8Z" fill="#d65d41"/><path d="M-1-6v2" stroke="#fff" stroke-width=".8" stroke-linecap="round"/></g></g></g></g><g class="sea-ripples" transform="translate(430 750)" fill="none" stroke="#effff9b3"><g class="ripples-size"><ellipse class="cast-ring" rx="15" ry="4.5"/><ellipse class="cast-ring echo" rx="15" ry="4.5"/></g></g></g></svg>`;
}
function fruitArt(ripe = false, small = false) {
  const id = "fruit" + ++svgSerial;
  return `<svg viewBox="0 0 60 90" aria-hidden="true"><defs><radialGradient id="${id}" cx=".3" cy=".25" r=".8"><stop stop-color="${ripe ? "#fff0a1" : "#e3efa2"}"/><stop offset=".38" stop-color="${ripe ? "#f1c64f" : "#a8c459"}"/><stop offset=".8" stop-color="${ripe ? "#dba335" : "#82a248"}"/><stop offset="1" stop-color="${ripe ? "#b77e25" : "#567f3b"}"/></radialGradient></defs><path d="M1 6Q19 6 28 16" fill="none" stroke="#866145" stroke-width="3" stroke-linecap="round"/><path d="M27 13Q33 22 29 35" stroke="#665c32" fill="none" stroke-width="3" stroke-linecap="round"/><path d="M30 25Q44 10 51 21Q44 32 30 25" fill="#4d8135"/><path d="M30 25L45 21" stroke="#a0b65a" stroke-width=".8"/><path d="M29 32C40 27 54 40 53 57C52 75 42 86 29 85C14 85 6 72 7 55C7 39 17 29 29 32Z" fill="url(#${id})"/><path d="M20 40Q12 47 15 58" fill="none" stroke="#fffbd0" stroke-width="3" opacity=".6" stroke-linecap="round"/><path d="M28 82l3 1" stroke="#927436" stroke-width="1.5"/></svg>`;
}
