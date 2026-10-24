/* R18 facilities. All inventory, time and limits belong to GardenModel; this module only renders and dispatches. */
const FarmFacilities = (() => {
  const BASE = "knowledge-garden-v19/farm/";
  const keys = ["workshop", "beehive"];
  let workshopPane = "manual",workshopOrigin = "scene",basicRecipe = "corn",basicCount = 1;
  let recipe = "fruit",batch = 1,flower = "lavender",target = null,pendingBuild = null,
    upgradeSession = null,upgradeLevel = null,selectedMaterials = [],pendingUpgrade = null,detailOrigin = "scene";
  const config = (key) => M.FACILITIES[key];
  const img = (file, cls = "") => `<img class="${cls}" src="${BASE}${file}" alt="" draggable="false">`;
  function art(key, sealed = false) {
    const file = (typeof FarmStage !== "undefined" ? FarmStage.cal().facilitySprites?.[key] : null) || (key === "workshop" ? "workshop-states-r22.webp" : "hive-states-r18.webp");
    if (key === "beehive" && file === "hive-states-r33.webp") return `<span class="r18-sprite hive-native-art" data-frame="${sealed ? 1 : 0}" aria-hidden="true">${img("hive-built-r33.webp", "hive-built-img")}${img(file, "hive-sealed-img")}</span>`;
    return `<span class="r18-sprite${file === "workshop-states-r33.webp" ? " workshop-native-art" : ""}" data-frame="${sealed ? 1 : 0}" aria-hidden="true">${img(file)}</span>`;
  }
  // Scene-only crops preserve the approved mobile viewing angle; dialogs keep their catalog art.
  function nativeSceneArt(key, sealed = false) {
    const piece = FarmStage.cal().nativePieces?.[key];if (!piece) return "";
    const frame = (kind, i) => {
      const [l, t, r, b] = piece[kind],w = r - l,h = b - t,sourceH = kind === "built" ? 1712 : 1711;
      return `<span class="native-prop-frame" data-native-frame="${i}"><img src="${BASE}mobile-machines-${kind}-r48.png" alt="" draggable="false" style="left:${-l / w * 100}%;top:${-t / h * 100}%;width:${919 / w * 100}%;height:${sourceH / h * 100}%"></span>`;
    };
    return `<span class="r18-sprite scene-native-prop" data-frame="${sealed ? 1 : 0}" aria-hidden="true">${frame("built", 0)}${frame("sealed", 1)}</span>`;
  }
  const sceneArt = (key, sealed = false) => nativeSceneArt(key, sealed) || art(key, sealed);
  const baitArt = (key) => `<span class="r18-sprite bait-jar" data-frame="${key === "herb" ? 1 : 0}" aria-hidden="true">${img("crafted-baits-r18.webp")}</span>`;
  const beeArt = () => img("bee-r18.webp", "bee-art");
  function purifierArt(level = 0) {
    const bounds = [[.05263, .11164, .87879, .98086], [.05901, .17225, .78469, .95215], [.11643, .07815, .95375, .9075], [.05742, .00319, .91228, .9362]][level];
    const [l, t, r, b] = bounds,s = Math.min(.88 / (r - l), .79 / (b - t));
    return `<span class="purifier-grade${level ? "" : " purifier-image"}" data-level="${level}" style="--grade-x:${-(level % 2) * 50}%;--grade-y:${-Math.floor(level / 2) * 50}%;--grade-size:${s * 100}%;--grade-left:${(0.5 - (l + r) / 2 * s) * 100}%;--grade-top:${(.89 - b * s) * 100}%"><span class="purifier-cell">${img("purifier-states-r22.webp")}</span></span>`;
  }
  const craftClock = (hours) => {const m = Math.max(1, Math.ceil(hours * 60));return `${Math.floor(m / 60)}小时${m % 60 ? `${m % 60}分` : ""}`;};
  const visible = (key, d = FarmStage.cal()) => !!d.facilities?.[key] && (!d.area || d.area === (key === "beehive" ? "garden" : "bay"));
  function sceneHTML() {
    return keys.map((key) => `<button id="${key}Spot" class="scene-facility ${key}-fixture" data-action="facility-open" data-facility="${key}" type="button" hidden><span class="fixture-art">${sceneArt(key, !state[key])}</span><span class="fixture-hit" aria-hidden="true"></span><span class="facility-bees" aria-hidden="true">${key === "beehive" ? Array.from({ length: 2 }, () => beeArt()).join("") : ""}</span><span class="fixture-state"></span></button>`).join("");
  }
  function sync() {
    const d = FarmStage.cal();
    for (const key of keys) {
      const el = document.getElementById(`${key}Spot`);if (!el) continue;
      el.hidden = !visible(key, d) || !state.adopted || !!state.guide;
      if (el.hidden) continue;
      const owned = !!state[key],def = config(key),pose = FarmStage.fixturePose(d, key, !owned);
      // On the small terrace, transparent atlas padding must not cover the return sign.
      const native = !!d.nativePieces?.[key];
      const trim = !native && d.area === "bay" && key === "workshop" && d.facilityVisuals?.[key];
      const bounds = trim ? FarmStage.fixtureBounds(d, key) : null;
      const site = bounds ? [bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]] : pose.rect;
      const [x, y] = FarmStage.toScene(site[0], site[1]),scale = FarmStage.scale();
      el.style.left = x + "px";el.style.top = y + "px";el.style.width = site[2] * scale + "px";el.style.height = site[3] * scale + "px";
      el.style.setProperty("--fixture-shear", pose.shear);
      el.classList.toggle("trimmed-hit", !!trim);
      el.classList.toggle("native-click", native);
      const hit = d.facilityHit?.[key]?.[owned ? 'built' : 'sealed'];
      el.classList.toggle("precise-hit", !!hit);
      if (hit) el.style.setProperty("--fixture-hit", FarmStage.hitClip(hit));
      const artwork = el.querySelector(".fixture-art");
      artwork.style.left = (pose.rect[0] - site[0]) * scale + "px";artwork.style.top = (pose.rect[1] - site[1]) * scale + "px";
      artwork.style.width = pose.rect[2] * scale + "px";artwork.style.height = pose.rect[3] * scale + "px";
      const target = el.querySelector('.fixture-hit');
      for (const prop of ['left', 'top', 'width', 'height']) target.style[prop] = artwork.style[prop];
      const sprite = el.querySelector(".r18-sprite");sprite.dataset.frame = owned ? "0" : "1";
      el.classList.toggle("is-sealed", !owned);el.classList.toggle("hide-caption", state.casting);
      let label;
      if (!owned) {el.dataset.state = "sealed";label = M.level(state) < def.gardenLevel ? `Lv.${def.gardenLevel} 解锁` : "待建造";} else
      if (key === "workshop") {
        const status = M.workshopStatus(state);el.dataset.state = status.phase;
        label = status.phase === "ready" ? "成品待领" : status.phase === "crafting" ? craftClock(status.remaining) : def.name;
      } else {
        const status = M.beehiveStatus(state);el.dataset.state = status.usedToday ? "spent" : status.pollen ? "ready" : "empty";
        label = status.usedToday ? "今日已授粉" : status.pollen ? `花粉 ${status.pollen}/6` : "补充花粉";
      }
      el.querySelector(".fixture-state").textContent = !owned && native ? M.level(state) < def.gardenLevel ? `Lv.${def.gardenLevel}` : def.name : label;
      el.setAttribute("aria-label", `${owned ? "" : "封存的"}${def.name}，${label}，点击${owned ? "使用" : "查看建造条件"}`);
    }
    refreshClocks();
  }
  function open(key, origin = "scene") {
    if (![...keys, "purifier"].includes(key)) return;
    if (key === "workshop") {workshopOrigin = origin;workshopPane = M.workshopStatus(state).phase === "idle" || !state.workshop ? "manual" : "targeted";}
    if (!state[key] || key === "purifier") return detailDialog(key, origin);
    if (key === "workshop") workshopDialog();else beehiveDialog();
  }
  function detailDialog(key, origin = detailOrigin) {
    if (![...keys, "purifier"].includes(key)) return;
    detailOrigin = origin;
    const water = key === "purifier",p = water ? M.purifierStatus(state) : null,owned = water ? p.owned : !!state[key];
    const def = water ? { name: "海水净化器", cost: R.purifierCost, gardenLevel: 8 } : config(key);
    const rows = key === "workshop" ? [["clock", "制作时间", "2 小时 / 批"], ["crate", "每批产出", "1–3 份"], ["coin", "建造价格", `${def.cost} 积分`], ["build", "建造限制", "限建 1 台"]] : key === "beehive" ? [["pollen", "每日授粉", "1 次 / 天"], ["crate", "花粉容量", "最多 6 份"], ["coin", "建造价格", `${def.cost} 积分`], ["sprout", "收获加成", "下一轮 +1 份"]] : [["water", "每日产水", `${p.daily || 6} 滴`], ["coin", "建造价格", `${def.cost} 积分`], ["build", "建造限制", "限建 1 台"]];
    const full = water && owned && p.ready > 0 && state.water >= R.waterCap;
    const explanation = key === "workshop" ? "作物 + 普通鱼饵，研制定向鱼饵。" : key === "beehive" ? "花束补充花粉，让下一轮多收一份。" : full ? "水桶已满，先浇水腾出空间。当日余量会留在净化器中。" : "每日多一份清水，点击收进水桶。";
    const recipes = key === "workshop" ? `<section class="facility-recipe-panel"><h4>可研制的定向鱼饵</h4>${["fruit", "herb"].map((k) => `<div class="detail-recipe"><span>${FarmArt.icon(M.BAIT_RECIPES[k].crop)}<small>${M.CROPS[M.BAIT_RECIPES[k].crop].name}</small></span><b>＋</b><span>${FarmArt.ui("bait")}<small>普通鱼饵</small></span><b>→</b><span>${baitArt(k)}<small>${M.BAIT_RECIPES[k].name}</small></span></div>`).join("")}</section>` : key === "beehive" ? `<section class="facility-recipe-panel"><h4>花束变花粉</h4><div class="detail-recipe">${FarmArt.icon("lavender")}<b>→</b>${FarmArt.ui("pollen")}<span>花粉仓 ${owned ? M.beehiveStatus(state).pollen : 0}/6</span></div>${pollenTray(owned ? M.beehiveStatus(state).pollen : 0)}</section>` : `<section class="facility-recipe-panel"><h4>升级后，每日更多清水</h4><div class="purifier-tier-row">${R.purifierLevels.map((tier, i) => `<div class="${p.level === i + 1 ? "current" : ""}">${purifierArt(i + 1)}<b>Lv.${i + 1}</b><span>${FarmArt.ui("water")}${tier.water} 滴 / 日</span></div>`).join("")}</div></section>`;
    let primary = owned ? water && (!p.ready || full) ? "" : `<button class="button primary" data-action="${water ? "purifier-focus" : "facility-open"}" data-origin="${origin}" data-facility="${key}">${water ? "去收水" : "使用设施"}</button>` : origin === "scene" ? '<button class="button primary" data-action="facility-shop">前往商店</button>' : `<button class="button primary" data-action="${water ? "buy-purifier" : "facility-build"}" data-facility="${key}" ${M.level(state) < def.gardenLevel || state.wallet < def.cost ? "disabled" : ""}>建造 · ${def.cost} 积分</button>`;
    if (water && owned && R.purifierLevels[p.level]) primary += '<button class="button" data-action="purifier-upgrade">查看升级</button>';
    const stateLabel = owned ? water ? `Lv.${p.level} · ${p.remaining ? `还需 ${craftClock(p.remaining)}` : p.ready ? `${p.ready} 滴待领${full ? " · 水桶已满" : ""}` : "今日已领完"}` : "已建成" : `待建造 · Lv.${def.gardenLevel} 解锁`;
    showDialog("设施详情", "", `<h3 class="facility-detail-name">${def.name}</h3><div class="facility-detail-overview"><div class="facility-detail-hero"><div class="facility-detail-art">${water ? purifierArt(p.level) : art(key, !owned)}</div><span class="facility-detail-state">${FarmArt.ui(owned ? "house" : "lock")}${stateLabel}</span></div><div><p class="facility-detail-description">${explanation}</p><dl class="facility-detail-facts">${rows.map(([icon, label, value]) => `<div><dt>${FarmArt.ui(icon)}${label}</dt><dd>${value}</dd></div>`).join("")}</dl>${recipes}</div></div>${key === "workshop" ? `<div class="manual-entry">${FarmArt.ui("bait")}<span><b>基础鱼饵也在这里手作</b><small>玉米 / 彩虹玉米 1:1 换鱼饵 · 免费即时，无需建造</small></span><button class="tile-btn primary" data-action="manual-open" data-origin="${origin}">手工制作</button></div>` : ""}`,
    `${origin === "workshop" ? '<button class="button" data-action="workshop-resume">返回工坊</button>' : origin === "scene" ? '<button class="button" data-action="close">返回庄园</button>' : '<button class="button" data-action="facility-shop">返回商店</button>'}${origin === "workshop" && owned ? "" : primary}`, false, "facility-detail-dialog");
    $("#dialog").dataset.facility = key;
  }
  function focusSite(key) {
    closeDialog(false);
    if (typeof setManorArea === "function") setManorArea(key === "beehive" ? "garden" : "bay");
    document.getElementById(`${key}Spot`)?.focus({ preventScroll: true });
  }
  function cards() {
    const lv = M.level(state);
    const detail = (key) => `<button class="tile-btn facility-details" data-action="facility-detail" data-facility="${key}" data-origin="shop">设施详情</button>`;
    const card = (key) => {
      const def = config(key),owned = !!state[key],status = key === "workshop" ? M.workshopStatus(state) : M.beehiveStatus(state);
      const metric = key === "workshop" ? `<b>${FarmArt.ui("clock")}2 小时 / 批</b><span>每批 1–3 份</span>` : `<b>${FarmArt.ui("pollen")}每天授粉 1 次</b><span>花粉最多 6 份</span>`;
      const stateText = !owned ? lv < def.gardenLevel ? `Lv.${def.gardenLevel} 解锁` : "待建造" : key === "workshop" ? status.phase === "ready" ? "成品待领取" : status.phase === "crafting" ? `还需 ${craftClock(status.remaining)}` : "已建成" : `花粉 ${status.pollen}/6`;
      return `<article class="game-facility-card" data-facility-card="${key}"><header><h3>${def.name}</h3><span>${owned ? "已建成" : "限建 1 台"}</span></header><div class="facility-card-art">${art(key, !owned)}</div><div class="facility-card-metric">${metric}</div><p>${key === "workshop" ? "作物＋普通鱼饵，制作定向鱼饵" : "花束补粉 · 下一轮多收 1 份"}</p><span class="facility-card-status">${FarmArt.ui(owned ? "house" : "lock")}${stateText}${key === "beehive" && owned ? `<span class="card-pollen-track"><i style="width:${status.pollen / 6 * 100}%"></i></span>` : ""}</span><div class="market-price">${owned ? '<small>永久拥有</small>' : `${FarmArt.ui("coin")}<strong>${def.cost}</strong><span>积分</span>`}</div><div class="facility-card-actions">${owned ? `<button class="tile-btn primary" data-action="facility-open" data-origin="shop" data-facility="${key}">${key === "workshop" ? "使用工坊" : "使用蜂箱"}</button>` : ""}${detail(key)}</div></article>`;
    };
    const p = M.purifierStatus(state),next = R.purifierLevels[p.level];
    return keys.map(card).join("") + `<article class="game-facility-card" data-facility-card="purifier"><header><h3>海水净化器</h3><span>${p.owned ? `Lv.${p.level}` : "限建 1 台"}</span></header><div class="facility-card-art">${purifierArt(p.level)}</div><div class="facility-card-metric"><b>${FarmArt.ui("water")}每日 ${p.daily || R.purifierWater} 滴</b><span>清水收进水桶</span></div><p>清水封闭储存，点击收进水桶</p><span class="facility-card-status">${p.owned ? p.remaining ? `还需 ${craftClock(p.remaining)}` : next ? `可升级为每日 ${next.water} 滴` : "已升满级" : lv < 8 ? "Lv.8 解锁" : "待建造"}</span><div class="market-price">${p.owned ? '<small>永久拥有</small>' : `${FarmArt.ui("coin")}<strong>${R.purifierCost}</strong><span>积分</span>`}</div><div class="facility-card-actions">${p.owned ? '<button class="tile-btn primary" data-action="purifier-focus">去收水</button>' : ""}${detail("purifier")}</div></article>`;
  }
  function buildDialog(key) {
    const def = config(key);if (!def || state[key]) return;
    const locked = M.level(state) < def.gardenLevel,short = Math.max(0, def.cost - state.wallet);
    pendingBuild = { key, session: state };
    showDialog(`建造${def.name}`, "每种限建一台，建成后永久拥有。",
    `<div class="facility-build-preview">${art(key)}<p>${key === "workshop" ? "用小番茄或生菜和普通鱼饵，制作更易遇见指定类别的鱼饵。" : "放入薰衣草或向日葵补充花粉，选择生长中的作物授粉。"}</p></div><div class="facility-build-conditions"><span class="${locked ? "unmet" : "met"}">${locked ? "◇" : "✓"} 庄园 Lv.${def.gardenLevel} · 当前 Lv.${M.level(state)}</span><span class="${short ? "unmet" : "met"}">${short ? "◇" : "✓"} ${def.cost} 积分 · 当前 ${state.wallet}${short ? `，还差 ${short}` : ""}</span></div>`,
    `<button class="button" data-action="facility-shop">返回商店</button><button class="button primary" data-action="facility-build-confirm" ${locked || short ? "disabled" : ""}>${art(key)}建造 · ${def.cost} 积分</button>`, false, "facility-build-dialog");
  }
  const workshopTabs = () => `<div class="workshop-navigation"><div class="workshop-tabs" aria-label="工坊制作分类">${[["manual", "基础手作", "bait"], ["targeted", "定向研制", "build"]].map(([key, label, icon]) => `<button data-action="workshop-pane" data-pane="${key}" aria-pressed="${workshopPane === key}" class="${workshopPane === key ? "selected" : ""}">${FarmArt.ui(icon)}${label}</button>`).join("")}</div><button class="workshop-detail-link" data-action="workshop-detail">${FarmArt.ui("house")}设施详情</button></div>`;
  const workshopReturn = () => `<button class="button" data-action="workshop-back">${workshopOrigin === "bag" ? "返回背包" : workshopOrigin === "shop" ? "返回商店" : "回到庄园"}</button>`;
  const basicBaitArt = (crop) => `<span class="manual-output-art"><img src="knowledge-garden-v19/incoming/farm-r2/sprites/icon-bait${crop === "rainbowcorn" ? "-rainbow" : ""}.webp" alt="" draggable="false"></span>`;
  const workshopHero = (choices) => `<div class="workshop-hero"><div class="workshop-illustration">${art("workshop")}</div><div class="recipe-choices">${choices}</div></div>`;
  function returnFromWorkshop() {
    if (workshopOrigin === "bag") FarmUI.bagDialog("crops");else if (workshopOrigin === "shop") FarmUI.shopDialog("facilities");else closeDialog();
  }
  function manualDialog() {
    const c = M.CROPS[basicRecipe],stock = state.crops[basicRecipe] || 0,max = Math.max(1, Math.min(99, stock));
    basicCount = Math.max(1, Math.min(basicCount, max));
    const rainbow = c.bait === "rainbowBait";
    const choices = ["corn", "rainbowcorn"].map((key) => `<button class="recipe-choice ${key === basicRecipe ? "selected" : ""}" data-action="manual-recipe" data-crop="${key}" aria-pressed="${key === basicRecipe}">${basicBaitArt(key)}<strong>${key === "rainbowcorn" ? "彩虹" : "普通"}鱼饵</strong><span>${key === basicRecipe ? "✓ " : ""}${M.CROPS[key].name}库存 ${state.crops[key] || 0} 份</span></button>`).join("");
    showDialog("诱饵工坊", "免费即时完成，无需建造设备。", `${workshopTabs()}${workshopHero(choices)}<section class="craft-formula manual-formula"><div class="craft-ingredient ${stock < basicCount ? "missing" : ""}"><span>${FarmArt.icon(basicRecipe)}</span><strong>${c.name} ×${basicCount}</strong><small>${stock < basicCount ? "◇ 不足 · " : ""}拥有 ${stock}</small></div><b class="recipe-operator">→</b><div class="craft-output">${basicBaitArt(basicRecipe)}<strong>${rainbow ? "彩虹" : "普通"}鱼饵 ×${basicCount}</strong><small>现有 ${state[c.bait] || 0} 份</small></div></section><div class="craft-quantity"><span>制作数量</span><div class="quantity-picker"><button data-action="manual-quantity" data-count="${basicCount - 1}" aria-label="减少手作数量" ${basicCount <= 1 ? "disabled" : ""}>−</button><b>${basicCount}</b><button data-action="manual-quantity" data-count="${basicCount + 1}" aria-label="增加手作数量" ${basicCount >= max ? "disabled" : ""}>＋</button></div><span class="craft-time">1 份作物 → 1 份鱼饵</span></div><p class="facility-hint">${stock ? rainbow ? "彩虹鱼饵让下一竿必定上钩。" : "做好后会收进鱼饵箱，去海边就能用。" : `还没有${c.name}收获物，先种植并收获再来。`}</p>`, `${workshopReturn()}<button class="button primary" data-action="manual-craft" ${stock >= basicCount ? "" : "disabled"}>${stock >= basicCount ? "立即制作" : "收获物不足"}</button>`, false, "workshop-dialog");
    $("#dialog").dataset.workshopPane = "manual";
  }
  function workshopDialog() {
    if (workshopPane === "manual") return manualDialog();
    const w = M.workshopStatus(state);
    if (!w.owned) {
      showDialog("诱饵工坊", "建造工坊后，研制两种定向鱼饵。", `${workshopTabs()}<div class="workshop-locked"><div class="workshop-illustration">${art("workshop", true)}</div><strong>${FarmArt.ui("lock")}定向研制尚未开放</strong><p>庄园 Lv.${config("workshop").gardenLevel} · ${config("workshop").cost} 积分建造</p><small>基础手作一直免费开放。</small></div>`, `${workshopReturn()}<button class="button primary" data-action="facility-shop">前往商店</button>`, false, "workshop-dialog");
      $("#dialog").dataset.workshopPane = "locked";return;
    }
    const choices = Object.entries(M.BAIT_RECIPES).map(([key, r]) => `<button class="recipe-choice ${recipe === key ? "selected" : ""}" data-action="craft-recipe" data-recipe="${key}" aria-pressed="${recipe === key}" ${w.phase !== "idle" ? "disabled" : ""}>${baitArt(key)}<strong>${r.name}</strong><span>${recipe === key ? "✓ " : ""}偏向${key === "fruit" ? "鱼类" : "底栖水族"}</span></button>`).join("");
    let body = `${workshopTabs()}${workshopHero(choices)}`,foot;
    if (w.phase === "idle") {
      const r = M.BAIT_RECIPES[recipe],quote = M.craftQuote(state, recipe, batch);
      const ingredient = (visual, name, stock) => `<div class="craft-ingredient ${stock < batch ? "missing" : ""}"><span>${visual}</span><strong>${name} ×${batch}</strong><small>${stock < batch ? "◇ 不足 · " : ""}拥有 ${stock}</small></div>`;
      body += `<section class="craft-formula">${ingredient(`<img src="knowledge-garden-v19/incoming/farm-r2/sprites/icon-bait.webp" alt="">`, "普通鱼饵", state.bait)}<span class="recipe-operator">+</span>${ingredient(FarmArt.icon(r.crop), M.CROPS[r.crop].name, state.crops[r.crop] || 0)}<span class="recipe-operator">→</span><div class="craft-output">${baitArt(recipe)}<strong>${r.name} ×${batch}</strong></div></section><div class="craft-quantity"><span>制作数量</span><div class="quantity-picker"><button data-action="craft-quantity" data-count="${batch - 1}" aria-label="减少制作数量" ${batch <= 1 ? "disabled" : ""}>−</button><b>${batch}</b><button data-action="craft-quantity" data-count="${batch + 1}" aria-label="增加制作数量" ${batch >= 3 ? "disabled" : ""}>＋</button></div><span class="craft-time">每批 2 小时</span></div>`;
      foot = `${workshopReturn()}<button class="button primary" data-action="craft-start" ${quote.ready ? "" : "disabled"}>${art("workshop")}${quote.ready ? "开始制作" : "材料不足"}</button>`;
    } else {
      const job = w.job,r = M.BAIT_RECIPES[job.recipe],progress = Math.min(1, (state.now - job.started) / (job.readyAt - job.started));
      body += `<section class="craft-job"><div class="craft-job-output">${baitArt(job.recipe)}<strong>${r.name} ×${job.count}</strong></div><h3>${w.phase === "ready" ? "✓ 制作完成" : "正在制作"}</h3><div class="craft-progress" role="progressbar" aria-label="鱼饵制作进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}"><i style="width:${progress * 100}%"></i></div><strong data-craft-clock>${w.phase === "ready" ? "成品会留在工坊，等你收好" : clockTime(w.remaining)}</strong><p>离开工坊，制作也会继续。</p></section>`;
      foot = `${workshopReturn()}${w.phase === "ready" ? `<button class="button primary" data-action="craft-collect" data-job="${job.id}">${baitArt(job.recipe)}收进鱼饵箱</button>` : ""}`;
    }
    showDialog("诱饵工坊", "用收获物调配鱼饵，让海钓多一点方向。", body, foot, false, "workshop-dialog");
    $("#dialog").dataset.craftPhase = w.phase;$("#dialog").dataset.workshopPane = "targeted";
  }
  function pollenTray(n) {
    return `<div class="pollen-meter"><strong>花粉 ${n}/6</strong><div class="pollen-tray" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<i class="${i < n ? "filled" : ""}"></i>`).join("")}</div></div>`;
  }
  function beeSignature() {const b = M.beehiveStatus(state);return [b.pollen, b.usedToday, M.pollinationTargets(state).join(",")].join("|");}
  function beehiveDialog() {
    const b = M.beehiveStatus(state);if (!b.owned) return open("beehive");
    const targets = M.pollinationTargets(state);if (!targets.includes(target)) target = targets[0] ?? null;
    const ready = !b.usedToday && b.pollen > 0 && target !== null;
    const choices = targets.map((i) => {const p = state.plots[i];return `<button class="pollination-target ${target === i ? "selected" : ""}" data-action="hive-target" data-plot="${i}" aria-pressed="${target === i}"><span class="pollination-crop">${FarmArt.cropPreview(p.crop, M.growthStage(state, i))}</span><strong>${M.CROPS[p.crop].name} · 第${i + 1}块地</strong><small>${target === i ? "✓ 已选择 · " : ""}生长中</small></button>`;}).join("");
    showDialog("花园蜂箱", "花束变花粉，为下一次收获添一份。",
    `<div class="beehive-hero"><div class="hive-illustration">${art("beehive")}</div><div>${pollenTray(b.pollen)}<p class="hive-daily">${b.usedToday ? "✓ 今日已授粉" : "今日可授粉 1 次"}</p><button class="tile-btn" data-action="hive-refill">${FarmArt.icon("lavender")}补充花粉</button></div></div><div class="facility-section-title">选择作物</div>${choices ? `<div class="pollination-targets">${choices}</div>` : '<div class="facility-empty"><strong>暂时没有可授粉的作物</strong><p>小番茄、草莓、茄子、彩椒和蓝莓，在浇水生长后都可选择。</p><button class="tile-btn" data-action="facility-garden">回菜园看看</button></div>'}<div class="pollination-benefit"><span class="pollen-token" aria-hidden="true"></span><b>下一轮多收 1 份</b><span>每株仅一次</span></div><p class="facility-hint">${b.usedToday ? "今天的授粉已完成，明天再来。" : !b.pollen ? "先放入花束补充花粉，再选择作物。" : "每次消耗 1 份花粉，不额外增加经验。"}</p>`,
    `<button class="button" data-action="facility-focus" data-facility="beehive">回到菜园</button><button class="button primary" data-action="hive-pollinate" data-plot="${target ?? ""}" data-planted="${target !== null ? state.plots[target].planted : ""}" data-crop="${target !== null ? state.plots[target].crop : ""}" ${ready ? "" : "disabled"}>${beeArt()}${b.usedToday ? "今日已授粉" : target !== null ? `给${M.CROPS[state.plots[target].crop].name}授粉` : "暂无可选作物"}</button>`, false, "beehive-dialog");
    $("#dialog").dataset.hiveSignature = beeSignature();
  }
  function refillDialog() {
    const b = M.beehiveStatus(state);if (!b.owned) return open("beehive");
    const inputs = Object.entries(M.FACILITY_RULES.flowerPollen),canUse = (k) => (state.crops[k] || 0) > 0 && b.pollen + M.FACILITY_RULES.flowerPollen[k] <= b.capacity;
    if (!canUse(flower)) flower = inputs.find(([k]) => canUse(k))?.[0] || "lavender";
    const rows = inputs.map(([k, n]) => {
      const stock = state.crops[k] || 0,full = b.pollen + n > b.capacity;
      return `<button class="pollen-refill ${flower === k ? "selected" : ""}" data-action="hive-flower" data-crop="${k}" aria-pressed="${flower === k}" ${!stock || full ? "disabled" : ""}><span class="refill-flower-art">${FarmArt.icon(k)}</span><span><strong>${M.CROPS[k].name} ×1</strong><span class="refill-formula">→ <b>花粉 ${n} 份</b></span><small>${!stock ? "◇ 花束不足" : full ? `◇ 需要 ${n} 格空位` : `库存 ${stock}${flower === k ? " · ✓ 已选择" : ""}`}</small></span></button>`;
    }).join("");
    showDialog("花园蜂箱", "补充花粉", `${pollenTray(b.pollen)}<div class="pollen-refill-options">${rows}</div><p class="facility-hint">最多储存 6 份 · 空间不足时不会消耗花束。</p>`,
    `<button class="button" data-action="hive-back">返回蜂箱</button><button class="button primary" data-action="hive-refill-confirm" ${canUse(flower) ? "" : "disabled"}>${FarmArt.icon(flower)}放入花束</button>`, false, "hive-refill-dialog");
    $("#dialog").dataset.hiveSignature = `${b.pollen}|${inputs.map(([k]) => state.crops[k] || 0)}`;
  }
  function upgradeDialog(reset = false) {
    const initial = M.purifierUpgradePlan(state, FISH);if (!initial) return;
    if (reset || upgradeSession !== state || upgradeLevel !== initial.level) {selectedMaterials = [];upgradeSession = state;upgradeLevel = initial.level;}
    const plan = M.purifierUpgradePlan(state, FISH, selectedMaterials),tier = R.purifierLevels[plan.level - 1];pendingUpgrade = { session: state, plan };
    const counts = {};state.fish.forEach((f) => counts[f.kind] = (counts[f.kind] || 0) + 1);
    const eligible = state.fish.filter((f) => plan.eligible.includes(f.id)).sort((a, b) => counts[b.kind] - counts[a.kind] || a.id - b.id),ordinal = {};
    const options = eligible.map((f) => {ordinal[f.kind] = (ordinal[f.kind] || 0) + 1;const checked = selectedMaterials.includes(f.id);
      return `<button class="upgrade-creature ${checked ? "selected" : ""}" role="checkbox" aria-checked="${checked}" data-action="upgrade-material" data-fish="${f.id}" ${!checked && selectedMaterials.length >= plan.required ? "disabled" : ""}><span>${fishArt(f.kind)}</span><strong>${FISH[f.kind].name}</strong><small>${checked ? "✓ 已选" : "第 " + ordinal[f.kind] + " 只"}${counts[f.kind] > 1 ? " · 重复伙伴" : ""}</small></button>`;
    }).join("");
    showDialog(`净化器升级 Lv.${plan.level}`, `选择待养区中的${plan.quality}海水底栖水族，可混种。`,
    `<div class="upgrade-preview">${purifierArt(plan.level)}<strong>每日 ${tier.water} 滴清水</strong></div><div class="upgrade-selection-count">已选 <b>${selectedMaterials.length} / ${plan.required}</b><span>可用 ${plan.available} 只</span></div>${options ? `<div class="upgrade-creatures">${options}</div>` : '<div class="facility-empty">还没有符合条件的待养水族，可以先去海钓收集。</div>'}<div class="facility-build-conditions"><span class="${M.level(state) < tier.gardenLevel ? "unmet" : "met"}">庄园 Lv.${tier.gardenLevel} · 当前 Lv.${M.level(state)}</span><span class="${state.wallet < tier.cost ? "unmet" : "met"}">${tier.cost} 积分 · 当前 ${state.wallet}</span></div><p class="facility-hint">确认后实际消耗所选个体，图鉴保留；已入住的伙伴不参与。</p>`,
    `<button class="button" data-action="facility-shop">返回商店</button><button class="button primary" data-action="upgrade-confirm" ${plan.ready ? "" : "disabled"}>确认消耗并升级 · ${tier.cost} 积分</button>`, false, "purifier-upgrade-dialog");
  }
  function refreshClocks() {
    const status = M.workshopStatus(state),site = document.getElementById("workshopSpot");
    if (site && status.phase === "crafting") {
      const label = craftClock(status.remaining);site.querySelector(".fixture-state").textContent = label;
      site.setAttribute("aria-label", `诱饵工坊，还需 ${label}，点击使用`);
    }
    const dialog = document.getElementById("dialog");if (!dialog || document.getElementById("modal").hidden) return;
    if (dialog.dataset.family === "workshop-dialog" && dialog.dataset.workshopPane === "targeted") {
      const w = M.workshopStatus(state);
      if (dialog.dataset.craftPhase !== w.phase) return workshopDialog();
      if (w.phase === "crafting") {
        const el = dialog.querySelector("[data-craft-clock]");if (el) el.textContent = clockTime(w.remaining);
        const progress = Math.min(1, (state.now - w.job.started) / (w.job.readyAt - w.job.started)),bar = dialog.querySelector(".craft-progress");
        if (bar) {bar.querySelector("i").style.width = progress * 100 + "%";bar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));}
      }
    }
    if (dialog.dataset.family === "beehive-dialog" && dialog.dataset.hiveSignature !== beeSignature()) beehiveDialog();
    if (dialog.dataset.family === "hive-refill-dialog") {
      const b = M.beehiveStatus(state),sig = `${b.pollen}|${Object.keys(M.FACILITY_RULES.flowerPollen).map((k) => state.crops[k] || 0)}`;
      if (sig !== dialog.dataset.hiveSignature) refillDialog();
    }
  }
  function back() {
    const family = $("#dialog").dataset.family;
    if (family === "workshop-dialog" && workshopOrigin !== "scene") {returnFromWorkshop();return true;}
    if (family === "hive-refill-dialog") {beehiveDialog();return true;}
    if (family === "facility-detail-dialog") {if (detailOrigin === "workshop") workshopDialog();else if (detailOrigin === "shop") FarmUI.shopDialog("facilities");else closeDialog();return true;}
    if (family === "facility-build-dialog" || family === "purifier-upgrade-dialog") {FarmUI.shopDialog("facilities");return true;}
    return false;
  }
  async function handle(action, button) {
    switch (action) {
      case "facility-open":open(button.dataset.facility, button.dataset.origin || "scene");break;
      case "manual-open":if (button.dataset.origin !== "workshop") workshopOrigin = button.dataset.origin || "scene";workshopPane = "manual";basicRecipe = ["corn", "rainbowcorn"].includes(button.dataset.crop) ? button.dataset.crop : "corn";basicCount = 1;workshopDialog();break;
      case "workshop-detail":detailDialog("workshop", "workshop");break;
      case "workshop-resume":workshopDialog();break;
      case "workshop-pane":workshopPane = button.dataset.pane === "targeted" ? "targeted" : "manual";workshopDialog();break;
      case "workshop-back":returnFromWorkshop();break;
      case "manual-recipe":if (["corn", "rainbowcorn"].includes(button.dataset.crop)) {basicRecipe = button.dataset.crop;basicCount = 1;}manualDialog();break;
      case "manual-quantity":basicCount = Math.max(1, Math.min(99, Number(button.dataset.count) || 1));manualDialog();break;
      case "manual-craft":{
          if ($("#dialog").dataset.family !== "workshop-dialog" || $("#dialog").dataset.workshopPane !== "manual") break;
          button.disabled = true;const n = basicCount,to = await M.convertBait(state, basicRecipe, n);update();manualDialog();
          toast(to ? `${to === "rainbowBait" ? "彩虹" : "普通"}鱼饵 +${n} · 已放入鱼饵箱` : "收获物已变化，请重新选择");break;
        }
      case "facility-detail":detailDialog(button.dataset.facility, button.dataset.origin || "shop");break;
      case "facility-focus":focusSite(button.dataset.facility);break;
      case "facility-garden":closeDialog(false);setManorArea("garden");break;
      case "facility-shop":FarmUI.shopDialog("facilities");break;
      case "facility-build":buildDialog(button.dataset.facility);break;
      case "facility-build-confirm":{
          const pending = pendingBuild;pendingBuild = null;
          if (!pending || pending.session !== state || $("#dialog").dataset.family !== "facility-build-dialog") break;
          button.disabled = true;const ok = await M.buyFacility(state, pending.key);update();
          if (!ok) {FarmUI.shopDialog("facilities");toast("未建造，积分或解锁状态已变化");break;}
          focusSite(pending.key);const el = document.getElementById(`${pending.key}Spot`);el?.classList.add("just-built");
          setTimeout(() => el?.classList.remove("just-built"), 800);toast(`${config(pending.key).name}已建成 · 点击使用`);break;
        }
      case "craft-recipe":if (M.BAIT_RECIPES[button.dataset.recipe]) recipe = button.dataset.recipe;workshopDialog();break;
      case "craft-quantity":batch = Math.max(1, Math.min(3, Number(button.dataset.count) || 1));workshopDialog();break;
      case "craft-start":{
          if ($("#dialog").dataset.family !== "workshop-dialog" || $("#dialog").dataset.workshopPane !== "targeted") break;
          button.disabled = true;const job = await M.startCraft(state, recipe, batch);update();workshopDialog();
          toast(job ? `开始制作 ${job.count} 份 · 2 小时后收好` : "材料或工坊状态已变化，请重新选择");break;
        }
      case "craft-collect":{
          const result = await M.collectCraft(state, Number(button.dataset.job));update();workshopDialog();
          if (result) toast(`${M.BAIT_RECIPES[result.recipe].name} +${result.count} · 已放入鱼饵箱`);break;
        }
      case "hive-target":target = Number(button.dataset.plot);beehiveDialog();break;
      case "hive-refill":refillDialog();break;
      case "hive-back":beehiveDialog();break;
      case "hive-flower":flower = button.dataset.crop;refillDialog();break;
      case "hive-refill-confirm":{
          const amount = await M.refillPollen(state, flower);update();refillDialog();if (amount) toast(`花粉 +${amount} · 已收进蜂箱`);break;
        }
      case "hive-pollinate":{
          const i = Number(button.dataset.plot),p = state.plots[i];
          if (!p || p.planted !== Number(button.dataset.planted) || p.crop !== button.dataset.crop) {beehiveDialog();break;}
          const ok = await M.pollinate(state, i);update();beehiveDialog();
          if (ok) {toast("授粉完成 · 下一次收获多 1 份");flyBees(i);}break;
        }
      case "purifier-upgrade":upgradeDialog(true);break;
      case "upgrade-material":{
          const id = Number(button.dataset.fish),at = selectedMaterials.indexOf(id);
          if (at >= 0) selectedMaterials.splice(at, 1);else selectedMaterials.push(id);
          upgradeDialog();break;
        }
      case "upgrade-confirm":{
          const pending = pendingUpgrade;pendingUpgrade = null;
          if (!pending || pending.session !== state || $("#dialog").dataset.family !== "purifier-upgrade-dialog") break;
          button.disabled = true;const ok = await M.upgradePurifier(state, pending.plan, FISH);update();FarmUI.shopDialog("facilities");
          toast(ok ? `净化器升至 Lv.${M.purifierStatus(state).level}` : "未升级，所选个体、积分或设备状态已变化");break;
        }
      default:return false;
    }
    return true;
  }
  function flyBees(i) {
    const from = document.getElementById("beehiveSpot"),to = document.querySelector(`.farm-plot[data-plot="${i}"]`);
    if (!from || !to || !visible("beehive") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // The short flight is behind the dialog; the quiet crop marker remains after returning to the garden.
    GardenFX.flyTo(from, to, beeArt(), { size: 24 });
  }
  const stateKey = () => [M.workshopStatus(state).phase, M.beehiveStatus(state).pollen, M.beehiveStatus(state).usedToday].join("|");
  const dismiss = () => {pendingBuild = null;pendingUpgrade = null;};
  return { art, sceneArt, nativeSceneArt, baitArt, beeArt, purifierArt, sceneHTML, sync, cards, open, handle, back, dismiss, refreshClocks, stateKey };
})();
