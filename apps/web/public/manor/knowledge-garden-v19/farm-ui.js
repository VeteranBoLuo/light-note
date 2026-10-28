/* 种田界面：场景里的 8 块地（按标定叠作物切片与苗床状态图）、商店、兔子便便、背包 / 商店 / 仓库、施肥、
   首次引导、庄园升级与稀有种子奖励演示。依赖 garden-ui.js 的全局工具（state、M、R、$、showDialog、toast…）与
   FARM_CAL（farm-calibration.js），在 garden-ui.js 之前加载。所有场景坐标均为安全区像素，由 FarmStage 统一缩放。 */
const FarmUI = (() => {
  const C = (k) => M.CROPS[k];
  const TYPE_TEXT = { once: "单次收获", multi: "连续结果", flower: "观赏花" };
  const TIER_TEXT = { basic: "基础", advanced: "进阶", rare: "稀有" };
  const RARE_SOURCE = {
    rainbowcorn: "连签 7 天、每周挑战全部完成、等级里程碑",
    starpumpkin: "连签 30 天、庄园成就、等级里程碑",
    moonorchid: "连签 100 天、图鉴发现 30 种、等级里程碑"
  };
  // 稀有种子奖励（原型演示）：正式版由连签里程碑、周挑战、成就、图鉴里程碑发放
  const REWARDS = [
  { id: "streak-7", title: "连签 7 天里程碑", seed: "rainbowcorn" },
  { id: "streak-30", title: "连签 30 天里程碑", seed: "starpumpkin" },
  { id: "week-all", title: "本周挑战全部完成", seed: null },
  { id: "dex-30", title: "图鉴发现 30 种", seed: "moonorchid" }];

  let bagTab = "seeds",
    bagTarget = null,
    shopTab = "seeds",
    shopMode = "buy",
    shopSellTab = "fish",
    pendingPurchase = null,
    pendingSale = null,
    lastPurchasedSeed = null,
    activeTool = null,
    toolShelfOpen = false;
  const watering = new WeakMap();
  const isWatering = (i) => watering.get(state)?.has(i);
  const fertilizing = new WeakMap();
  const isFertilizing = (i) => fertilizing.get(state)?.has(i);
  const R2_ART = "knowledge-garden-v19/incoming/farm-r2/sprites/";
  const cal = () => FarmStage.cal();
  const baitChestUnseen = () => {try {return !localStorage.getItem("manor-bait-chest-seen");} catch {return true;}};
  const plotEl = (i) => document.querySelector(`.farm-plot[data-plot="${i}"]`);
  const unlockLevel = (i) => {
    for (let lv = 1; lv <= R.levels.length; lv++) if (M.plotsOpen(lv) > i) return lv;
    return R.levels.length;
  };
  const open = () => M.plotsOpen(M.level(state));
  const plotsIn = (st) => [...Array(open()).keys()].filter((i) => M.plotState(state, i) === st);
  const count = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const cycleText = (h) => h < 1 ? `${Math.round(h * 60)} 分钟` : h < 48 ? `${+h.toFixed(1)} 小时` : h % 24 === 0 ? `${h / 24} 天` : `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
  // 田沿常驻读数精确到分钟；不足一分钟再显示秒，完整秒数仍在作物详情中。
  function plotTime(hours) {
    const seconds = Math.max(0, Math.ceil(hours * 3600 - 1e-7)); // 消除小时换算的浮点尾差
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.ceil(seconds / 60),h = Math.floor(minutes / 60),m = minutes % 60;
    return h ? `${h}小时${m ? `${m}分` : ""}` : `${m}分钟`;
  }
  // 地上是散落的干燥颗粒，拾取后再作为袋装肥料收入背包。
  const poopArt = () => `<span class="rabbit-droppings" aria-hidden="true">${'<i></i>'.repeat(6)}</span>`;

  // ---------- 透视：把叠加图的土面四角投影到地块土面四角 ----------
  function squareToQuad(q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2,
      dx2 = x3 - x2,
      dx3 = x0 - x1 + x2 - x3,
      dy1 = y1 - y2,
      dy2 = y3 - y2,
      dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (dx3 * dy2 - dx2 * dy3) / den,
      h = (dx1 * dy3 - dx3 * dy1) / den;
    return [
    [x1 - x0 + g * x1, x3 - x0 + h * x3, x0],
    [y1 - y0 + g * y1, y3 - y0 + h * y3, y0],
    [g, h, 1]];

  }
  function invert3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    const A = e * i - f * h,
      B = -(d * i - f * g),
      Cc = d * h - e * g;
    const det = a * A + b * B + c * Cc;
    return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det]];

  }
  const mul3 = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
  function quadMatrix(src, dst) {
    const m = mul3(squareToQuad(dst), invert3(squareToQuad(src)));
    // CSS clips negative homogeneous w. Normalize at the visible source plane,
    // not the transparent image origin, which may sit beyond its vanishing line.
    const center = src.reduce(([x, y], [u, v]) => [x + u / src.length, y + v / src.length], [0, 0]);
    const n = m[2][0] * center[0] + m[2][1] * center[1] + m[2][2];
    const [[a, b, c], [d, e, f], [g, h, i]] = m.map((r) => r.map((v) => v / n));
    return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].map((v) => +v.toFixed(8)).join(",")})`;
  }
  function coverQuad(p) {
    // Match the same measured inner timber corners as soil; old crop anchors overhang the frame.
    return p.soilOpening || p.cover || p.soil;
  }

  // ---------- 场景 ----------
  function plotKey(i) {
    const st = M.plotState(state, i);
    return [st, state.plots[i].crop || "", M.growthStage(state, i), st === "locked" ? unlockLevel(i) : "", !!state.plots[i].pollinationPending].join("|");
  }
  function plotInner(i) {
    const p = cal().plots[i],
      [sw, sh] = cal().safe.slice(2);
    const st = M.plotState(state, i),
      plot = state.plots[i];
    // Locked beds have one opaque cover plane. A second crop-plane fill would show outside the timber lip.
    const layers = [];
    // 木/石框内沿独立于作物锚点；素材只取内部连续土面，透明边不参与贴合。
    const opening = p.soilOpening || p.soil;
    const overlay = (kind) => `<span class="plot-soil" style="width:${sw}px;height:${sh}px;clip-path:polygon(${opening.map(([x, y]) => `${x}px ${y}px`).join(',')})"><img class="plot-overlay" src="${FarmArt.BASE}bed-${kind}-r55.webp" alt="" draggable="false" style="transform:${quadMatrix(FARM_CAL.overlaySoil[kind], opening)}"></span>`;
    if (st === "locked") {
      // 不透明织布映射到实测木框内沿，覆盖后沿土堆；不沿用作物的旧土面坐标。
      const core = [[0, 0], [512, 0], [512, 512], [0, 512]];
      const covered = coverQuad(p);
      const lockAt = covered.reduce((point, [x, y]) => [point[0] + x / 4, point[1] + y / 4], [0, 0]);
      const clip = covered.map(([x, y]) => `${x}px ${y}px`).join(",");
      layers.push(`<span class="plot-cover" style="width:${sw}px;height:${sh}px;clip-path:polygon(${clip})"><img class="plot-overlay plot-canvas" src="${FarmArt.BASE}plot-canvas-r53.webp" alt="" draggable="false" style="transform:${quadMatrix(core, covered)}"></span>`, `<span class="plot-lock" style="left:${lockAt[0]}px;top:${lockAt[1]}px">Lv.${unlockLevel(i)}</span>`);
    }
    // Every open bed uses the same detailed soil plane. Otherwise empty beds
    // and later growth stages reveal the enlarged, low-detail background soil.
    if (st !== "locked") layers.push(overlay(st === "dry" || st === "empty" ? "dry" : "wet-soil"));
    if (st !== "locked") layers.push(`<svg class="soil-hl" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}"><polygon points="${opening.map((q) => q.join(",")).join(" ")}"/></svg>`);
    if (plot.crop && st !== "locked") {
      const growth = M.growthStage(state, i),pose = FarmArt.cropPlacement(plot.crop, growth, p);
      layers.push(`<img class="plot-crop" src="${FarmArt.cropSrc(plot.crop, FarmArt.spriteStage(growth))}" alt="" draggable="false" style="left:${pose.x}px;top:${pose.y}px;width:${pose.size}px;height:${pose.size}px">`);
    }
    const edge = [(p.soil[2][0] + p.soil[3][0]) / 2, (p.soil[2][1] + p.soil[3][1]) / 2];
    const status = { ripe: ["hand-open", "可收获"], dry: ["tool-can", "待浇水"], empty: ["icon-sprout", "播种"] }[st];
    if (status) {
      layers.push(`<span class="plot-badge ${st}" style="left:${edge[0]}px;top:${edge[1]}px" aria-hidden="true"><img src="${R2_ART}${status[0]}.webp" alt=""><span>${status[1]}</span></span>`);
    }
    if (st === "growing") layers.push(`<span class="plot-timer" data-plot-clock="${i}" aria-hidden="true" style="left:${edge[0]}px;top:${edge[1]}px">${plotTime(M.remaining(state, i))}</span>`);
    if (plot.pollinationPending) layers.push(`<span class="plot-pollen" style="left:${p.soil[2][0] - 15}px;top:${edge[1] - 12}px" aria-hidden="true"><i class="pollen-token"></i>+1</span>`);
    return `<span class="plot-art" style="left:${-p.hitRect[0]}px;top:${-p.hitRect[1]}px">${layers.join("")}</span>`;
  }
  function plotLabel(i) {
    const st = M.plotState(state, i),
      c = C(state.plots[i].crop);
    const n = `第 ${i + 1} 块地`;
    if (st === "locked") return `${n}，庄园 Lv.${unlockLevel(i)} 开垦`;
    if (st === "empty") return `${n}，空地，点击播种`;
    if (st === "dry") return `${n}，${c.name}待浇水`;
    if (st === "ripe") return `${n}，${c.name}${c.type === "flower" ? "盛开，点击" + (c.sell === null ? "赏花" : "剪花") : "成熟，点击收获"}`;
    if (st === "bloom") return `${n}，${c.name}盛开中`;
    return `${n}，${c.name}，${clockTime(M.remaining(state, i))} 后成熟`;
  }
  function layerHTML() {
    const d = cal();
    const [x, y, w, h] = d.stall.rect;
    const sign = d.areaSign ? `<button class="area-road-sign" data-action="area-${d.area === "garden" ? "bay" : "garden"}" style="left:${d.areaSign[0]}px;top:${d.areaSign[1]}px;width:${d.areaSign[2]}px;height:${d.areaSign[3]}px;--sign-angle:${d.areaSignAngle || 0}deg;--sign-font:${d.areaSignFont || 40}px">${d.nativePieces ? `<i class="road-sign-art" aria-hidden="true"><img src="knowledge-garden-v19/${d.asset}" alt="" draggable="false" style="left:${-23 / 174 * 100}%;top:${-478 / 84 * 100}%;width:${919 / 174 * 100}%;height:${1712 / 84 * 100}%"></i>` : ""}<span>${d.area === "garden" ? "去海湾 →" : "← 回菜园"}</span></button>` : "";
    return `<div class="farm-layer" id="farmLayer" data-profile="${FarmStage.profile()}">${sign}${d.area !== "bay" ? `<button class="seed-stall" data-action="stall" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" aria-label="商店：买种子、鱼饵和淡水鱼苗袋"><span class="stall-sign">商店</span></button>` : ""}${d.area !== "garden" ? `<button class="bait-chest ${baitChestUnseen() ? "unseen" : ""}" data-action="bait" style="left:${d.pier.baitChest[0]}px;top:${d.pier.baitChest[1]}px;width:${d.pier.baitChest[2]}px;height:${d.pier.baitChest[3]}px;--bait-hit:${FarmStage.hitClip(d.pier.baitHit)}" aria-label="打开鱼饵箱，选择鱼饵">${d.pier.baitBaked ? "" : `<img class="bait-chest-art" src="${FarmArt.BASE}${d.pier.baitAsset || "bait-chest-r19.webp"}" alt="" draggable="false">`}<span class="bait-chest-hit" aria-hidden="true"></span></button>` : ""}${Object.entries(d.signs).map(([name, p]) => `<div class="scene-sign ${name}-sign" style="left:${p[0]}px;top:${p[1]}px"><span>${name === "pier" ? "钓鱼区" : "养鱼舱"}</span></div>`).join("")}${(d.area === "bay" ? [] : d.plots).
    map((p, i) => `<button class="farm-plot" data-action="plot" data-plot="${i}" style="left:${p.hitRect[0]}px;top:${p.hitRect[1]}px;width:${p.hitRect[2]}px;height:${p.hitRect[3]}px" data-key=""></button>`).
    join("")}<button class="poop-spot" id="poopSpot" data-action="poop" style="left:${d.poop[0]}px;top:${d.poop[1]}px" hidden aria-label="拾取兔子肥料，得到 1 份兔子肥" title="兔子肥料 · 点击拾取">${poopArt()}</button><button class="bird-seed-spot scene-gift" id="birdSeedSpot" data-action="bird-seed" hidden aria-label="领取麻雀带回的小萝卜种子 1 颗" data-gift-tip="领取麻雀的种子"><span class="bird-seed-packet" aria-hidden="true"><img src="knowledge-garden-v19/farm/seed-ground-r69.webp" alt="" draggable="false"></span></button></div>`;
  }
  function purifierArt() {const level = M.purifierStatus(state).level;return (level < 2 ? FarmFacilities.nativeSceneArt("purifier", !level) : "") || FarmFacilities.purifierArt(level);}
  function purifierHTML() {
    // The mobile garden has no purifier hit area; its art belongs to the bay.
    if(cal().area==="garden")return "";
    return `<button id="purifierSpot" class="scene-purifier${cal().nativePieces?.purifier ? " native-purifier" : ""}" data-action="purifier-collect" type="button" hidden><img class="purifier-plinth" src="knowledge-garden-v19/farm/purifier-plinth-r53.webp" alt="" draggable="false"><span class="purifier-art" aria-hidden="true">${purifierArt()}<span class="purifier-water"><i></i><i></i><i></i><i></i><b></b></span></span><span class="purifier-state"></span></button>`;
  }
  function syncPurifier() {
    const fixture = $("#purifierSpot");if (!fixture) return;
    const p = M.purifierStatus(state),wasHidden = fixture.hidden;
    fixture.classList.toggle("native-purifier", !!cal().nativePieces?.purifier && p.level < 2);
    fixture.hidden = FarmStage.cal().area === "garden" || !state.adopted || !!state.guide;
    fixture.classList.toggle("hide-caption", state.casting || !!state.guide);
    if (fixture.dataset.artLevel !== String(p.level)) {
      fixture.dataset.artLevel = String(p.level);
      const art = fixture.querySelector(".purifier-art");
      art.innerHTML = FarmArt.html(purifierArt() + `<span class="purifier-water"><i></i><i></i><i></i><i></i><b></b></span>`);
    }
    if (p.owned) {
      const full = state.water >= R.waterCap;
      fixture.dataset.state = p.remaining ? "working" : p.ready ? full ? "full" : "ready" : "spent";
      fixture.dataset.level = p.level;
      fixture.querySelector(".purifier-state").textContent = p.remaining ? plotTime(p.remaining) : p.ready ? `${p.ready} 滴待领` : "今日已领";
      fixture.setAttribute("aria-label", `海水过滤器，${p.remaining ? `第一批清水还需 ${plotTime(p.remaining)}` : p.ready ? `${p.ready} 滴清水${full ? "待领取，水桶已满" : "可领取"}` : "今日已领完，明天再来"}`);
    } else {
      const required = R.purifierLevels[0].gardenLevel,unlocked = M.level(state) >= required;
      fixture.dataset.state = "sealed";fixture.dataset.level = "0";
      fixture.querySelector(".purifier-state").textContent = unlocked ? cal().nativePieces?.purifier ? "海水过滤器" : "待建造" : `Lv.${required} 解锁`;
      fixture.setAttribute("aria-label", `封存的海水过滤器，${unlocked ? `待建造，需要 ${R.purifierCost} 积分` : `庄园 Lv.${required} 解锁`}，点击查看建造条件`);
    }
    if (wasHidden !== fixture.hidden && typeof FarmStage !== "undefined") FarmStage.layout();
  }
  async function collectPurifier() {
    const fixture = $("#purifierSpot"),from = fixture?.getBoundingClientRect(),p = M.purifierStatus(state);
    if (!p.owned) {FarmFacilities.open("purifier");return;}
    const result = await M.claimPurifier(state);
    if (!result) {FarmFacilities.open("purifier");return;}
    update();
    fixture?.classList.add("is-collecting");
    const session = state;setTimeout(() => {if (state === session) fixture?.classList.remove("is-collecting");}, 800);
    if (from) GardenFX.flyTo(from, $(".res-pill.water"), toolSprite("water"), { size: 24 });
    toast(`清水 +${result.water}${result.left ? ` · 还有 ${result.left} 滴留待领取` : " · 今天已收好"}`);
    announce(`收取 ${result.water} 滴清水，水桶现有 ${state.water} 滴`);
  }
  // 舞台缩放变化时调用：换端型就重画；手机矮屏把点击区域撑到至少 44 × 44 CSS 像素（不越过相邻地块）
  function relayout() {
    const layer = $("#farmLayer");
    if (!layer) return;
    if (layer.dataset.profile !== FarmStage.profile()) {
      layer.outerHTML = layerHTML();
      sync();
      return;
    }
    const s = FarmStage.scale(),
      min = 44 / s,
      plots = cal().plots;
    const road = $(".garden-scene .area-road-sign"),sign = cal().areaSign;
    if (road && sign) {
      if (cal().nativePieces) {
        const scene = $(".garden-scene");if (road.parentElement !== scene) scene.append(road);
        const [x, y] = FarmStage.toScene(sign[0] + sign[2] / 2, sign[1] + sign[3] / 2);
        road.style.left = x + "px";road.style.top = y + "px";road.style.width = Math.max(44, sign[2] * s) + "px";road.style.height = Math.max(44, sign[3] * s) + "px";
        road.style.translate = "-50% -50%";road.style.fontSize = cal().areaSignFont * s + "px";
        road.style.setProperty("--road-art-w", 174 * s + "px");road.style.setProperty("--road-art-h", 84 * s + "px");
      } else {
        const w = Math.max(sign[2], min),h = Math.max(sign[3], min);
        road.style.left = sign[0] + (sign[2] - w) / 2 + "px";road.style.top = sign[1] + (sign[3] - h) / 2 + "px";
        road.style.width = w + "px";road.style.height = h + "px";
      }
    }
    // 往某个方向最多能撑多少：到相邻地块（横向或纵向有重叠的那块）之间空隙的一半
    const room = (i, axis) => {
      const [x, y, w, h] = plots[i].hitRect;
      let lo = Infinity,
        hi = Infinity;
      plots.forEach((q, j) => {
        if (j === i) return;
        const [qx, qy, qw, qh] = q.hitRect;
        if (axis === "y" && qx < x + w && qx + qw > x) {
          if (qy >= y + h) hi = Math.min(hi, (qy - y - h) / 2);else
          if (qy + qh <= y) lo = Math.min(lo, (y - qy - qh) / 2);
        }
        if (axis === "x" && qy < y + h && qy + qh > y) {
          if (qx >= x + w) hi = Math.min(hi, (qx - x - w) / 2);else
          if (qx + qw <= x) lo = Math.min(lo, (x - qx - qw) / 2);
        }
      });
      return [lo, hi];
    };
    plots.forEach((p, i) => {
      const el = plotEl(i);
      if (!el) return;
      const [x, y, w, h] = p.hitRect;
      // 两边各撑一半，一边受限时另一边补上
      const grow = (size, [lo, hi]) => {
        const need = Math.max(0, min - size);
        let a = Math.min(need / 2, lo);
        const b = Math.min(need - a, hi);
        a = Math.min(need - b, lo);
        return [a, b];
      };
      const [gl, gr] = grow(w, room(i, "x")),
        [gt, gb] = grow(h, room(i, "y"));
      const left = x - gl,
        top = y - gt;
      el.style.cssText = `left:${left}px;top:${top}px;width:${w + gl + gr}px;height:${h + gt + gb}px`;
      const art = el.querySelector(".plot-art");
      if (art) art.style.cssText = `left:${-left}px;top:${-top}px`;
    });
  }
  function sync() {
    const layer = $("#farmLayer");
    if (!layer) return;
    if (layer.dataset.profile !== FarmStage.profile()) return relayout();
    syncPurifier();
    layer.querySelectorAll(".farm-plot").forEach((el) => {
      const i = +el.dataset.plot,
        key = plotKey(i);
      if (el.dataset.key !== key) {
        el.innerHTML = FarmArt.html(plotInner(i));
        el.dataset.key = key;
        el.dataset.state = M.plotState(state, i);
      }
      el.setAttribute("aria-label", plotLabel(i));
    });
    relayout();
    refreshClocks();
    paintTool();
    syncToolMode();
    $("#poopSpot").hidden = cal().area === "bay" || !M.poopReady(state) || !!state.guide;
    if (cal().area !== "bay" && matchMedia("(prefers-reduced-motion: reduce)").matches) M.deliverBirdSeed(state);
    const gift = $("#birdSeedSpot"),[gx, gy] = birdGiftPoint();
    gift.hidden = cal().area === "bay" || !M.birdSeedReady(state) || !!state.guide;
    gift.style.left = gx + "px";gift.style.top = gy + "px";
  }
  function refreshClocks() {
    if (typeof FarmFacilities !== "undefined") FarmFacilities.refreshClocks();
    if ($("#purifierSpot")) syncPurifier();
    document.querySelectorAll("[data-buyback-expiry]").forEach((el) => {
      const left = Math.max(0, Number(el.dataset.buybackExpiry) - state.now);
      el.textContent = left ? `剩余 ${clockTime(left)}` : "已过期";
      const button = el.closest(".buyback-row")?.querySelector("button");
      if (button && !left) button.disabled = true;
    });
    document.querySelectorAll("[data-plot-clock]").forEach((el) => {
      const r = M.remaining(state, +el.dataset.plotClock);
      if (r !== null) {
        const text = plotTime(r);
        if (el.textContent !== text) el.textContent = text;
      }
    });
    document.querySelectorAll("[data-card-clock]").forEach((el) => {
      const i = +el.dataset.cardClock,
        st = M.plotState(state, i);
      el.textContent = st === "growing" ? clockTime(M.remaining(state, i)) + " 后成熟" : st === "ripe" ? "已成熟" : st === "bloom" ? "盛开中" : "";
    });
    // 成长进度：进到下一阶段（或剩余时间的文字变了）就重画，同时换掉弹框里的大图；否则只推进进度条
    document.querySelectorAll("[data-growth-steps]").forEach((el) => {
      const i = +el.dataset.growthSteps,
        m = growthModel(i);
      if (!m) return el.remove();
      if (el.dataset.sig === m.sig) return el.style.setProperty("--pos", m.pos.toFixed(4));
      const art = el.closest(".plot-card")?.querySelector(".plot-card-art");
      if (art && el.dataset.sig.split("|")[0] !== m.sig.split("|")[0]) art.innerHTML = FarmArt.cropPreview(state.plots[i].crop, M.growthStage(state, i));
      el.outerHTML = growthStepsHTML(i);
    });
    document.querySelectorAll("[data-plot-progress]").forEach((el) => {
      el.style.width = (M.progress(state, +el.dataset.plotProgress) * 100).toFixed(1) + "%";
    });
  }
  // 时钟每秒调用：地块状态或阶段变了就整体刷新
  const stateKey = () => [...state.plots.keys()].map(plotKey).join(",") + "|" + M.poopReady(state) + "|" + M.birdSeedReady(state) + "|" + FarmFacilities.stateKey();

  // ---------- 地块交互 ----------
  async function onPlot(i) {
    if (isWatering(i) || isFertilizing(i)) return;
    const st = M.plotState(state, i);
    if (!state.guide && activeTool) {
      if (activeTool.kind === "seed") {
        if (st !== "empty") return toast(st === "locked" ? "这块地还没开放" : "已有作物，种子没有消耗");
        const key = activeTool.seed;
        if (!(await plantAt(i, key))) return;
        if (!state.seeds[key] || !plotsIn("empty").length) cancelTool();
        return;
      }
      if (activeTool.kind === "fert") return await fertilizePlot(i, activeTool.fert);
      if (activeTool.kind === "shovel") return canShovel(i) ? removeConfirm(i) : toast("这块地没有可铲除的作物");
    }
    // 引导只教播种与浇水，随后自由游玩。
    if (state.guide === "plant" && i === 0 && st === "empty") return bagDialog("seeds", i);
    if (state.guide === "water" && i === 0) return await waterPlots([0]);
    if (state.guide) return;
    if (st === "locked") return toast(`庄园 Lv.${unlockLevel(i)} 时开垦这块地`);
    if (st === "empty") return bagDialog("seeds", i);
    if (st === "dry") return await waterPlots([i]);
    if (st === "ripe") return await harvestPlots([i]);
    plotCard(i);
  }
  async function plantAt(i, key) {
    if (state.guide && (state.guide !== "plant" || i !== 0 || key !== "radish")) return false;
    if (!(await M.plant(state, i, key))) return false;
    closeDialog(false);
    update();
    GardenFX.burst(plotEl(i), { count: 10, kind: "soil", spread: 50 });
    announce(`在第 ${i + 1} 块地种下了${C(key).name}`);
    if (state.guide === "plant") {
      state.guide = "water";
      update();
    } else if (state.water >= R.plantWater) GardenFX.floatText(plotEl(i), "已播种", "green");else
    toast(`种下${C(key).name}；水滴不够，完成每日任务后再来浇水`);
    return true;
  }
  async function waterPlots(list) {
    const session = state;
    const dry = [...new Set(list)].filter((i) => !isWatering(i) && M.plotState(session, i) === "dry");
    if (!dry.length) return;
    if (session.water < R.plantWater) return waterShortDialog();
    const cursor = $("#toolCursor");
    const preview = dry.length === 1 && toolPlot === dry[0] && cursor?.classList.contains("on") ?
    cursor.querySelector(".tool-art")?.getBoundingClientRect() : null;
    const origin = preview?.width > 0 && preview.height > 0 ? preview : null;
    const finishingGuide = session.guide === "water";
    const done = await M.water(session, dry);
    const pending = watering.get(session) || new Set();
    watering.set(session, pending);
    done.forEach((i) => pending.add(i));
    closeDialog(false);
    update();
    paintTool();
    try {
      await Promise.all(done.map((i, k) => wait(k * 100).then(async () => {
        if (state !== session) return;
        // 批量浇水错峰播放；场景切换后的缺失目标由动效层忽略。
        await GardenFX.pour(plotEl(i), toolSprite("water"), { origin: k === 0 ? origin : null });
        pending.delete(i);
        if (state === session) {
          GardenFX.floatText(plotEl(i), `−${R.plantWater} 滴`, "blue");
          paintTool();
        }
      })));
      if (state !== session) return;
      update();
      announce(`浇了 ${done.length} 块地，剩余 ${session.water} 滴水`);
      if (done.length < dry.length) toast(`水滴不够，还有 ${dry.length - done.length} 块地等着浇水`);
      if (finishingGuide) toast(`种好啦，${cycleText(C("radish").first)}后收获。现在可以自由逛逛`);
    } finally {
      done.forEach((i) => pending.delete(i));
      if (state === session) {syncToolMode();paintTool();}
    }
  }
  async function harvestPlots(list) {
    const lvBefore = M.level(state),
      openBefore = open();
    const res = await M.harvest(state, list);
    if (!res.length) return;
    closeDialog(false);
    const rects = res.map((r) => plotEl(r.i)?.getBoundingClientRect());
    const visuals = res.map((r) => {const image = plotEl(r.i)?.querySelector(".plot-crop");return image?.src ? { rect: image.getBoundingClientRect(), src: image.src } : null;});
    update();
    // update 重画底栏；旧背包已经脱离文档，坐标会变成 (0,0)。
    const bag = $('[data-dock="bag"]');
    res.forEach((r, k) => {
      const el = plotEl(r.i);
      if (visuals[k]) GardenFX.harvestPlot(visuals[k].rect, visuals[k].src);
      el?.classList.add("harvest-settling");
      if (el) {el.inert = true;setTimeout(() => {el.inert = false;el.classList.remove("harvest-settling");}, 650);}
      GardenFX.burst(el, { count: 10, kind: "leaf", spread: 60 });
      GardenFX.floatText(el, `+${r.xp} 经验`, "harvest-xp");
      if (r.item && rects[k]) GardenFX.flyTo({ getBoundingClientRect: () => rects[k] }, bag, FarmArt.icon(r.key), { size: 40, delay: k * 90 });
    });
    const firsts = res.filter((r) => r.first).map((r) => C(r.key).name);
    if (res.some((r) => r.fertilizer)) toast(`剪下月光兰，花束已收好 · ${M.FERT.legend.name} +${res.filter((r) => r.fertilizer).length}`);else
    if (res.some((r) => r.bonus)) toast("授粉加成已收好 · 收获物多 1 份");else
    if (firsts.length) toast(`新图鉴 +${firsts.length} · ${firsts.join("、")}`);
    announce(`收获了 ${res.length} 块地`);
    const lv = M.level(state);
    if (lv > lvBefore) setTimeout(() => levelUp(lvBefore, lv, openBefore), 700);
  }
  function levelUp(from, to, openBefore) {
    const unlockedCrops = [],unlockedFacilities = [],
      plots = open() - openBefore;
    for (let lv = from + 1; lv <= to; lv++) {
      const unlocks = M.unlocksAt(lv);
      unlockedCrops.push(...unlocks.crops.map((k) => C(k).name));
      unlockedFacilities.push(...unlocks.facilities);
    }
    const milestone = Object.keys(M.LEVEL_REWARDS).some((lv) => +lv > from && +lv <= to);
    const sub = [milestone ? "有成长奖励可领取" : "", plots ? `开垦了 ${plots} 块新地` : "", unlockedCrops.length ? `商店上新：${unlockedCrops.join("、")}` : "", unlockedFacilities.length ? `设施解锁：${unlockedFacilities.join("、")}` : ""].filter(Boolean).join(" · ");
    GardenFX.stageUp($(".garden-scene"), `庄园 Lv.${to}`, sub, "庄园升级了");
    for (let i = openBefore; i < open(); i++) {
      const el = plotEl(i);
      el?.classList.add("just-opened");
      GardenFX.burst(el, { count: 16, kind: "soil", spread: 70 });
      setTimeout(() => el?.classList.remove("just-opened"), 1600);
    }
    state.memories.push({ text: `庄园升到 Lv.${to}${plots ? `，开垦了新地` : ""}`, day: M.day(state) });
  }
  // ---------- 成长进度：这一轮的各个阶段（小图、名字、还要多久），进度条按阶段分段推进 ----------
  const STAGE_TEXT = {
    once: ["播种", "发芽", "幼苗", "长大", "成熟"],
    multi: ["播种", "发芽", "幼苗", "开花", "结果"],
    flower: ["播种", "发芽", "幼苗", "含苞", "盛开"]
  };
  // 还要多久：不足 1 分钟按秒，不足 1 小时按分，不足 1 天按“时 分”，再长按“天 时”
  function untilText(h) {
    const m = Math.ceil(h * 60);
    if (h < 1 / 60) return `${Math.max(1, Math.ceil(h * 3600))} 秒后`;
    if (m < 60) return `${m} 分钟后`;
    if (m < 24 * 60) return `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ""}后`;
    const hh = Math.ceil(h);
    return `${Math.floor(hh / 24)} 天${hh % 24 ? ` ${hh % 24} 小时` : ""}后`;
  }
  function growthModel(i) {
    const p = state.plots[i],
      c = C(p.crop),
      times = M.stageTimes(state, i);
    if (!c || !times || !["growing", "ripe", "bloom"].includes(M.plotState(state, i))) return null;
    // 连续结果作物摘过一轮以后：只剩“开花 → 结果”两段
    const ks = p.done ? [3, 4] : [0, 1, 2, 3, 4],
      t = p.done ? [times[0], times[4]] : times,
      now = state.now;
    let cur = 0;
    t.forEach((at, j) => {
      if (now >= at) cur = j;
    });
    const seg = cur < t.length - 1 ? Math.min(1, (now - t[cur]) / (t[cur + 1] - t[cur])) : 1;
    const steps = ks.map((k, j) => ({
      k,
      name: STAGE_TEXT[c.type][k],
      art: FarmArt.cropPreview(p.crop, k),
      cls: j < cur ? "done" : j === cur ? "now" : "next",
      text: j < cur ? "完成" : j === cur ? "现在" : untilText(t[j] - now)
    }));
    return { steps, cur: ks[cur], pos: (cur + seg) / (t.length - 1), sig: cur + "|" + steps.map((x) => x.text).join(","), round: p.done ? `第 ${p.done + 1} 轮结果` : "" };
  }
  function growthStepsHTML(i) {
    const m = growthModel(i);
    if (!m) return "";
    return `<ol class="growth-steps" data-growth-steps="${i}" data-sig="${m.sig}" style="--n:${m.steps.length};--pos:${m.pos.toFixed(4)}" aria-label="成长进度${m.round ? "，" + m.round : ""}">${m.steps.
    map((x) => `<li class="${x.cls}"${x.cls === "now" ? ' aria-current="step"' : ""}><span class="gs-art">${x.art}</span><b>${x.name}</b><small>${x.text}</small></li>`).
    join("")}</ol>`;
  }
  // 肥料共用麻布袋，标签区分档位；弹框、工具指针与动作使用同一素材。
  const fertIcon = (k) => `<span class="fert-icon fert-${k}" aria-hidden="true">${FarmArt.fertilizer(k)}</span>`;

  function waterShortDialog() {
    showDialog(
      "水滴不够了",
      `完成轻笺里的每日任务，每项可领取 ${R.dailyWater} 滴水。`,
      `<div class="care-preview">${toolSprite("water")}<div><strong>${state.water} <small>/ ${R.waterCap} 滴</small></strong><p>播种后浇一次水，每块地 ${R.plantWater} 滴</p></div></div><div class="info-box">没浇水的种子会一直留在地里等你，不会损失。</div>`,
      `<button class="button primary" data-action="daily">每日任务</button>`
    );
  }
  // 生长中 / 盛开的地：看剩余时间、施肥、铲除
  function plotCard(i) {
    const p = state.plots[i],
      c = C(p.crop),
      st = M.plotState(state, i);
    if (!c) return;
    const cycleH = p.done ? c.every : c.first,
      cap = cycleH * R.accelShare;
    const ferts = Object.entries(M.FERT).
    map(([k, f]) => `<button class="fert-chip" data-action="fert-select" data-fert="${k}" data-plot="${i}" ${state.fertilizers[k] > 0 && st === "growing" && p.accel < cap - 1e-9 ? "" : "disabled"}>${fertIcon(k)}<b>−${shortDuration(f.hours)}</b><span>${f.name}</span><small>${state.fertilizers[k]} 份</small></button>`).
    join("");
    showDialog(
      `${c.name} · 第 ${i + 1} 块地`,
      `${TIER_TEXT[c.tier]} · ${c.typeLabel || TYPE_TEXT[c.type]}${c.type === "multi" ? ` · 已收 ${p.done} / ${c.harvests} 次` : c.type === "flower" && c.harvests > 1 ? ` · 已剪 ${p.done} / ${c.harvests} 束` : ""}`,
      `<div class="plot-card"><div class="plot-overview"><div class="plot-card-art">${FarmArt.cropPreview(p.crop, M.growthStage(state, i))}</div><div class="plot-status"><small>当前状态</small><strong data-card-clock="${i}">${st === "growing" ? clockTime(M.remaining(state, i)) + " 后成熟" : st === "bloom" ? "盛开中" : "已成熟"}</strong><p>本轮已加速 <b>${p.accel ? shortDuration(p.accel) : "0"}</b> / ${shortDuration(cap)}</p></div></div>${growthStepsHTML(i)}${p.pollinated ? `<p class="plot-pollination-note">${FarmFacilities.beeArt()}${p.pollinationPending ? "已授粉 · 下一轮多收 1 份" : "这株已授过粉"}</p>` : ""}${st === "growing" ? `<div class="plot-section-head"><h3>施肥加速</h3><span>点选肥料，立即用于这块地</span></div><div class="fert-row">${ferts}</div>` : ""}<p class="plot-care-note">${st === "bloom" ? c.sell === null ? "月光兰会一直开着，留作庄园里的稀有风景。" : "花会继续盛开，想换种时可以铲除。" : "每轮最多加速一半时长 · 成熟后不会枯萎"}</p></div>`,
      `<button class="button" data-action="plot-remove" data-plot="${i}">铲除</button><button class="button primary" data-action="close">回到庄园</button>`
    );
    $("#dialog").classList.add("plot-dialog");
  }
  function canFertilize(i) {
    const p = state.plots[i],c = p && C(p.crop);
    return !!c && M.plotState(state, i) === "growing" && p.accel < (p.done ? c.every : c.first) * R.accelShare - 1e-9;
  }
  const TOOL_NAMES = { hand: "手形", fert: "施肥", shovel: "铲除" };
  const TOOL_ART = { hand: "hand-open", shovel: "tool-trowel" };
  const toolName = () => activeTool?.kind === "seed" ? "播种" : TOOL_NAMES[activeTool?.kind];
  function toolIcon(kind) {
    if (kind === "seed") return `<span class="farm-tool-icon seed-tool-art">${FarmArt.packet(activeTool.seed)}</span>`;
    if (kind === "fert") return `<span class="farm-tool-icon">${FarmArt.fertilizer(activeTool?.fert || "eco")}</span>`;
    const file = TOOL_ART[kind];
    return `<img class="farm-tool-icon" src="${R2_ART}${file}.webp" alt="" draggable="false">`;
  }
  function toolsHTML() {
    return `<div class="farm-tools" id="farmToolShelf" role="group" aria-label="农具">${Object.entries(TOOL_NAMES).filter(([kind]) => kind !== "fert" || document.documentElement.classList.contains("light-note-mobile-rendering")).map(([kind, name]) => `<button class="farm-tool" data-action="tool-select" data-tool="${kind}" aria-pressed="${(activeTool?.kind || "hand") === kind}" aria-label="${name}${kind === "hand" ? "，恢复自动照料" : ""}">${toolIcon(kind)}<span>${name}</span></button>`).join("")}</div>`;
  }
  function fertilizerTarget() {
    return $('[data-dock="bag"]');
  }
  function canShovel(i) {
    return !!state.plots[i]?.crop && M.plotState(state, i) !== "locked";
  }
  function toolEligible(i) {
    if (!activeTool) return false;
    if (activeTool.kind === "seed") return M.plotState(state, i) === "empty";
    if (activeTool.kind === "fert") return canFertilize(i);
    return canShovel(i);
  }
  function cancelTool(restoreFocus = false) {
    const wasActive = !!activeTool || toolShelfOpen;
    activeTool = null;
    toolShelfOpen = false;
    toolPlot = -1;
    syncToolMode();
    paintTool();
    if (restoreFocus && wasActive) (document.documentElement.classList.contains("light-note-mobile-rendering") ? $('[data-dock="tools"]') : $('[data-tool="hand"]'))?.focus({ preventScroll: true });
  }
  function syncToolMode() {
    const bar = $("#farmToolMode"),scene = $(".garden-scene"),dock = $("#gameTools");
    if (!bar || !scene) return;
    if (activeTool?.kind === "fert" && !state.fertilizers[activeTool.fert]) activeTool = null;
    if (activeTool?.kind === "seed" && !state.seeds[activeTool.seed]) activeTool = null;
    bar.hidden = !activeTool;
    scene.classList.toggle("farm-tool-selected", !!activeTool);
    scene.dataset.tool = activeTool?.kind || "hand";
    dock?.classList.toggle("tools-open", toolShelfOpen);
    const toggle = $('[data-dock="tools"]');
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(toolShelfOpen));
      toggle.setAttribute("aria-controls", "farmToolShelf");
      const art = toggle.querySelector(".farm-tool-icon");
      if (art) art.outerHTML = toolIcon(activeTool?.kind || "hand");
      toggle.setAttribute("aria-label", `农具${activeTool ? "，当前" + toolName() : ""}`);
      toggle.classList.toggle("tool-chosen", !!activeTool);
    }
    document.querySelectorAll("[data-tool]").forEach((el) => {
      if (!el.classList.contains("farm-tool")) return;
      el.setAttribute("aria-pressed", String(el.dataset.tool === (activeTool?.kind || "hand")));
      el.disabled = !!state.guide;
    });
    document.querySelectorAll(".farm-plot").forEach((el) => {
      const i = +el.dataset.plot,eligible = toolEligible(i);
      el.dataset.toolEligible = String(eligible);
      el.setAttribute("aria-label", activeTool ?
      `第 ${i + 1} 块地，${eligible ? "点击" + toolName() : "当前不能" + toolName()}` :
      plotLabel(i));
    });
    if (activeTool) {
      const kind = activeTool.kind;
      const title = kind === "seed" ? `${C(activeTool.seed).name} × ${state.seeds[activeTool.seed]}` : kind === "fert" ? `${M.FERT[activeTool.fert].name} × ${state.fertilizers[activeTool.fert]}` : "铲除中";
      const hint = kind === "seed" ? "连续点空地播种" : kind === "fert" ? "点作物施肥" : "点作物，确认后铲除";
      bar.innerHTML = `${toolIcon(kind)}<span><b>${title}</b><small>${hint}</small></span><button data-action="tool-cancel" aria-label="收起农具，Esc">取消</button>`;
    }
    if (typeof positionFeedback === "function") positionFeedback();
  }
  function selectTool(kind) {
    if (state.guide || !TOOL_NAMES[kind]) return;
    if (kind === "hand") return cancelTool(true);
    if (kind === "fert") return fertDialog();
    activeTool = { kind };
    toolShelfOpen = false;
    toolPlot = -1;
    syncToolMode();
    paintTool();
    focusToolTarget();
    announce(`已选择${TOOL_NAMES[kind]}，点击地块使用，按 Escape 取消`);
    toast("已拿起铲子 · 点作物后确认铲除");
  }
  function focusToolTarget() {
    if (!document.documentElement.classList.contains("kbd-nav")) return;
    (plotEl([...Array(open()).keys()].find(toolEligible)) || $("#farmToolMode button"))?.focus({ preventScroll: true });
  }
  function selectFertilizer(kind) {
    if (!M.FERT[kind] || !state.fertilizers[kind]) return;
    cancelTool();
    closeDialog(false);
    if (typeof setManorArea === "function") setManorArea("garden");
    toast("点生长中的作物，在详情里选肥使用");
  }
  function selectSeed(key) {
    if (state.guide || !C(key) || !state.seeds[key]) return;
    if (!plotsIn("empty").length) return toast("暂时没有空地，种子先留在背包");
    closeDialog(false);
    if (typeof setManorArea === "function") setManorArea("garden");
    activeTool = { kind: "seed", seed: key };
    toolShelfOpen = false;
    toolPlot = -1;
    syncToolMode();
    paintTool();
    focusToolTarget();
    announce(`已选择${C(key).name}，连续点空地播种，按 Escape 取消`);
  }
  async function fertilizePlot(i, kind) {
    if (isFertilizing(i) || isWatering(i)) return;
    const st = M.plotState(state, i);
    if (!canFertilize(i)) return toast(st === "dry" ? "先浇水，再施肥" : st === "growing" ? "本轮加速已达上限" : "请选择生长中的作物");
    const gain = await M.fertilize(state, i, kind);
    if (!gain) {cancelTool();return toast("这种肥料已用完");}
    const cursor = $("#toolCursor");
    const preview = toolPlot === i && cursor?.classList.contains("on") ? cursor.querySelector(".tool-art")?.getBoundingClientRect() : null;
    const origin = preview?.width > 0 && preview.height > 0 ? preview : null;
    const art = FarmArt.fertilizer(kind);
    const session = state,plant = state.plots[i],exhausted = !state.fertilizers[kind];
    const pending = fertilizing.get(session) || new Set();
    fertilizing.set(session, pending);
    pending.add(i);
    if (exhausted) activeTool = null;
    update();
    paintTool();
    syncToolMode();
    try {
      await GardenFX.sprinkle(plotEl(i), art, { origin });
      if (state !== session || state.plots[i] !== plant) return;
      update();
      GardenFX.floatText(plotEl(i), `−${shortDuration(gain)}`, "blue");
      GardenFX.burst(plotEl(i), { count: 6, kind: "spark", spread: 28 });
      announce(`施肥后缩短了 ${shortDuration(gain)}`);
    } finally {
      pending.delete(i);
      if (state === session) {syncToolMode();paintTool();}
    }
  }
  function removeConfirm(i) {
    const c = C(state.plots[i]?.crop);
    if (!c || !canShovel(i)) return;
    cancelTool();
    showDialog(
      `铲除${c.name}？`,
      c.tier === "rare" ? "这是稀有作物，铲除后种子不会退回，也买不到。" : "铲除后种子不会退回。",
      `<div class="plot-card-art small">${FarmArt.cropCard(state.plots[i].crop, M.growthStage(state, i))}</div>`,
      `<button class="button" data-action="close">再想想</button><button class="button danger" data-action="plot-remove-yes" data-plot="${i}">确认铲除</button>`
    );
  }

  // ---------- 背包与独立商店 ----------
  function seedTile(k, target) {
    const c = C(k),
      n = state.seeds[k] || 0;
    const guide = state.guide === "plant" && target === 0 && k === "radish";
    const use = c.bait ? "可作鱼饵" :
    c.fertilizer ? `每轮另得 1 份${M.FERT[c.fertilizer].name}，花束可售 ${c.sell} 积分` :
    c.sell === null ? "盛开后可长久观赏" : c.type === "flower" ? "采过后仍留在田里观赏" : c.harvests > 1 ? "一株多轮，无需重复浇水" : "收获后空出这块地";
    return `<div class="seed-tile seed-choice ${c.tier}" data-seed-kind="${k}"><div class="seed-pack">${FarmArt.packet(k)}${c.bait ? `<span class="seed-bait-badge" title="收获后可在工坊手作鱼饵"><img src="${R2_ART}icon-bait${k === "rainbowcorn" ? "-rainbow" : ""}.webp" alt="">鱼饵</span>` : ""}</div><div class="seed-copy"><strong>${c.name}</strong><small>浇水后 ${cycleText(c.first)}${c.sell === null ? "盛开" : "首收"}${c.harvests > 1 ? ` · 共 ${c.harvests} 轮` : ""}</small>${!c.bait ? `<small class="seed-use">${use}</small>` : ""}<span class="seed-discovery ${state.cropDex[k] ? "known" : ""}">${state.cropDex[k] ? "已收录图鉴" : c.sell === null ? "首次盛开可点亮图鉴" : "首次收获可点亮图鉴"}</span><span class="seed-count">× ${n}</span>${guide ? '<span class="plant-seed-cue">点击“种下”播种</span>' : ""}</div>${target !== null ? `<button class="tile-btn primary${guide ? " guide-plant-seed" : ""}" data-action="plant-seed" data-plot="${target}" data-seed="${k}">种下</button>` : `<button class="tile-btn primary" data-action="seed-select" data-seed="${k}">去播种</button>`}${c.fertilizer ? `<small class="seed-output-note">${use}</small>` : ""}</div>`;
  }
  const waitingFish = () => state.fish.filter((f) => !M.placed(state, f.id));
  const panelPositions = new Map();
  let panelSession = null;
  function rememberPanel() {
    const dialog = $("#dialog"),key = dialog?.dataset.panelKey;
    if (key && !$("#modal").hidden && panelSession === state) panelPositions.set(key, dialog.querySelector(".dialog-body").scrollTop);
  }
  function panelNavigation(key, selectors, kind) {
    if (panelSession !== state) {panelPositions.clear();panelSession = state;}
    const dialog = $("#dialog"),body = dialog.querySelector(".dialog-body");
    const nodes = selectors.map((selector) => body.querySelector(selector)).filter(Boolean);
    if (nodes.length) {
      const nav = document.createElement("div");nav.className = `panel-navigation ${kind}-navigation`;
      const focused = document.activeElement;
      dialog.insertBefore(nav, body);nav.append(...nodes);
      if (focused?.isConnected && nav.contains(focused)) focused.focus({ preventScroll: true });
    }
    dialog.dataset.panelKey = key;body.scrollTop = panelPositions.get(key) || 0;
  }
  function bagBody(tab, target) {
    const tabs = [
    ["seeds", "种子", count(state.seeds)],
    ["crops", "收获", count(state.crops)],
    ["fish", "待养", waitingFish().length],
    ["fert", "肥料", count(state.fertilizers)]];

    let body = target !== null ? "" : `<div class="bag-tabs" role="tablist" aria-label="背包分类">${tabs.map(([k, t, total]) => `<button role="tab" aria-selected="${tab === k}" data-action="bag-tab" data-tab="${k}" class="${tab === k ? "active" : ""}"><span class="bag-tab-art">${k === "seeds" ? FarmArt.packet("radish") : k === "crops" ? FarmArt.icon("carrot") : k === "fert" ? FarmArt.fertilizer("eco") : `<img src="knowledge-garden-v19/incoming/dock-r3/aquarium.webp" alt="">`}</span><span class="bag-tab-label">${t}</span><span class="bag-tab-count">${total}</span></button>`).join("")}</div>`;
    if (tab === "seeds") {
      const keys = M.seedChoices(state);
      const previous = target !== null ? M.replantSeed(state, target) : null;
      if (previous) body += `<div class="replant-row"><span class="replant-art">${FarmArt.packet(previous)}</span><div><strong>上次种了${C(previous).name}</strong><small>背包还有 ${state.seeds[previous]} 颗 · 种后照常浇水</small></div><button class="tile-btn" data-action="plant-seed" data-plot="${target}" data-seed="${previous}">再种一颗</button></div>`;
      body += keys.length ?
      `<div class="seed-grid seed-choice-grid">${keys.map((k) => seedTile(k, target)).join("")}</div>` :
      `<section class="inventory-empty"><div class="empty-art">${FarmArt.giftPack()}</div><h3>给这片土地挑一颗种子吧</h3><p>背包暂时空了。去商店挑选，或完成每日任务领取种子。</p><div><button class="tile-btn primary" data-action="shop-tab" data-tab="seeds">去商店</button><button class="tile-btn" data-action="daily">查看每日任务</button></div></section>`;
      if (target !== null) body += `<div class="seed-care-strip"><span>${toolSprite("water")}<span>每块地 <b>${R.plantWater}</b> 滴 · 现有 <b>${state.water}</b> 滴</span></span><small>${state.water < R.plantWater ? "完成每日任务补水后再浇灌" : "成熟后随时收获，不会枯萎"}</small></div>`;
    } else if (tab === "crops") {
      const keys = Object.keys(M.CROPS).filter((k) => state.crops[k] > 0);
      body += keys.length ?
      `<div class="seed-grid">${keys.
      map((k) => {
        const c = C(k);
        return `<div class="seed-tile crop ${c.tier}"><div class="seed-pack">${FarmArt.icon(k)}</div><div class="seed-copy"><strong>${c.name}</strong><small>${c.sell === null ? "观赏作物" : `商店收购 ${c.sell} 积分 / 份`}</small><span class="seed-count">× ${state.crops[k]}</span></div>${c.bait ? `<div class="tile-actions"><button class="tile-btn" data-action="manual-open" data-origin="bag" data-crop="${k}">去工坊</button></div>` : ""}</div>`;
      }).
      join("")}</div>` :
      `<section class="inventory-empty"><div class="empty-art">${FarmArt.icon("carrot")}</div><h3>菜篮正等着第一份收获</h3><p>成熟的果实收进背包，可以带去商店出售。</p><button class="tile-btn primary" data-action="close">回田里看看</button></section>`;

    }
    if (tab === "fert") body += fertilizerInventory();
    if (tab === "fish") {
      const fish = waitingFish();
      body += fish.length ? `<div class="bag-fish-grid">${fish.map((f) => `<article class="bag-fish-slot ${qClass(FISH[f.kind].quality) || "common"}"><div class="bag-fish-art">${fishArt(f.kind)}</div><strong>${FISH[f.kind].name}</strong><small>${FISH[f.kind].quality} · ${isCreature(f.kind) ? "观赏水族" : "可入住产肥"}</small><button class="tile-btn primary" data-action="${isCreature(f.kind) ? "assign-show" : "assign"}" data-fish="${f.id}">放入水舱</button></article>`).join("")}</div>` : `<section class="inventory-empty fish-empty"><div class="empty-art">${fishArt("clown")}</div><h3>下一位水中朋友还在路上</h3><p>去海边抛一竿，把新朋友带回来。</p><div><button class="tile-btn primary" data-action="fishing">去钓鱼</button><button class="tile-btn" data-action="tank-manage">看看已入住的伙伴</button></div></section>`;
      if (fish.length) body += '<p class="bag-hint">选一位伙伴，放进养鱼舱。</p>';
    }
    return body;
  }
  function bagDialog(tab = bagTab, target = null) {
    bagTab = tab = target !== null ? "seeds" : ["crops", "fish", "fert"].includes(tab) ? tab : "seeds";
    bagTarget = target;
    showDialog(
      target !== null ? `第 ${target + 1} 块地 · 选种子` : "背包",
      target !== null ? state.guide === "plant" ? "点击小萝卜旁的“种下”，播下第一颗种子。" : "选一种种子种下去。" : tab === "fert" ? "肥料收在这里，在作物详情中选用。" : "种子、收获、水族和肥料，都收在这里。",
      bagBody(tab, target),
      `${tab === "seeds" && target === null ? '<button class="button" data-action="growth-gifts">稀有种子来源</button>' : tab === "fert" ? '<button class="button" data-action="farm">去养鱼舱收肥</button>' : tab === "crops" || tab === "fish" ? `<button class="button" data-action="shop-tab" data-tab="sell-${tab === "fish" ? "fish" : "crops"}">前往商店</button>` : ""}<button class="button primary" data-action="close">回到庄园</button>`,
      true,
      "inventory-dialog"
    );
    panelNavigation(`bag:${bagTarget ?? "all"}:${tab}`, [".bag-tabs"], "bag");
  }
  function refreshInventory() {
    if (!$("#modal").hidden && $("#dialog").dataset.family === "inventory-dialog") bagDialog(bagTab, bagTarget);
  }
  function shopDialog(tab) {
    if (tab === "seeds" || tab === "aquatic" || tab === "facilities") {shopTab = tab;shopMode = "buy";}
    if (tab === "sell-fish" || tab === "sell-crops") {shopMode = "sell";shopSellTab = tab === "sell-fish" ? "fish" : "crops";}
    const lv = M.level(state);
    const buy = (action, count, price, attrs = "", label = `买 ${count}`) => `<button class="tile-btn${count === 1 ? " primary" : ""}" data-action="${action}" data-count="${count}" ${attrs} ${state.wallet >= price ? "" : "disabled"}>${label}</button>`;
    const metric = (label, value) => `<div><small>${label}</small><b>${value}</b></div>`;
    const cropCards = Object.entries(M.CROPS).filter(([, c]) => c.price !== null).sort((a, b) => a[1].unlock - b[1].unlock || a[1].first - b[1].first).map(([k, c]) => {
      const locked = lv < c.unlock;
      return `<article class="market-card ${locked ? "locked" : ""}"><header><h3>${c.name}</h3><span class="market-type ${c.type}">${c.type === "once" ? "单收" : c.type === "multi" ? "复收" : "剪花"}</span></header><div class="market-display"><div class="market-art">${FarmArt.packet(k)}</div><div class="market-stats">${metric("首收", cycleText(c.first))}${metric("可收", c.harvests + " 轮")}${c.harvests > 1 ? `<small>每隔 ${cycleText(c.every)} 再收</small>` : ""}</div></div><div class="market-stock"><span>收获 <b>${c.sell}</b> 积分 / 份</span><span>库存 <b>${state.seeds[k] || 0}</b></span></div><div class="market-estimate">${FarmArt.ui("crate")}完整采收预计回收 <b>${c.harvests * c.sell}</b> 积分</div><div class="market-price">${FarmArt.ui("coin")}<small>种子价</small><strong>${c.price}</strong><span>积分 / 颗</span>${c.bait ? '<span class="market-use">工坊制饵</span>' : ""}</div><div class="market-actions">${locked ? `<span class="market-lock">Lv.${c.unlock} 解锁</span>` : buy("buy-seed", 1, c.price, `data-seed="${k}"`) + buy("buy-seed", 5, c.price * 5, `data-seed="${k}"`)}</div></article>`;
    }).join("");
    const aquatic = `<article class="supply-card"><header><h3>普通鱼饵</h3><span>已有 ${state.bait} 份</span></header><div class="supply-art"><img src="${R2_ART}icon-bait.webp" alt=""></div><div class="supply-copy"><p>海边垂钓 · 每竿使用 1 份</p><div class="supply-offers"><div><small>单份</small><strong>${R.baitCost} <small>积分</small></strong>${buy("shop-buy-bait", 1, R.baitCost)}</div><div class="bundle-offer"><span class="market-discount">9.5 折</span><small>10 份装</small><strong>${M.baitPrice(10)} <small>积分</small><del>${R.baitCost * 10}</del></strong>${buy("shop-buy-bait", 10, M.baitPrice(10), "", "买 10")}</div></div></div></article><article class="supply-card"><header><h3>淡水鱼苗袋</h3><span>今日可购 ${M.fryLeft(state)} / ${R.fryDaily}</span></header><div class="supply-art">${FarmArt.fryBag()}</div><div class="supply-copy"><p>打开必得 1 位淡水伙伴，也可通过垂钓遇见</p><div class="fry-offer"><small>每袋 1 位 · 收进待养区</small><div class="market-price">${FarmArt.ui("coin")}<strong>${R.fryPrice}</strong><span>积分 / 袋</span></div><div class="market-actions">${M.fryLeft(state) ? buy("buy-fry", 1, R.fryPrice, "", "买 1 袋") : '<span class="market-lock">明天补货</span>'}</div></div></div></article>`;
    const facility = FarmFacilities.cards();
    showDialog("商店", "种下喜欢的作物，把收获带回商店；建造设施，让庄园慢慢丰富起来。",
    `<div class="shop-toolbar"><div class="fish-tabs shop-main-tabs" aria-label="商店交易"><button data-action="shop-mode" data-mode="buy" aria-pressed="${shopMode === "buy"}" class="${shopMode === "buy" ? "active" : ""}">${FarmArt.ui("pouch")}购买</button><button data-action="shop-mode" data-mode="sell" aria-pressed="${shopMode === "sell"}" class="${shopMode === "sell" ? "active" : ""}">${FarmArt.ui("basket")}出售</button><button data-action="shop-mode" data-mode="buyback" aria-pressed="${shopMode === "buyback"}" class="${shopMode === "buyback" ? "active" : ""}">${FarmArt.ui("receipt")}赎回</button></div></div>${shopMode !== "buy" ? tradeContent() : `<div class="fish-tabs shop-tabs" aria-label="商品分类"><button data-action="shop-tab" data-tab="seeds" aria-pressed="${shopTab === "seeds"}" class="${shopTab === "seeds" ? "active" : ""}">${FarmArt.ui("sprout")}种子</button><button data-action="shop-tab" data-tab="aquatic" aria-pressed="${shopTab === "aquatic"}" class="${shopTab === "aquatic" ? "active" : ""}">${FarmArt.ui("fish")}水族用品</button><button data-action="shop-tab" data-tab="facilities" aria-pressed="${shopTab === "facilities"}" class="${shopTab === "facilities" ? "active" : ""}">${FarmArt.ui("house")}设施</button></div><div class="${shopTab === "seeds" ? "market-grid" : shopTab === "facilities" ? "facility-grid" : "supply-grid"}">${shopTab === "seeds" ? cropCards : shopTab === "aquatic" ? aquatic : facility}</div>${shopTab === "seeds" ? '<p class="market-note">按基础产量估算完整采收的出售所得，不含额外增产。稀有种子来自成长奖励。</p>' : ""}`}`,
    `<button class="button" data-action="close">回到庄园</button>${shopMode === "buy" && lastPurchasedSeed && state.seeds[lastPurchasedSeed] ? `<button class="button primary" data-action="seed-select" data-seed="${lastPurchasedSeed}">去播种${C(lastPurchasedSeed).name}</button>` : ""}`, false, "farm-shop-dialog");
    $("#dialog").classList.toggle("shop-facilities", shopMode === "buy" && shopTab === "facilities");
    const head = $("#dialog .dialog-head");
    if (head) {
      let badge = head.querySelector(".shop-wallet");
      if (!badge) {badge = document.createElement("span");badge.className = "shop-wallet";head.append(badge);}
      badge.innerHTML = `${FarmArt.ui("coin")}积分 <b>${state.wallet}</b>`;
    }
    panelNavigation(`shop:${shopMode}:${shopMode === "buy" ? shopTab : shopSellTab}`, [".shop-toolbar", ".shop-tabs"], "shop");
  }
  function tradeContent() {
    const history = M.buybackEntries(state);
    const row = (r) => `<article class="buyback-row"><div class="buyback-art">${fishArt(r.fish.kind)}</div><div><strong>${FISH[r.fish.kind].name}</strong><small data-buyback-expiry="${r.soldAt + R.buybackHours}">剩余 ${clockTime(Math.max(0, r.soldAt + R.buybackHours - state.now))}</small></div><button class="tile-btn" data-action="shop-buyback" data-sale="${r.id}" data-quote="${M.buybackCost(r)}" ${state.wallet < M.buybackCost(r) ? "disabled" : ""}>赎回 · ${M.buybackCost(r)} 积分</button></article>`;
    if (shopMode === "buyback") return `<p class="trade-note">支持赎回的物品在出售后保留 ${R.buybackHours} 小时，过期离柜。新售出水族赎回加收 ${R.buybackFeePercent}%（向上取整，至少 1 积分），已有记录按原报价 · 最多保留最近 ${R.buybackLimit} 笔。</p><div class="buyback-list">${history.map(row).join("") || `<div class="farm-empty buyback-empty">${FarmArt.ui("receipt")}<strong>暂时没有可赎回的物品</strong><p>支持赎回的物品售出后，会在这里暂存。</p></div>`}</div>`;
    const tabs = `<div class="fish-tabs shop-tabs" aria-label="出售分类">${[["crops", "收获物"], ["fish", "待养水族"]].map(([key, name]) => `<button data-action="shop-sell-tab" data-tab="${key}" class="${shopSellTab === key ? "active" : ""}" aria-pressed="${shopSellTab === key}">${name}</button>`).join("")}</div>`;
    let cards = "";
    if (shopSellTab === "crops") cards = Object.entries(state.crops).filter(([key, n]) => n > 0 && C(key)?.sell != null).map(([key, n]) => `<article class="market-card trade-card"><div class="trade-art">${FarmArt.icon(key)}</div><header><h3>${C(key).name}</h3><span class="market-type">× ${n}</span></header><div class="market-price"><small>出售价格</small><strong>${C(key).sell}</strong><span>积分 / 份</span></div><button class="tile-btn primary" data-action="shop-sell-crop" data-crop="${key}" aria-label="出售${C(key).name}">出售</button></article>`).join("");else
    {
      const groups = new Map();state.fish.filter((f) => !M.placed(state, f.id) && state.firstCompanionPending !== f.id).forEach((f) => {if (!groups.has(f.kind)) groups.set(f.kind, []);groups.get(f.kind).push(f);});
      cards = [...groups].map(([key, fish]) => `<article class="market-card trade-card"><div class="trade-art">${fishArt(key)}</div><header><h3>${FISH[key].name}</h3><span class="market-type">× ${fish.length}</span></header><div class="market-price"><small>出售价格</small><strong>${M.sellPrice(key, FISH)}</strong><span>积分 / 位</span></div><button class="tile-btn primary" data-action="sell" data-fish="${fish[0].id}" data-from="shop" aria-label="出售${FISH[key].name}">出售 1 位</button></article>`).join("");
    }
    return `${tabs}<div class="market-grid trade-grid">${cards || `<div class="farm-empty">${shopSellTab === "crops" ? "仓库里还没有可出售的收获物" : "待养区没有可出售的水族"}</div>`}</div>${shopSellTab === "fish" ? '<p class="trade-note">已入住的伙伴需先从养鱼舱收回。</p>' : ""}${history.length ? `<section class="recent-buyback"><h3>最近售出</h3>${row(history[0])}</section>` : ""}`;
  }
  function purchase(type, count = 1, seed = null, origin = "shop") {
    count = Number(count);
    const crop = C(seed);
    if (type === "seed" && (!crop || crop.price === null || !Number.isInteger(count) || count < 1 || count > 10 || M.level(state) < crop.unlock) ||
    type === "bait" && (!Number.isInteger(count) || count < 1 || count > R.baitBundleCount) || type === "fry" && (count !== 1 || !M.fryLeft(state)) ||
    type === "purifier" && (count !== 1 || state.purifier || M.level(state) < R.purifierLevels[0].gardenLevel) || !["seed", "bait", "fry", "purifier"].includes(type)) return;
    const name = type === "seed" ? crop.name + "种子" : type === "bait" ? "普通鱼饵" : type === "purifier" ? "海水过滤器" : "淡水鱼苗袋";
    const total = type === "bait" ? M.baitPrice(count) : count * (type === "seed" ? crop.price : type === "purifier" ? R.purifierCost : R.fryPrice);
    const art = type === "seed" ? FarmArt.packet(seed) : type === "purifier" ? purifierArt() : type === "fry" ? FarmArt.fryBag() : `<img src="${R2_ART}icon-bait.webp" alt="">`;
    const fixed = type === "fry" || type === "purifier";
    pendingPurchase = { type, count, seed, origin, session: state };
    showDialog("确认购买", "",
    `<div class="purchase-item"><div class="purchase-art">${art}</div><div><h3>${name}</h3><div class="quantity-picker" aria-label="购买数量"><button data-action="purchase-quantity" data-count="${count - 1}" aria-label="减少购买数量" ${count <= 1 || fixed ? "disabled" : ""}>−</button><b>${count}</b><button data-action="purchase-quantity" data-count="${count + 1}" aria-label="增加购买数量" ${fixed || count >= (type === "seed" ? 10 : R.baitBundleCount) ? "disabled" : ""}>＋</button></div></div></div><div class="purchase-total"><span>合计${type === "bait" && count === R.baitBundleCount ? " · 10 份装 9.5 折" : ""}</span><strong>${total} 积分</strong></div><p class="purchase-balance">当前 ${state.wallet} 积分 · 购买后 ${Math.max(0, state.wallet - total)} 积分</p>${type === "fry" ? '<p class="bag-hint">确认后立即打开，随机获得一种淡水生物。</p>' : type === "purifier" ? `<p class="bag-hint">${document.documentElement.classList.contains("light-note-mobile-rendering") ? "建在海湾左侧石台" : "建在养鱼舱后侧的独立石台"}，每天可收 ${R.purifierWater} 滴水。</p>` : ""}`,
    `<button class="button" data-action="purchase-cancel">再想想</button><button class="button primary" data-action="purchase-confirm" ${state.wallet < total ? "disabled" : ""}>确认购买 · ${total} 积分</button>`);
    $("#dialog").classList.add("purchase-dialog");
  }
  function dismissPurchase() {pendingPurchase = null;pendingSale = null;}
  function saleDialog(key, count = 1, origin = "bag") {
    const c = C(key),stock = state.crops[key] || 0;
    if (!c || !stock || c.sell === null || !Number.isInteger(count)) return;
    count = Math.max(1, Math.min(stock, count));
    const quote = M.quoteCropSale(state, key, count);
    pendingSale = { key, count, origin, session: state };
    showDialog(`卖出${c.name}`, "选择数量，剩下的继续留在背包。",
    `<div class="purchase-item"><div class="purchase-art">${FarmArt.icon(key)}</div><div><h3>${c.name} · 库存 ${stock}</h3><div class="quantity-picker" aria-label="卖出数量"><button data-action="sale-quantity" data-count="${count - 1}" aria-label="减少卖出数量" ${count <= 1 ? "disabled" : ""}>−</button><b>${count}</b><button data-action="sale-quantity" data-count="${count + 1}" aria-label="增加卖出数量" ${count >= stock ? "disabled" : ""}>＋</button></div></div></div><div class="purchase-total"><span>实际卖出 ${quote.sold} 份</span><strong>+${quote.points} 积分</strong></div><p class="purchase-balance">卖出后保留 ${quote.left} 份</p>${c.bait ? '<p class="bag-hint">每份也可换 1 份鱼饵，想去海钓可以留一些。</p>' : c.tier === "rare" ? '<p class="bag-hint">这是稀有收获，种子无法在商店购买。</p>' : ""}`,
    `<button class="button" data-action="${origin === "shop" ? "shop-mode" : "bag-tab"}" data-mode="sell" data-tab="crops">暂不卖</button><button class="button primary" data-action="sale-confirm" ${quote.sold ? "" : "disabled"}>卖 ${quote.sold} 份 · +${quote.points} 积分</button>`);
    $("#dialog").classList.add("sale-dialog", "purchase-dialog");
  }
  async function confirmSale(button) {
    const p = pendingSale;pendingSale = null;
    if (!p || p.session !== state || !$("#dialog").classList.contains("sale-dialog")) return;
    button.disabled = true;
    const result = await M.sellCrop(state, p.key, p.count);
    update();
    if (p.origin === "shop") shopDialog("sell-crops");else bagDialog("crops");
    toast(result.sold ? `卖出${C(p.key).name} × ${result.sold} · +${result.points} 积分` : "库存已变化，请重新选择卖出数量");
  }
  function cancelPurchase() {
    const p = pendingPurchase;pendingPurchase = null;
    if (p?.origin === "bait") baitDialog();else shopDialog();
  }
  function back() {
    if (pendingSale?.session === state && $("#dialog").classList.contains("sale-dialog")) {
      const origin = pendingSale.origin;pendingSale = null;
      if (origin === "shop") shopDialog("sell-crops");else bagDialog("crops");return true;
    }
    if (pendingPurchase?.session === state && $("#dialog").classList.contains("purchase-dialog")) {cancelPurchase();return true;}
    return false;
  }
  async function confirmPurchase(button) {
    const p = pendingPurchase;pendingPurchase = null;
    if (!p || p.session !== state || !$("#dialog").classList.contains("purchase-dialog")) return;
    button.disabled = true;
    if (p.type === "fry") return await buyFry(button);
    if (p.type === "purifier") {
      const ok = await M.buyPurifier(state);
      if (!ok) {update();shopDialog("facilities");return toast("未建造，余额或设施状态已变化");}
      closeDialog(false);if (typeof setManorArea === "function") setManorArea("bay");update();
      const fixture = $("#purifierSpot");fixture?.classList.add("just-built");
      const session = state;setTimeout(() => {if (state === session) fixture?.classList.remove("just-built");}, 900);
      toast("海水过滤器已建成 · 24 小时后可收第一批清水");
      fixture?.focus({ preventScroll: true });return;
    }
    const ok = p.type === "seed" ? await M.buySeed(state, p.seed, p.count) : await M.buyBait(state, p.count);
    if (ok && p.type === "seed") lastPurchasedSeed = p.seed;
    update();
    if (p.origin === "bait") baitDialog();else shopDialog();
    toast(ok ? `${p.type === "seed" ? C(p.seed).name + "种子" : "鱼饵"} +${p.count} · 已收好` : "未购买，余额或解锁状态已变化");
  }
  async function buyFry(btn) {
    const result = await M.buyFry(state, FISH);
    if (!result) return toast(M.fryLeft(state) ? "积分不够" : "今天的鱼苗袋买完了，明天再来");
    closeDialog(false);
    update();
    await revealCaught(result, $(".seed-stall") || btn, { source: "fry" });
  }

  // 背包保管肥料；施用与铲除都在作物详情里完成。
  function fertilizerInventory() {
    return `<div class="fert-inventory">${Object.entries(M.FERT).map(([key, f]) => {
      const stock = state.fertilizers[key] || 0;
      const qualities = [...new Set(Object.values(FISH).filter((fish) => fish.fertilizer === key).map((fish) => fish.quality))];
      const flowers = Object.values(M.CROPS).filter((crop) => crop.fertilizer === key).map((crop) => crop.name);
      const source = key === "rabbit" ? "野兔每日赠送" : flowers.length ? `${qualities.join("、")}鱼类产出 · ${flowers.join("、")}剪花` : `${qualities.join("、")}鱼类在产肥位产出`;
      return `<article class="fert-item ${stock ? "" : "empty"}"><div class="fert-item-art">${fertIcon(key)}</div><h3>${f.name}</h3><small class="fert-item-source">${source}</small><span class="fert-item-stock">库存 <b>${stock}</b> 份</span><div class="fert-item-effect"><small>缩短生长</small><strong>${shortDuration(f.hours)}</strong></div><button class="tile-btn ${stock ? "primary" : ""}" data-action="fert-select" data-fert="${key}" aria-label="去选作物使用${f.name}" ${stock ? "" : "disabled"}>${stock ? "去选作物" : "暂无"}</button></article>`;
    }).join("")}</div><p class="fert-note">在作物详情中直接施用 · 每轮最多加速一半时长</p>`;
  }
  function fertDialog() {bagDialog("fert");}

  // ---------- 图鉴：作物 ----------
  function cropAtlasCard(k) {
    const got = !!state.cropDex[k];
    return `<button class="atlas-card ${got ? "discovered" : ""} ${C(k).tier}" data-action="crop-detail" data-crop="${k}" data-atlas-entry="crop" aria-label="${got ? C(k).name : "尚未收获的作物"}${M.atlasEntryUnread(state, "crop", k) ? "，新物种未查看" : ""}">${M.atlasEntryUnread(state, "crop", k) ? '<i class="atlas-unread-dot" aria-hidden="true"></i>' : ""}<span class="crop-card-art ${got ? "" : "silhouette"}">${FarmArt.icon(k)}</span></button>`;
  }
  function cropDetail(k) {
    const c = C(k),
      d = state.cropDex[k];
    showDialog(
      d ? c.name : "尚未收获",
      d ? `${TIER_TEXT[c.tier]} · ${c.typeLabel || TYPE_TEXT[c.type]} · 第 ${d.first} 天第一次收获，共 ${d.count} 次` : c.tier === "rare" ? `获取途径：${RARE_SOURCE[k]}` : `商店有售 · 庄园 Lv.${c.unlock} 解锁`,
      `<div class="fish-detail-art crop-detail-art ${d ? "" : "silhouette"}">${FarmArt.cropPreview(k, 4)}</div>${d ? `<div class="detail-grid"><div><small>成熟时间</small><strong>${cycleText(c.first)}</strong></div><div><small>卖出</small><strong>${c.sell === null ? "不可出售" : `${c.sell} 积分 / 份`}</strong></div><div><small>收获经验</small><strong>${c.xp}</strong></div><div><small>种子</small><strong>${c.price === null ? "不可购买" : `${c.price} 积分`}</strong></div></div>${c.fertilizer ? `<div class="info-box">首次 ${cycleText(c.first)}，之后每 ${cycleText(c.every)} 可剪一轮，共 ${c.harvests} 轮。每轮收 1 束${c.name}，另得 1 份${M.FERT[c.fertilizer].name}（缩短 ${shortDuration(M.FERT[c.fertilizer].hours)}）。剪完仍可留在田里观赏。</div>` : ""}` : ""}`,
      `${state.seeds[k] ? `<button class="button primary" data-action="seed-select" data-seed="${k}">去播种</button>` : c.price !== null ? `<button class="button primary" data-action="shop-tab" data-tab="seeds">去商店</button>` : `<button class="button primary" data-action="level">查看成长奖励</button>`}`, false, "", "atlas"
    );
  }

  // ---------- 兔子便便与奖励演示 ----------
  function birdGiftPoint() {
    const d = cal(),mobile = FarmStage.profile() === "mobile";
    // 手机礼物落在水舱下方广场，和兔子、批量操作条分开。
    if (mobile) return d.area ? [682, 1495] : d.birdGift;
    return [d.plots[5].center[0], Math.max(...d.plots.map((p) => p.hitRect[1] + p.hitRect[3])) + 75];
  }
  function birdGiftScenePoint() {const [x, y] = FarmStage.toScene(...birdGiftPoint());return { x, y };}
  async function deliverBirdSeed() {
    if (GardenLive.busy || state.casting) return;
    try {
      if (!(await M.deliverBirdSeed(state))) return;
      sync();
      announce("麻雀带回了一颗小萝卜种子，落在庄园的小路上");
    } catch { /* Automatic delivery retries on a later visit without interrupting the player's action. */ }
  }
  async function pickBirdSeed(btn) {
    if (!(await M.pickBirdSeed(state))) return;
    const from = btn.getBoundingClientRect();
    update();
    GardenFX.flyTo({ getBoundingClientRect: () => from }, $('[data-dock="bag"]'), FarmArt.packet("radish"), { size: 32 });
    toast("麻雀的小礼物 · 小萝卜种子 +1");
  }
  async function pickPoop(btn) {
    if (!(await M.pickPoop(state))) return;
    const from = btn.getBoundingClientRect();
    GardenFX.flyTo({ getBoundingClientRect: () => from }, fertilizerTarget(), `${FarmArt.fertilizer("rabbit")}`, { size: 34 });
    update();
    toast("兔子肥 +1 · 已收好");
  }
  function rewardsHTML() {
    const claimed = id => !!state.rewards[id === "week-all" ? `week-all:${state.weekKey}` : id];
    return `<h3 class="sub-head">稀有种子的获取途径</h3>${REWARDS.map(
      (r) => `<div class="option-row"><div class="option-copy"><h3>${r.title}</h3><p>${r.seed ? `${C(r.seed).name}种子 × 1` : "随机一颗稀有种子"}</p></div><button class="button ${claimed(r.id) ? "soft" : ""}" data-action="reward-demo" data-reward="${r.id}" ${claimed(r.id) || !state.supplyEligibility?.[r.id] ? "disabled" : ""}>${claimed(r.id) ? "已领取 ✓" : state.supplyEligibility?.[r.id] ? "领取" : "未达成"}</button></div>`
    ).join("")}<div class="info-box">这些奖励在轻笺的连签、每周挑战、成就和图鉴里程碑中发放，稀有种子不能用积分购买。</div>`;
  }
  async function claimReward(id) {
    const r = REWARDS.find((x) => x.id === id);
    if (!r) return;
    const reward = await GardenLive.claimSupply(state, id);
    if (!reward) {toast("奖励尚未达成或已经领取");return;}
    const seed = reward.seed;
    closeDialog(false);
    update();
    await GardenFX.revealCatch(null, {
      art: FarmArt.packet(seed),
      name: `${C(seed).name}种子`,
      quality: "稀有种子",
      qualityClass: "legend",
      size: `${r.title} · 不可购买，种下后 ${cycleText(C(seed).first)}${C(seed).type === "flower" ? "盛开" : "成熟"}`,
      discovered: false,
      actions: [{ key: "ok", label: "收进背包", primary: true }]
    });
    GardenFX.bump($('[data-dock="bag"]'));
  }

  // ---------- 事件 ----------
  async function handle(a, b) {
    const i = b.dataset.plot !== undefined ? +b.dataset.plot : null;
    switch (a) {
      case "plot":
        await onPlot(i);
        return true;
      case "plot-card":
        plotCard(i);
        return true;
      case "plant-seed":
        await plantAt(i, b.dataset.seed);
        return true;
      case "bag":
        bagDialog(state.discoveryGuide === "place" ? "fish" : bagTab, null);
        return true;
      case "stall":
        shopDialog();
        return true;
      case "shop-mode":
        shopMode = ["sell", "buyback"].includes(b.dataset.mode) ? b.dataset.mode : "buy";
        shopDialog();return true;
      case "shop-sell-tab":
        shopSellTab = b.dataset.tab === "crops" ? "crops" : "fish";shopMode = "sell";shopDialog();return true;
      case "shop-sell-crop":
        saleDialog(b.dataset.crop, 1, "shop");return true;
      case "shop-buyback":{
          const fish = await M.buyback(state, +b.dataset.sale, FISH, +b.dataset.quote);update();shopDialog();
          toast(fish ? `${FISH[fish.kind].name}已回到待养区` : "未赎回，余额或保留时间已变化");return true;
        }
      case "shop-tab":
        shopDialog(b.dataset.tab);
        return true;
      case "buy-purifier":
        purchase("purifier", 1);return true;
      case "purifier-collect":
        await collectPurifier();return true;
      case "purifier-focus":
        closeDialog(false);if (typeof setManorArea === "function") setManorArea("bay");$("#purifierSpot")?.focus({ preventScroll: true });return true;
      case "shop-buy-bait":
        purchase("bait", +b.dataset.count);
        return true;
      case "bag-tab":
        bagDialog(b.dataset.tab, bagTarget);
        return true;
      case "seed-select":
        selectSeed(b.dataset.seed);
        return true;
      case "buy-seed":
        purchase("seed", +b.dataset.count, b.dataset.seed);
        return true;
      case "buy-fry":
        purchase("fry");
        return true;
      case "purchase-quantity":{
          const p = pendingPurchase;
          if (p?.session === state) purchase(p.type, +b.dataset.count, p.seed, p.origin);
          return true;
        }
      case "sale-quantity":
        if (pendingSale?.session === state) saleDialog(pendingSale.key, +b.dataset.count, pendingSale.origin);
        return true;
      case "sale-confirm":
        await confirmSale(b);
        return true;
      case "purchase-confirm":
        await confirmPurchase(b);
        return true;
      case "purchase-cancel":
        cancelPurchase();
        return true;
      case "sell-crop":
        shopDialog("sell-crops");
        return true;
      case "fert-select":
        if (b.dataset.plot !== undefined) {
          const plot = Number(b.dataset.plot),kind = b.dataset.fert;
          if (Number.isInteger(plot) && M.FERT[kind] && state.fertilizers[kind] > 0) {
            cancelTool();closeDialog(false);await fertilizePlot(plot, kind);
          }
        } else selectFertilizer(b.dataset.fert);
        return true;
      case "tool-select":
        selectTool(b.dataset.tool);
        return true;
      case "tools-toggle":
        toolShelfOpen = !toolShelfOpen;
        syncToolMode();
        if (toolShelfOpen && document.documentElement.classList.contains("kbd-nav")) $('[data-tool="hand"]')?.focus({ preventScroll: true });
        return true;
      case "tool-cancel":
      case "fert-cancel":
        cancelTool(true);
        return true;
      case "plot-remove":
        removeConfirm(i);
        return true;
      case "plot-remove-yes":
        if (await M.remove(state, i)) {
          cancelTool();
          closeDialog(false);
          update();
          GardenFX.burst(plotEl(i), { count: 10, kind: "soil", spread: 50 });
          toast("已铲除，这块地空出来了");
        }
        return true;
      case "fert":
        fertDialog();
        return true;
      case "bird-seed":
        await pickBirdSeed(b);
        return true;
      case "poop":
        await pickPoop(b);
        return true;
      case "reward-demo":
        await claimReward(b.dataset.reward);
        return true;
      case "crop-detail":
        cropDetail(b.dataset.crop);
        if (b.dataset.atlasEntry === "crop") void readAtlasEntry("crop", b.dataset.crop);
        return true;
    }
    return false;
  }
  // ---------- 地块工具指针：播种、浇水、摘取与选定的肥料 ----------
  // 位图跟随指针；触屏用顶部工具状态，不显示悬浮光标。
  const TOOL_OF = { empty: "seed", dry: "water", ripe: "harvest" };
  let toolPlot = -1;
  let lastPointer = null;
  function toolFor(i) {
    if (!$("#modal").hidden) return "";
    if (state.casting) return "";
    if (activeTool && lastPointer) {
      const r = $(".garden-scene").getBoundingClientRect();
      const { x, y } = lastPointer;
      const control = document.elementFromPoint?.(x, y)?.closest?.(".game-hud,.game-dock,.farm-tool-mode");
      if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height && !control) return activeTool.kind;
    }
    if (i < 0 || isWatering(i) || isFertilizing(i) || !state.plots[i]) return "";
    if (activeTool) return "";
    if (state.guide && (i !== 0 || !["plant", "water"].includes(state.guide))) return "";
    return TOOL_OF[M.plotState(state, i)] || "";
  }
  function toolHTML(tool) {
    if (tool === "harvest") return `<img class="tool-art" src="${R2_ART}hand-open.webp" alt="">`;
    if (tool === "fert") return `<span class="tool-art">${FarmArt.fertilizer(activeTool.fert)}</span>`;
    if (tool === "shovel") return `<img class="tool-art" src="${R2_ART}tool-trowel.webp" alt="" draggable="false">`;
    if (tool === "seed" && activeTool?.kind === "seed") return `<span class="tool-art seed-tool-art">${FarmArt.packet(activeTool.seed)}</span>`;
    if (tool === "seed") return `<img class="tool-art" src="${FarmArt.BASE}seed-basic-gift.webp" alt="" draggable="false">`;
    return `<span class="tool-art">${toolSprite("water")}</span>`;
  }
  // 不传坐标时只按当前地块状态刷新（浇完水、收完菜后指针随之变化）
  function paintTool(x, y) {
    const cur = $("#toolCursor"),
      scene = $(".garden-scene");
    if (!cur || !scene) return;
    // 动画期间也更新坐标，结束后不会把工具重画在上一块田上。
    if (x !== undefined) {
      const r = scene.getBoundingClientRect();
      cur.style.translate = `${x - r.left}px ${y - r.top}px`;
    }
    const tool = toolFor(toolPlot);
    scene.classList.toggle("tool-active", !!tool);
    if (!tool) {
      cur.className = "tool-cursor";
      return;
    }
    const short = activeTool ? toolPlot >= 0 && !toolEligible(toolPlot) : tool === "water" && state.water < R.plantWater;
    const key = tool === "fert" ? `fert-${activeTool.fert}` : tool === "seed" ? `seed-${activeTool?.seed || "auto"}` : tool;
    if (cur.dataset.key !== key) {
      cur.innerHTML = toolHTML(tool);
      cur.dataset.key = key;
    }
    cur.className = `tool-cursor on ${tool}${short ? " short" : ""}`;
  }
  if (typeof document !== "undefined") {
    document.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType === "touch") return;
        lastPointer = { x: e.clientX, y: e.clientY };
        const plot = e.target.closest?.(".farm-plot");
        toolPlot = plot ? +plot.dataset.plot : -1;
        paintTool(e.clientX, e.clientY);
      },
      { passive: true }
    );
    // 指针移出窗口
    document.addEventListener("pointerout", (e) => {
      if (e.relatedTarget) return;
      lastPointer = null;
      toolPlot = -1;
      paintTool();
    });
    // 按下只处理输入类型。真正执行成功后再反馈，取消 / 无效操作不播放假动作。
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {lastPointer = null;toolPlot = -1;paintTool();} else
      if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
        lastPointer = { x: e.clientX, y: e.clientY };
        paintTool(e.clientX, e.clientY);
      }
    });
  }

  return { refreshInventory, birdGiftScenePoint, deliverBirdSeed, needsBirdSeed: () => cal().area !== "bay" && M.birdCanDeliver(state), purchase, dismissPurchase, waitingFish, shopDialog, toolsHTML, toolIcon, fertilizerTarget, purifierHTML, layerHTML, sync, relayout, refreshClocks, stateKey, handle, bagDialog, fertDialog, cancelTool, cropAtlasCard, rewardsHTML, plotsIn, open, TYPE_TEXT, RARE_SOURCE, quadMatrix, coverQuad, rememberPanel, back };
})();
