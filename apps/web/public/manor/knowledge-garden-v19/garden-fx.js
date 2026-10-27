/* v19 庄园动效：环境氛围 + 操作反馈。
   - 全部遵循「减少动态效果」：开启后不挂载环境动效，反馈改为即时更新
   - 页面切到后台时暂停环境动效与定时器，避免挂着耗电 */
const GardenFX = (() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let layer = null;
  let ambient = null;

  function fxLayer() {
    if (!layer || !layer.isConnected) {
      layer = document.createElement("div");
      layer.className = "fx-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
    }
    return layer;
  }
  function center(target) {
    const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  function bump(el) {
    if (!el) return;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
  function countTo(el, from, to, ms = 700) {
    if (!el) return;
    if (reduced() || from === to) {
      el.textContent = to;
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      if (!el.isConnected) return;
      const p = Math.min(1, (now - start) / ms);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // 物品沿弧线飞向 HUD 目标，到达后目标弹一下
  function flyTo(from, toEl, html, { size = 40, delay = 0, lift = 120 } = {}) {
    // 不向禁用的背景控件播放领取动画。
    if (toEl?.closest?.("[inert]")) return Promise.resolve();
    if (!toEl || reduced()) {
      bump(toEl);
      return Promise.resolve();
    }
    // 底栏按钮还包含文字；飞到图标中心，不能把整张原始素材当作飞行物。
    const targetArt = toEl.querySelector?.(".dock-disc, .farm-tool-icon") || toEl;
    const a = center(from),
      b = center(targetArt);
    if (!a.w || !a.h || !b.w || !b.h) return Promise.resolve();
    const node = document.createElement("div");
    node.className = "fly-item";
    node.style.cssText = `width:${size}px;height:${size}px;left:${a.x - size / 2}px;top:${a.y - size / 2}px`;
    node.innerHTML = html;
    fxLayer().append(node);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const peak = Math.min(dy, 0) - lift;
    const frames = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
      // 二次贝塞尔：起点 → 上抛控制点 → 终点
      const x = 2 * (1 - t) * t * (dx * 0.35) + t * t * dx;
      const y = 2 * (1 - t) * t * peak + t * t * dy;
      const s = 1 + 0.25 * Math.sin(Math.PI * t) - 0.5 * t * t;
      return { transform: `translate(${x}px,${y}px) scale(${s})`, opacity: t > 0.92 ? 0.6 : 1 };
    });
    const anim = node.animate(frames, { duration: 820, delay, easing: "cubic-bezier(.4,.1,.3,1)", fill: "both" });
    return anim.finished
      .catch(() => {})
      .then(() => {
        node.remove();
        // 收获会重画底栏，结束时反馈到仍在页面里的同一个入口。
        const dock = toEl.dataset?.dock;
        bump(dock ? document.querySelector(`[data-dock="${dock}"]`) : toEl);
      });
  }

  function floatText(from, text, cls = "") {
    if (!from || from.isConnected === false || (reduced() && cls !== "harvest-xp")) return;
    const a = center(from);
    const node = document.createElement("div");
    node.className = `float-text ${cls}`;
    node.textContent = text;
    node.style.left = a.x + "px";
    node.style.top = a.y + "px";
    fxLayer().append(node);
    setTimeout(() => node.remove(), cls === "harvest-xp" ? 1800 : 1500);
  }

  function harvestPlot(rect,src) {
    if(!rect||!src||reduced())return;
    const image=document.createElement("img");image.className="fx-harvest-crop";image.src=src;
    Object.assign(image.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    fxLayer().append(image);setTimeout(()=>image.remove(),650);
  }
  function catchLaunch(point,width,height) {
    const x=Math.max(84,Math.min(width-84,point.x)),y=Math.max(110,Math.min(height-72,point.y));
    return {x,y,rise:Math.min(150,Math.max(32,y-76))};
  }

  function burst(from, { count = 14, kind = "spark", spread = 90 } = {}) {
    if (reduced()) return;
    const a = center(from);
    for (let i = 0; i < count; i++) {
      const p = document.createElement("i");
      p.className = `particle ${kind}`;
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = spread * (0.55 + Math.random() * 0.6);
      p.style.left = a.x + "px";
      p.style.top = a.y + "px";
      p.style.setProperty("--tx", `${Math.cos(ang) * dist}px`);
      p.style.setProperty("--ty", `${Math.sin(ang) * dist * 0.75 - (kind === "leaf" ? 0 : 20)}px`);
      p.style.setProperty("--rot", `${Math.round(Math.random() * 360)}deg`);
      p.style.animationDelay = `${(i % 4) * 40}ms`;
      fxLayer().append(p);
      setTimeout(() => p.remove(), 1400);
    }
  }

  // 浇水与悬浮工具共用尺寸：鼠标下原位倾倒一次；触屏和批量操作在土面上方播放。
  function pour(plot, spriteHTML, { origin = null } = {}) {
    if (!plot || reduced()) return Promise.resolve();
    const r = plot.getBoundingClientRect();
    const can = document.createElement("div");
    can.className = "fx-can";
    can.innerHTML = spriteHTML;
    fxLayer().append(can);
    const size = origin?.width || can.getBoundingClientRect().width;
    if (origin) { can.style.width = size + "px"; can.style.height = origin.height + "px"; }
    const x = origin?.left ?? r.left + r.width * .5 - size * .18;
    const y = origin?.top ?? r.top + r.height * .25 - size * .36;
    can.style.left = x + "px";
    can.style.top = y + "px";
    const drops = document.createElement("div");
    drops.className = "fx-drops";
    drops.style.left = x + size * .18 - 6 + "px";
    drops.style.top = y + size * .36 + "px";
    drops.style.width = "12px";
    drops.style.setProperty("--h", Math.max(18, Math.min(46, r.height * .4)) + "px");
    drops.innerHTML = Array.from({ length: 9 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${180 + (i % 5) * 65}ms"></i>`).join("");
    fxLayer().append(drops);
    return new Promise((resolve) => setTimeout(() => {
      can.remove(); drops.remove(); resolve();
    }, 1000));
  }

  // 施肥与工具指针同尺寸交接：倾斜撒下颗粒，再更新作物状态。
  function sprinkle(plot, spriteHTML, { origin = null } = {}) {
    if (!plot || reduced()) return Promise.resolve();
    const r = plot.getBoundingClientRect();
    const bag = document.createElement("div");
    bag.className = "fx-bag";
    bag.innerHTML = spriteHTML;
    fxLayer().append(bag);
    const size = origin?.width || bag.getBoundingClientRect().width;
    if (origin) { bag.style.width = size + "px"; bag.style.height = origin.height + "px"; }
    const x = origin?.left ?? r.left + r.width * .5 - size * .5;
    const y = origin?.top ?? r.top + r.height * .25 - size * .65;
    bag.style.left = x + "px";
    bag.style.top = y + "px";
    const grains = document.createElement("div");
    grains.className = "fx-fertilizer-grains";
    grains.style.left = x + size * .5 + "px";
    grains.style.top = y + size * .2 + "px";
    grains.style.setProperty("--fall", Math.max(24, Math.min(65, r.height * .5)) + "px");
    grains.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--dx:${(i % 5 - 2) * 5}px;animation-delay:${260 + i * 30}ms"></i>`).join("");
    fxLayer().append(grains);
    return new Promise(resolve => setTimeout(() => {
      bag.remove(); grains.remove(); resolve();
    }, 1100));
  }

  // 升阶段：光芒 + 叶片 + 顶部横幅
  function stageUp(sceneEl, title, sub, kicker = "小树长大了") {
    if (!sceneEl) return;
    const banner = document.createElement("div");
    banner.className = "stage-banner";
    banner.innerHTML = `<span class="stage-banner-rays"></span><small>${kicker}</small><strong>${title}</strong>${sub ? `<em>${sub}</em>` : ""}`;
    sceneEl.append(banner);
    const tree = sceneEl.querySelector("#treeSpot");
    if (tree) {
      burst(tree, { count: 18, kind: "leaf", spread: 140 });
      burst(tree, { count: 16, kind: "spark", spread: 110 });
    }
    setTimeout(() => banner.classList.add("leaving"), reduced() ? 1800 : 2600);
    setTimeout(() => banner.remove(), reduced() ? 2100 : 3100);
  }

  // 咬钩：浮标处弹出「!」并泛起水花
  // 咬钩：只在浮漂落点溅起两圈水花（鱼竿抽动、浮漂下沉由鱼池里的鱼竿自己演）
  function bite(pondEl) {
    if (!pondEl || reduced()) return;
    const bob = pondEl.querySelector(".bobber")?.getBoundingClientRect();
    const r = bob && bob.width ? bob : pondEl.getBoundingClientRect();
    const x = r.left + r.width * 0.5,
      y = bob && bob.width ? r.bottom : r.top + r.height * 0.5;
    const rings = [0, 180].map((delay) => {
      const ring = document.createElement("div");
      ring.className = "fx-splash";
      ring.style.left = x + "px";
      ring.style.top = y + "px";
      ring.style.animationDelay = delay + "ms";
      fxLayer().append(ring);
      return ring;
    });
    setTimeout(() => rings.forEach((x) => x.remove()), 1300);
  }

  // 出鱼：鱼从水面跃起，随后展示按稀有度配色的卡片，卡片上直接选择去向；点空白处等同「先收着」
  function revealCatch(pondEl, { art, name, quality, qualityClass, size, detail = "", discovered, firstCatch = false, guidePlace = false, actions = [] }) {
    return new Promise((resolve) => {
      const r = (pondEl?.querySelector?.(".sea-float")||pondEl)?.getBoundingClientRect();
      if (r && !reduced()) {
        const launch=catchLaunch({x:r.left+r.width/2,y:r.top+r.height/2},innerWidth,innerHeight);
        const leap = document.createElement("div");
        leap.className = "fx-leap";
        leap.innerHTML = art;
        leap.style.left = launch.x + "px";
        leap.style.top = launch.y + "px";
        leap.style.setProperty("--leap-rise",`${launch.rise}px`);
        fxLayer().append(leap);
        burst({ getBoundingClientRect: () => ({ left: r.left + r.width * 0.45, top: r.top + r.height * 0.45, width: r.width * 0.1, height: 10 }) }, { count: 12, kind: "drop", spread: 70 });
        setTimeout(() => leap.remove(), 1700);
      }
      setTimeout(
        () => {
          const overlay = document.createElement("div");
          overlay.className = `catch-reveal ${qualityClass || "common"}`;
          overlay.setAttribute("role", "dialog");
          overlay.setAttribute("aria-label", `钓到了${name}`);
          const buttons = actions.map((a) => `<button class="reveal-btn ${a.primary ? "primary" : ""} ${guidePlace && a.key === "place" ? "reveal-guided" : ""}" data-choice="${a.key}">${a.label}</button>`).join("");
          overlay.innerHTML = `<div class="reveal-rays"></div><div class="reveal-card">${firstCatch ? '<span class="reveal-stamp">首钓伙伴</span>' : discovered ? '<span class="reveal-stamp">初次相遇</span>' : ""}<div class="reveal-fish">${art}</div><span class="reveal-quality">${quality}</span><h3>${name}</h3><p>${size}</p>${detail ? `<p class="reveal-detail">${detail}</p>` : ""}${guidePlace ? '<p class="reveal-guide-note">下一步 · 点下方按钮，让鱼儿入住产肥</p>' : ""}${buttons ? `<div class="reveal-actions">${buttons}</div>` : ""}</div>`;
          document.body.append(overlay);
          document.body.classList.add("catch-showing");
          overlay.querySelector(".reveal-btn.primary, .reveal-btn")?.focus({ preventScroll: true });
          let done = false;
          const close = (choice) => {
            if (done) return;
            done = true;
            document.removeEventListener("keydown", onKey);
            overlay.classList.add("leaving");
            setTimeout(() => {
              overlay.remove();
              if(!document.querySelector(".catch-reveal")) document.body.classList.remove("catch-showing");
              resolve(choice);
            }, 220);
          };
          const onKey = (e) => {
            if (e.key === "Escape" && !firstCatch) close("keep");
            if (firstCatch && e.key === "Tab") {e.preventDefault();overlay.querySelector(".reveal-btn.primary")?.focus();}
          };
          document.addEventListener("keydown", onKey);
          overlay.addEventListener("click", (e) => {
            const b = e.target.closest("[data-choice]");
            if (b) close(b.dataset.choice);
            else if (!firstCatch && !e.target.closest(".reveal-card")) close("keep");
          });
        },
        r && !reduced() ? 1480 : 0,
      );
    });
  }

  // 空竿：水面上方一行淡淡的字，约 1.6 秒后消失，不打断操作
  function miss(pondEl, title, sub = "") {
    if (!pondEl) return;
    const r = pondEl.getBoundingClientRect();
    const node = document.createElement("div");
    node.className = "fx-miss";
    node.innerHTML = `<strong>${title}</strong>${sub ? `<small>${sub}</small>` : ""}`;
    node.style.left = r.left + r.width * 0.5 + "px";
    node.style.top = r.top + r.height * 0.42 + "px";
    fxLayer().append(node);
    const ring = document.createElement("div");
    ring.className = "fx-splash soft";
    ring.style.left = r.left + r.width * 0.5 + "px";
    ring.style.top = r.top + r.height * 0.52 + "px";
    fxLayer().append(ring);
    setTimeout(() => {
      node.remove();
      ring.remove();
    }, reduced() ? 1200 : 1700);
  }

  // 环境氛围：云、蝴蝶、落叶、蜻蜓
  function mountAmbient(scene) {
    unmountAmbient();
    if (!scene || reduced()) return;
    const el = document.createElement("div");
    el.className = "ambient-layer";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      [0, 1, 2].map((i) => `<span class="cloud c${i}"></span>`).join("") +
      [0, 1].map((i) => `<span class="butterfly b${i}"><span class="bf-body"><span class="wing l"></span><span class="wing r"></span></span></span>`).join("");
    scene.prepend(el);
    let timer = 0;
    const dropLeaf = () => {
      timer = setTimeout(dropLeaf, 6000 + Math.random() * 5000);
      if (document.hidden) return;
      // 有 WebGL 时直接让树上的一片叶子飘下来，大小与树上的叶子一致
      if (typeof GardenMotion !== "undefined" && document.querySelector("#treeInteraction.mesh-ready")) {
        GardenMotion.dropLeaf();
        return;
      }
      const img = scene.querySelector("#treeSpot .tree-image");
      const layer = scene.querySelector("#treeEffects");
      const point = typeof GardenMotion !== "undefined" ? GardenMotion.canopyPoint() : null;
      if (!img || !layer || !point) return;
      // 落叶放进树自己的效果层，排在「摘果」等提示气泡下面
      const sr = layer.parentElement.getBoundingClientRect(),
        tr = img.getBoundingClientRect();
      const leaf = document.createElement("span");
      leaf.className = "fall-leaf";
      leaf.style.left = tr.left - sr.left + tr.width * point[0] + "px";
      leaf.style.top = tr.top - sr.top + tr.height * point[1] + "px";
      leaf.style.setProperty("--fall", `${tr.height * (0.72 - point[1]) + 10}px`);
      leaf.style.setProperty("--drift", `${(Math.random() - 0.5) * tr.width * 0.25}px`);
      // 落叶按树的显示大小缩放，手机上不会比树上的叶子大
      leaf.style.width = tr.width * 0.014 + "px";
      leaf.style.height = tr.width * 0.024 + "px";
      layer.append(leaf);
      setTimeout(() => leaf.remove(), 6200);
    };
    timer = setTimeout(dropLeaf, 2500);
    // 蝴蝶：在花丛高度随机游走，头朝飞行方向，偶尔停下扇翅
    const flyers = [...el.querySelectorAll(".butterfly")].map((node, i) => ({
      node,
      x: [0.2, 0.62][i],
      y: [0.66, 0.74][i],
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      next: 0,
      face: 1,
      rest: 0,
    }));
    let rafId = 0,
      lastT = 0;
    const flutter = (now) => {
      rafId = requestAnimationFrame(flutter);
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
      lastT = now;
      if (document.hidden) return;
      const w = el.clientWidth,
        h = el.clientHeight;
      for (const b of flyers) {
        if (now > b.next) {
          b.tx = Math.min(0.92, Math.max(0.08, b.x + (Math.random() - 0.5) * 0.35));
          b.ty = Math.min(0.86, Math.max(0.52, b.y + (Math.random() - 0.5) * 0.18));
          b.next = now + 2200 + Math.random() * 2600;
          b.rest = Math.random() < 0.25 ? now + 900 : 0;
        }
        const resting = b.rest && now < b.rest;
        const k = 1 - Math.exp(-dt * (resting ? 4 : 1.2));
        const ax = resting ? 0 : (b.tx - b.x) * 0.9;
        const ay = resting ? 0 : (b.ty - b.y) * 0.9 + Math.sin(now / 230 + b.x * 9) * 0.05;
        b.vx += (ax - b.vx) * k;
        b.vy += (ay - b.vy) * k;
        b.x += b.vx * dt * 0.35;
        b.y += b.vy * dt * 0.35;
        if (Math.abs(b.vx) > 0.01) b.face = b.vx > 0 ? 1 : -1;
        const tilt = Math.max(-18, Math.min(18, b.vy * 260));
        b.node.style.transform = `translate(${b.x * w}px, ${b.y * h}px)`;
        b.node.firstElementChild.style.transform = `scaleX(${b.face}) rotate(${tilt * b.face}deg)`;
        b.node.classList.toggle("resting", !!resting);
      }
    };
    rafId = requestAnimationFrame(flutter);
    const onVisibility = () => el.classList.toggle("paused", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    ambient = {
      el,
      destroy() {
        clearTimeout(timer);
        cancelAnimationFrame(rafId);
        document.removeEventListener("visibilitychange", onVisibility);
        el.remove();
      },
    };
  }
  function unmountAmbient() {
    ambient?.destroy();
    ambient = null;
  }

  return { bump, countTo, flyTo, floatText, harvestPlot, catchLaunch, burst, pour, sprinkle, stageUp, bite, revealCatch, miss, mountAmbient, unmountAmbient };
})();
if(typeof module!=="undefined")module.exports=GardenFX;
