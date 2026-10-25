/* 海边庭院：海面落点与起竿位置。钓获仍交给 GardenModel。 */
const GardenCourtyard = (() => {
  let root = null, cursor = "";
  const mobile = () => document.documentElement.classList.contains("light-note-mobile-rendering");
  function fishingGeometry(isMobile) {
    // 种田底图：码头位置来自标定（舞台按当前端型换算）
    const staged = typeof FarmStage !== "undefined" ? FarmStage.pier() : null;
    if (staged) return staged;
    return isMobile
      ? { origin: [740, 750], tip: [650, 100], center: [680, 300], radius: [290, 130] }
      : { origin: [650, 260], tip: [420, 120], center: [430, 750], radius: [400, 210] };
  }
  // 可抛竿水面（多边形）：点在里面就落在原处；点在外面取轮廓上最近的点，再往默认落点收进水里
  function inside(x, y, poly) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  function nearest(x, y, poly) {
    let best = poly[0], bd = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + dx * t, py = ay + dy * t, dd = (px - x) ** 2 + (py - y) ** 2;
      if (dd < bd) { bd = dd; best = [px, py]; }
    }
    return best;
  }
  function landing(x, y, geometry) {
    const { center, radius, region } = geometry;
    const avoid=point=>{
      const blocked=p=>geometry.obstacles?.some(poly=>inside(...p,poly));
      const valid=p=>!blocked(p)&&(!region||inside(...p,region));
      if(valid(point))return point;
      let [px,py]=point;
      for(let i=0;i<32&&!valid([px,py]);i++){px+=(center[0]-px)*.12;py+=(center[1]-py)*.12;}
      return valid([px,py])?[px,py]:[...center];
    };
    if (region) {
      if (inside(x, y, region)) return avoid([x, y]);
      let [px, py] = nearest(x, y, region);
      for (let i = 0; i < 12 && !inside(px, py, region); i++) { px += (center[0] - px) * .08; py += (center[1] - py) * .08; }
      return avoid(inside(px, py, region) ? [px, py] : [...center]);
    }
    const dx = (x - center[0]) / radius[0], dy = (y - center[1]) / radius[1];
    const k = Math.max(1, Math.hypot(dx, dy) / .88);
    return avoid([center[0] + dx * radius[0] / k, center[1] + dy * radius[1] / k]);
  }
  function paintAim(pond, point, phase = "idle") {
    const g = fishingGeometry(mobile());
    const matrix = pond.querySelector(".pond-art").getScreenCTM();
    const sx = Math.hypot(matrix?.a || 1, matrix?.b || 0), sy = Math.hypot(matrix?.c || 0, matrix?.d || 1);
    // 内层一单位对应一个屏幕像素，避免视口放大或非等比舞台让浮漂变胖。
    pond.querySelector(".float-size").setAttribute("transform", `scale(${1 / sx} ${1 / sy})`);
    pond.querySelector(".ripples-size").setAttribute("transform", `scale(${1 / sx} ${1 / sy})`);
    const [x, y] = landing(...point, g), [ox, oy] = g.origin;
    const tug = phase === "bite" ? 55 : 0;
    const tip = [g.tip[0] + (x - g.center[0]) * .2, g.tip[1] + tug];
    pond.dataset.landing = `${x.toFixed(1)},${y.toFixed(1)}`;
    const control=g.rodControl||[(ox+tip[0])/2,tip[1]-90],curve=`M${ox} ${oy}Q${control[0]} ${control[1]} ${tip[0]} ${tip[1]}`;
    pond.querySelector(".sea-rod").setAttribute("d",curve);
    pond.querySelector(".sea-rod-highlight").setAttribute("d",curve);
    const length=Math.hypot((control[0]-ox)*sx,(control[1]-oy)*sy)||1;
    const grip=[ox+(control[0]-ox)*22/length,oy+(control[1]-oy)*22/length];
    pond.querySelector(".rod-grip").setAttribute("d",`M${ox} ${oy}L${grip[0]} ${grip[1]}`);
    pond.querySelector(".rod-mount").setAttribute("transform",`translate(${ox} ${oy}) scale(${(g.mountScale||1)/sx} ${(g.mountScale||1)/sy})`);
    pond.querySelector(".rod-reel").setAttribute("transform",`translate(${ox+(grip[0]-ox)*.7+4/sx} ${oy+(grip[1]-oy)*.7}) scale(${1/sx} ${1/sy})`);
    pond.querySelector(".fishing-line").setAttribute("d", `M${tip[0]} ${tip[1]}Q${x} ${(tip[1] + y) / 2} ${x} ${y - 16 / sy}`);
    pond.querySelector(".sea-float").setAttribute("transform", `translate(${x} ${y})`);
    pond.querySelector(".sea-ripples").setAttribute("transform", `translate(${x} ${y})`);
    const ring = pond.querySelector(".aim-ring");
    ring.setAttribute("cx", x); ring.setAttribute("cy", y);
    ring.setAttribute("rx", 15 / sx); ring.setAttribute("ry", 4.5 / sy);
  }
  function aimAtPointer(event) {
    const pond = document.querySelector("#pondSpot"), svg = pond?.querySelector(".pond-art");
    if (!svg || pond.classList.contains("casting")) return;
    // SVG 的实际屏幕矩阵包含舞台缩放、端型与视口偏移，不能假设它高宽相同。
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    paintAim(pond, [local.x, local.y]);
  }
  function mount() {
    const scene = document.querySelector(".garden-scene");
    if (!scene) { root = null; GardenEnvironment.mount(null); GardenLife.mount(null); return; }
    const pond = scene.querySelector("#pondSpot");
    const img = scene.querySelector(".garden-backdrop");
    // 种田底图（含出血）与水域遮罩；舞台负责缩放居中与各区域定位
    const cal = FarmStage.cal();
    const source = `knowledge-garden-v19/${cal.asset}`;
    if (img.getAttribute("src") !== source) img.src = source;
    img.dataset.water = `knowledge-garden-v19/${cal.water}`;
    img.dataset.smooth = `knowledge-garden-v19/${cal.smooth}`;
    img.dataset.fishingWater = String(cal.area!=="garden");
    FarmStage.mount(scene);
    const nextProfile = mobile() ? "mobile" : "desktop";
    if (pond.dataset.profile !== nextProfile && FarmStage.pier()) {
      pond.dataset.profile = nextProfile;
      paintAim(pond, fishingGeometry(mobile()).center);
    }
    GardenEnvironment.mount(scene);
    GardenLife.mount(scene);
    if (root === scene) return;
    root = scene;
    if (!cursor) {
      const c = document.createElement("canvas"); c.width = c.height = 40;
      const ctx = c.getContext("2d");
      ctx.lineCap = "round"; ctx.strokeStyle = "#fff8df"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(5, 34); ctx.quadraticCurveTo(14, 5, 31, 5); ctx.stroke();
      ctx.strokeStyle = "#74502a"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = "#fffdf4"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(31, 5); ctx.lineTo(31, 27); ctx.stroke();
      ctx.fillStyle = "#e6734e"; ctx.beginPath(); ctx.ellipse(31, 28, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
      cursor = `url("${c.toDataURL()}") 31 28, crosshair`;
    }
    const hit = pond.querySelector(".pond-hit"); hit.style.cursor = cursor;
    hit.addEventListener("pointermove", (e) => {
      if (pond.classList.contains("casting") || e.pointerType === "touch") return;
      aimAtPointer(e);
    });
    // 触屏没有悬停：按下时就把落点定在手指处，随后的点击从这里抛竿
    hit.addEventListener("pointerdown", (e) => {
      aimAtPointer(e);
    });
    hit.addEventListener("focus", () => {
      // 指针按下后浏览器才派发 focus；不能在这里覆盖刚选好的落点。
      if (document.documentElement.classList.contains("kbd-nav") && !pond.classList.contains("casting")) paintAim(pond, fishingGeometry(mobile()).center);
    });
  }
  function refreshAim() {
    const pond = document.querySelector("#pondSpot");
    if (pond) paintAim(pond, pond.dataset.landing?.split(",").map(Number) || fishingGeometry(mobile()).center, pond.dataset.phase || "idle");
  }
  function updateFishing(phase) {
    const pond = document.querySelector("#pondSpot");
    if (!pond) return;
    pond.querySelector(".pond-hit").style.cursor = cursor;
    // 水面的反馈由浮漂下沉、涟漪和竿梢表达；文字由主热区和 live 播报提供。
    paintAim(pond, pond.dataset.landing?.split(",").map(Number) || fishingGeometry(mobile()).center, phase);
  }
  return { refreshAim, mount, updateFishing, fishingGeometry, landing, aimAtPointer };
})();
if (typeof module !== "undefined") module.exports = GardenCourtyard;
