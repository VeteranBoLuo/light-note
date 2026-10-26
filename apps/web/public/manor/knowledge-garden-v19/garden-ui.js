/* Confirmed manor renderer. Account mutations go through manor-live.js and the authenticated host. */
// An already-open page may request this UI after a release, with the previous
// classic runtime still in memory. Keep that page's artwork adapter compatible.
if(!FarmArt.html)FarmArt.html=markup=>typeof GardenStartup!=="undefined"&&GardenStartup.html?GardenStartup.html(markup):markup;
const M = GardenModel,
  R = M.RULES;
const $ = (s) => document.querySelector(s);
const esc = (s) =>
String(s).replace(
  /[&<>"']/g,
  (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
  c]

);
let state = M.create("garden", FISH),
  scene = "garden",
  view = "tree",
  // 轻笺自身的深浅主题；庄园是沉浸式白天场景，进庄园时固定浅色，离开后恢复
  userTheme = "light",
  previousFocus = null,
  previousAction = null,
  toastTimer,
  exitArmedUntil = 0,
  atlasFilter = "all",
  catchResult = null,
  fishingPhase = "idle",
  fishingSpot = "sea",
  productionTab = "farm",
  productionOpener = null;
const atlasPositions = new Map();
const manorIcons = document.getElementById("manor-icon-assets") ? JSON.parse(document.getElementById("manor-icon-assets").textContent) : null;
// Preferred bait is restored from the authenticated account save.
// 场景标定与舞台在 farm-calibration.js、farm-stage.js
const farmFish = (slot) => M.farmFish(state, slot);
const fertilizerArt = (kind = "eco") => FarmArt.fertilizer(kind);
const duration = (h) => {
  const m = Math.max(0, Math.ceil(h * 60));
  return m === 0 ?
  "已成熟" :
  m < 60 ?
  `${m} 分钟` :
  `${Math.floor(m / 60)}h${m % 60 ? " " + m % 60 + "m" : ""}`;
};
const shortDuration = (h) => {
  const m = Math.max(1, Math.round(h * 60));
  return m < 60 ? `${m} 分钟` : m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m / 60} 小时`;
};
const clockTime = (hours) => {
  const s = Math.max(0, Math.ceil(hours * 3600));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].
  map((v) => String(v).padStart(2, "0")).
  join(":");
};
const timeLabel = () =>
`第 ${M.day(state)} 天 · ${String(Math.floor(state.now % 24)).padStart(2, "0")}:${String(Math.floor(state.now % 1 * 60)).padStart(2, "0")}`;
const ripeCount = () => FarmUI.plotsIn("ripe").length;
const isMobileView = () => document.documentElement.classList.contains("light-note-mobile-rendering");
function setManorArea(area, { keepAreaTravel = false } = {}) {
  if (!isMobileView()) return;
  if (FarmStage.cal().area === area) return;
  if (state.casting) {toast("收好这一竿，再去另一个区域");return;}
  FarmStage.setArea(area);
  // 切换只重建视图，不重建模型；计时、背包与资源由同一个 state 持有。
  render({ keepAreaTravel });
  announce(area === "bay" ? "已到海湾，海钓与养鱼舱在这里" : "已回到菜园，作物一直在生长");
}
function navigateManorArea(area) {
  if (!isMobileView() || FarmStage.cal().area === area) return;
  if (state.casting) return toast("收好这一竿，再去另一个区域");
  const session = state;
  return GardenArea.travel(FARM_CAL[area === "bay" ? "mobileBay" : "mobileGarden"], {
    valid: () => view === "tree" && isMobileView() && state === session && !state.casting,
    commit: () => setManorArea(area, { keepAreaTravel: true }),
    failed: () => toast("区域图片暂未准备好 · 请再点一次路牌"),
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    focus: `[data-action="area-${area === "bay" ? "garden" : "bay"}"]`
  });
}
const fertTotal = () =>
Object.values(state.fertilizers).reduce((a, b) => a + b, 0);
const farmReady = () =>
state.fishSlots.reduce((n, x) => n + M.production(state, x).ready, 0);
// 已入住（产肥位 + 观赏位）的生物
const activeFishIds = () => [...state.fishSlots, ...state.showSlots].map((x) => x?.fishId);
const isCreature = (kind) => !FISH[kind]?.fertilizer;
const coinSprite = FarmArt.ui("coin", "res-icon");
const remainingCasts = () => Math.max(0, R.dailyFree - state.freeUsed);
const qClass = (q) =>
q === "传说" ?
"legend" :
q === "珍稀" ?
"precious" :
q === "稀有" ?
"rare" :
"";
const fishSize = (k) =>
FISH[k].size >= 100 ? `${FISH[k].size / 100} m` : `${FISH[k].size} cm`;
const TANK_NAMES = { normal: "养鱼舱", large: "养鱼舱", ocean: "养鱼舱" };
const tankLabel = () => TANK_NAMES[M.tankSize(state, FISH)];
// 舱体尺寸由档位决定：CSS 用 --tank-k 放大高度、--tank-aspect 决定宽度，和舱内鱼的缩放同源
function tankStyle() {
  const { k, aspect } = tankShape(M.tankSize(state, FISH));
  return `--tank-k:${k};--tank-aspect:${aspect.toFixed(4)}`;
}
const tankHash = () => activeFishIds().join("-") + "|" + tankShape(M.tankSize(state, FISH)).aspect.toFixed(3);
function toast(text, { topCenter = false, duration } = {}) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  $("#toast").dataset.topCenter = String(topCenter);
  positionFeedback();
  toastTimer = setTimeout(() => $("#toast").hidden = true, duration || (text.length > 28 ? 3400 : 2200));
}
function requestManorExit(button) {
  if (Date.now() > exitArmedUntil) {
    exitArmedUntil = Date.now() + 3000;
    toast("再次点击退出庄园", { topCenter: true, duration: 3000 });
    return;
  }
  exitArmedUntil = 0;
  if (button) button.disabled = true;
  toast("正在返回轻笺…", { topCenter: true });
  GardenLive.exit().catch(() => { if (button?.isConnected) button.disabled = false; toast("暂时未能返回，请再试一次", { topCenter: true }); });
}
function positionFeedback() {
  const hud = $("#gameHud"),garden = $(".garden-scene"),mode = $("#farmToolMode");
  const top = Math.max(12, (hud?.getBoundingClientRect().bottom || $(".prototype-lab")?.getBoundingClientRect().bottom || 0) + 8);
  if (mode && garden) mode.style.top = `${top - garden.getBoundingClientRect().top}px`;
  const dialog = !$("#modal").hidden && $("#dialog");
  const feedback = $("#toast"),mobile = document.documentElement.classList.contains("light-note-mobile-rendering");
  const density = typeof getComputedStyle === "function" ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--d")) || 1 : 1;
  const skyTop = garden ? garden.getBoundingClientRect().top + 16 * density : top;
  if (feedback.dataset.topCenter === "true") {
    feedback.style.top = `${Math.max(12, (hud?.getBoundingClientRect().bottom || 0) + 8 * density)}px`;
    feedback.style.left = "50%";
    feedback.style.maxWidth = "";
    return;
  }
  feedback.style.top = `${dialog ? Math.max(dialog.getBoundingClientRect().top + 80, dialog.getBoundingClientRect().bottom - 120) : mobile ? top + (mode && !mode.hidden ? mode.getBoundingClientRect().height + 6 : 0) : skyTop}px`;
  const left = $('.hud-identity')?.getBoundingClientRect().right,right = $('.hud-right')?.getBoundingClientRect().left;
  const gap = !mobile && !dialog && left && right ? right - left - 24 * density : 0;
  feedback.style.maxWidth = gap > 140 * density ? `${Math.min(440 * density, gap)}px` : "";
  feedback.style.left = gap > 140 * density ? `${(left + right) / 2}px` : "";
}
function announce(text) {
  $("#announce").textContent = text;
}
function pageHead(
title = "知识庄园",
sub = "每一点知识积累，都在这里慢慢长大。")
{
  return `<div class="page-heading"><div class="page-title"><h1>${title}</h1><p>${sub}</p></div><button class="text-button" data-action="rules">照料说明 ↗</button></div>`;
}

function toolSprite(kind) {
  return `<span class="game-sprite sprite-${kind}" aria-hidden="true"></span>`;
}
function resPill(action, res, icon, value, label) {
  return `<button class="res-pill" data-action="${action}" data-res="${res}" aria-label="${label} ${value}"><span class="res-icon">${icon}</span><b data-res-value="${res}">${value}</b><small>${label}</small></button>`;
}
function tankIcon() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="12" width="36" height="26" rx="5" fill="#bfeaf2" stroke="#5aa6b8" stroke-width="2.5"/><path d="M7 20h34" stroke="#ffffff" stroke-width="2" opacity=".7"/><path d="M15 29c3-4 8-4 11 0-3 4-8 4-11 0Zm11 0 5-3v6Z" fill="#f08a3c"/><rect x="10" y="38" width="28" height="4" rx="2" fill="#c9b48c"/></svg>`;
}
function hudHTML() {
  const info = M.levelInfo(state.xp);
  const done = state.dailyDone.filter(Boolean).length;
  const rewardReady = M.pendingDailyWater(state).length;
  const pending = M.pendingLevelRewards(state).length;
  const pct = info.next ? (state.xp - info.at) / (info.next - info.at) * 100 : 100;
  return `<button class="hud-back" data-action="exit" title="返回轻笺" aria-label="返回轻笺"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="hud-identity"><button class="hud-stage" data-action="level" title="${pending ? pending + " 级奖励待领取" : "查看成长奖励"}" aria-label="庄园 Lv.${info.lv}，查看等级"><span class="hud-stage-name"><span class="hud-garden-badge" aria-hidden="true">${FarmArt.ui("crest")}</span><span id="phaseLabel"><span class="hud-manor-name">庄园 </span>Lv.${info.lv}</span>${pending ? `<span class="level-hud-pending" aria-label="${pending} 级奖励待领取">${pending}</span>` : ""}</span><span class="hud-growth"><span class="hud-growth-bar"><i id="hudGrowthBar" style="width:${pct}%"></i></span><span class="hud-growth-num">${info.next ? `<b id="hudGrowthNum">${state.xp - info.at}</b> / ${info.next - info.at}` : "已满级"}</span></span></button></div>${!isMobileView() ? `<nav class="game-dock" aria-label="庄园操作" id="gameTools">${dockHTML()}</nav>` : ""}<div class="hud-right"><div class="hud-resources" role="group" aria-label="资源"><button class="res-pill water" data-action="daily" aria-label="水滴 ${state.water} / ${R.waterCap}，通过每日任务和海水过滤器补水">${toolSprite("water")}<b id="waterCount">${state.water}</b><small>/ ${R.waterCap}</small></button><button class="res-pill" data-action="ledger" data-res="points" aria-label="积分 ${state.wallet}">${FarmArt.ui("coin", "res-icon")}<b id="wallet">${state.wallet}</b><small>积分</small></button></div><div class="hud-utils"><button class="util-btn ${rewardReady ? "has-reward" : ""}" data-action="daily" aria-label="每日任务 ${done}/3${rewardReady ? "，有奖励可领取" : ""}">${toolSprite("daily")}<span>任务</span><b>${done}/3</b></button><button class="util-btn plain" data-action="memories" aria-label="庄园日记，相伴 ${M.day(state)} 天"><span class="util-days"><b id="companionDays">${M.day(state)}</b> 天</span><span>相伴</span></button><button class="util-btn round" data-action="rules" aria-label="庄园玩法说明">?</button></div></div>${document.getElementById("manor-icon-assets") ? `<button class="hud-reset util-btn round${GardenLive.testing ? " is-testing" : ""}" data-action="reset-test" aria-label="重置测试庄园" title="${GardenLive.testing ? "测试存档：重置或返回正式庄园" : "从初始引导开始测试"}"><img src="${manorIcons.reset}" alt="" draggable="false">${GardenLive.testing ? "<small>测试中</small>" : ""}</button>` : ""}<button class="hud-more" data-action="manor-menu" aria-label="更多：任务、日记和帮助">${manorIcons?.more ? `<img src="${manorIcons.more}" alt="" draggable="false">` : "···"}${rewardReady ? '<i aria-hidden="true"></i>' : ""}</button>`;
}
// 底栏：图标 + 名称两层；养鱼舱入住数写在图标右下角的小牌子上（背包不写数字：种子和仓库两种数会被误读），
// 完整说明在按钮的读屏标签里
const dockArt = (kind) => `<img class="dock-art" src="knowledge-garden-v19/incoming/dock-r3/${kind}.webp" alt="" draggable="false">`;
function dockHTML() {
  const waiting = state.fish.filter((f) => !activeFishIds().includes(f.id)).length;
  const btn = (action, dock, icon, title, detail, chip = "", dot = false) =>
  `<button class="dock-btn" data-action="${action}" data-dock="${dock}" title="${title}" aria-label="${title}，${detail}${dot ? "，有待处理的内容" : ""}"${dock === "farm" ? ` aria-controls="tankProduction" aria-expanded="${!!$("#tankProduction") && !$("#tankProduction").hidden}" aria-haspopup="dialog"` : ""}><span class="dock-disc">${icon}${chip !== "" ? `<b class="dock-chip" aria-hidden="true">${chip}</b>` : ""}${dot ? '<i class="dock-dot" aria-hidden="true"></i>' : ""}</span><span class="dock-title">${title}</span></button>`;
  const seeds = Object.values(state.seeds).reduce((a, b) => a + b, 0),
    crops = Object.values(state.crops).reduce((a, b) => a + b, 0);
  const dex = Object.keys(state.discoveries).length + Object.keys(state.cropDex).length,
    dexAll = Object.keys(FISH).length + Object.keys(M.CROPS).length;
  const living = activeFishIds().filter(Boolean).length,ready = farmReady(),unread = M.atlasUnreadEntries(state, FISH).length;
  return (
    '<div class="farm-destinations">' + (
    isMobileView() && FarmStage.cal().area === "garden" ? btn("area-garden", "garden", FarmArt.packet("radish"), "菜园", "当前区域") : "") +
    btn("bag", "bag", dockArt("backpack"), "背包", `种子 ${seeds}${crops ? `，仓库 ${crops}` : ""}${waiting ? `，待养 ${waiting}` : ""}`, "", !!state.rewards.__new) +
    btn("stall", "shop", dockArt("shop"), "商店", "种子和水族用品") + (
    isMobileView() && FarmStage.cal().area === "garden" ? "" : btn("tank-manage", "farm", dockArt("aquarium"), "养鱼舱", `入住 ${living} / ${R.farmSlots + R.showSlots}${waiting ? `，待养 ${waiting}` : ""}${ready ? `，${ready} 份肥料可领` : ""}`, `${living}/${R.farmSlots + R.showSlots}`, waiting > 0 || ready > 0)) +
    btn("atlas", "atlas", dockArt("atlas"), "图鉴", `已收集 ${dex} / ${dexAll}${unread ? `，${unread} 个新物种未查看` : ""}`, "", unread > 0) + "</div>");

}

// 播种、浇水后开放自由游玩；首钓与观察用可跳过的轻提示，安置沿用捕获弹框。
const WELCOME_GIFT_ART = `<div class="welcome-gift-art" aria-hidden="true">${FarmArt.ui("crate", "gift-crate")}<span class="gift-water">${toolSprite("water")}</span><span class="gift-seeds">${FarmArt.packet("radish")}</span></div>`;
function guideHTML() {
  const g = state.adopted ? state.guide : state.guide || "welcome";
  if (g === "welcome")
  return `<div class="guide-veil"></div><section class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guideTitle"><h2 id="guideTitle">欢迎来到知识庄园</h2>${WELCOME_GIFT_ART}<p>在轻笺完成每日任务得到<strong>水滴</strong>，水滴用来浇灌你的菜地。<br>种子可以在商店买，最珍贵的种子只能靠坚持使用轻笺赢得。</p><div class="guide-gift">${toolSprite("water")}<span>见面礼 · 30 滴水 + 3 颗小萝卜种子</span></div><button class="guide-cta" data-action="guide-adopt">收下见面礼</button></section>`;
  const tip = (title, text) => `<div class="guide-tip" role="note"><strong>${title}</strong><span>${text}</span></div>`;
  if (g === "plant") return tip("第一步 · 播种", "点击亮起的土地，从背包选一颗小萝卜种子");
  if (g === "water") return tip("第二步 · 浇水", "再点一下这块地，用 5 滴水浇灌种子");
  if (!g && state.discoveryGuide && !state.casting) {
    const step = discoveryStep();
    if (step === "place") return "";
    const copy = {
      bay: ["点击路牌，前往海湾", "钓鱼和养鱼舱在海湾，作物会继续生长。"],
      fish: ["点击亮起的水面，抛出第一竿", "作物会继续生长，无需等待。"],
      observe: ["点击亮起的鱼舱，看看新伙伴", "展开管理面板，可以看到产肥倒计时。"]
    }[step];
    return `<canvas class="discovery-area" aria-hidden="true"></canvas><aside class="discovery-guide" role="note"><span class="guide-pointer" aria-hidden="true">↓</span><span class="guide-short">${{ bay: "点路牌去海湾", fish: "点水面钓鱼", observe: "点鱼舱看看" }[step]}</span><strong>${copy[0]}</strong><p>${copy[1]}</p><button class="guide-dismiss" data-action="guide-skip">稍后探索</button></aside>`;
  }
  return "";
}
function sceneHTML() {
  const cal = FarmStage.cal();
  return `<section class="garden-scene seaside-courtyard farm-staged" data-manor-area="${cal.area || "all"}" aria-label="知识庄园${cal.area === "garden" ? "菜园" : cal.area === "bay" ? "海湾" : ""}"><div class="scene-stage">${cal.skyBleed ? `<img class="scene-sky-bleed" src="knowledge-garden-v19/${cal.skyBleed.asset}" style="left:${cal.skyBleed.rect[0]}px;top:${cal.skyBleed.rect[1]}px;width:${cal.skyBleed.rect[2]}px;height:${cal.skyBleed.rect[3]}px" alt="" draggable="false">` : ""}<img class="garden-backdrop" ${cal.assetSources ? `srcset="${FarmStage.sourceSet(cal)}" sizes="100vw" ` : ""}fetchpriority="high" decoding="async" src="knowledge-garden-v19/${cal.asset}" data-water="knowledge-garden-v19/${cal.water}"${cal.preparedWater ? ` data-prepared-water="true" data-smooth="knowledge-garden-v19/${cal.smooth}"` : ""} alt="" draggable="false">${FarmArt.sceneDetails(cal)}${cal.tankAsset ? `<img class="main-tank-scenery" src="knowledge-garden-v19/${cal.tankAsset.asset}" style="left:${cal.tankAsset.rect[0]}px;top:${cal.tankAsset.rect[1]}px;width:${cal.tankAsset.rect[2]}px;height:${cal.tankAsset.rect[3]}px" alt="" draggable="false">` : ""}${FarmUI.layerHTML()}</div><div class="garden-vignette" aria-hidden="true"></div><header class="game-hud" id="gameHud">${hudHTML()}</header><div class="scene-tank ${M.tankSize(state, FISH)}" id="tankSpot" style="${tankStyle()}" data-residents="${tankHash()}">${aquariumArt()}<button class="aquarium-hit" data-action="tank-manage" aria-label="展开养鱼舱管理" aria-expanded="false" aria-controls="tankProduction" aria-haspopup="dialog"></button><div id="tankLabel" class="tank-caption"></div></div><div class="scene-pond" id="pondSpot">${pondArt()}<button class="pond-hit" data-action="cast" aria-label="在海边垂钓区抛竿"></button><span class="pond-hint"></span><div class="garden-catch" id="pondLabel" aria-live="polite"></div></div>${FarmUI.purifierHTML()}${FarmFacilities.sceneHTML()}<div class="production-scrim" data-action="production-close" aria-hidden="true" hidden></div><aside id="tankProduction" class="tank-production" role="dialog" aria-labelledby="productionTitle" hidden><header class="production-header"><h2 class="production-title" id="productionTitle" tabindex="-1">养鱼舱 <small id="productionCount"></small></h2><button class="production-close" data-action="production-close" title="关闭管理" aria-label="关闭养鱼舱管理">×</button></header><div id="productionBody"></div></aside>${isMobileView() ? `<nav class="game-dock" aria-label="庄园操作" id="gameTools">${dockHTML()}</nav>` : ""}<div id="gardenGuide">${guideHTML()}</div><div class="tool-cursor" id="toolCursor" aria-hidden="true"></div><div class="farm-tool-mode" id="farmToolMode" role="status" hidden></div></section>`;
}

function treePage() {
  return `<main class="garden-play"><div class="garden-frame">${sceneHTML()}</div></main>`;
}

function workbenchPage() {
  const ripe = ripeCount(),
    dry = FarmUI.plotsIn("dry").length;
  return `<main class="content">${pageHead("工作台", "把今天的一点收获，留给未来的自己。")}<div class="workbench-grid"><section class="workbench-card"><div class="workbench-art farm-card-art">${FarmArt.cropCard("carrot", 4)}</div><div class="workbench-copy"><div class="row between"><h2>我的知识庄园</h2><span class="chip">庄园 Lv.${M.level(state)}</span></div><p>${ripe ? `${ripe} 块地可以收获了。` : dry ? `${dry} 块地等着浇水。` : "作物正在慢慢长大。"}水滴 ${state.water} 滴，今日免费垂钓还剩 ${remainingCasts()} 次。</p><button class="button primary" data-action="open-tree">回到庄园 ↗</button></div></section><section class="workbench-card workbench-notes"><h2>最近的笔记</h2>${["那些让我重新理解学习的句子", "如何把零散的灵感串起来", "给未来的自己留一份阅读清单"].map((x, i) => `<article><h3>${x}</h3><p>${i ? "昨天" : "今天"} · 学习与思考</p></article>`).join("")}<p class="muted small" style="margin-top:var(--space)">工作台示例内容</p></section></div></main>`;
}
let helpTab = "plant";
function rulesContent() {
  const tabs = [["plant", "种植"], ["fish", "钓鱼"], ["tank", "养鱼"], ["facilities", "设施"], ["points", "积分"], ["collection", "收藏"]];
  const card = (n, title, body) => `<section class="help-step"><span>${n}</span><div><h3>${title}</h3><p>${body}</p></div></section>`;
  const cropCards = Object.values(M.CROPS).map((c) => `<article class="help-crop"><strong>${c.name}</strong><span>${c.first} 小时${c.sell === null ? "盛开" : "首收"}${c.harvests > 1 ? ` · 每 ${c.every} 小时再收，共 ${c.harvests} 轮` : ""}</span><small>${c.price === null ? "奖励种子" : `种子 ${c.price} 积分 · Lv.${c.unlock}`} · ${c.sell === null ? "长久观赏" : `每份卖 ${c.sell} 积分`}</small></article>`).join("");
  const pages = {
    plant: card("1", "选种子", "点空地选种子；也可以从背包选好，再连续点空地。") + card("2", "浇一次水，安心等成长", `每块地用 ${R.plantWater} 滴水开始生长。此后可以钓鱼、养鱼或离开，作物不会枯萎。`) + card("3", "成熟后点一下收获", "收获放进背包，可留作工坊和蜂箱材料，也可前往商店出售。复收作物会继续生长；花朵采过后仍可观赏。") + `<p class="help-note">开局 4 块田 · Lv.${Object.keys(R.plotsAt).slice(1).join(" / ")} 各开垦 1 块。</p><details class="help-details"><summary>查看作物时长与价格</summary><div class="help-crops">${cropCards}</div></details>`,
    fish: card("1", "到钓鱼区抛竿", `每天 ${R.dailyFree} 次免费，之后每竿用 1 份鱼饵。普通鱼饵 ${R.baitCost} 积分，也能用玉米换。`) + card("2", "咬钩后收竿", "点钓点收竿，也可以等自动收竿；反应快慢不改变结果。首次固定获得一尾会产肥的珊瑚小丑鱼。") + card("3", "决定新伙伴的去向", "首钓伙伴先放进养鱼舱；之后可以入住、收进背包或卖出。淡水与海水伙伴都能通过垂钓遇见，鱼苗袋还可必得一位淡水伙伴。") + `<details class="help-details"><summary>鱼饵与鱼苗袋</summary><p>普通鱼饵每竿消耗 1 份；彩虹鱼饵可保证上钩。</p><p>淡水鱼苗袋 ${R.fryPrice} 积分，每天最多 ${R.fryDaily} 袋，必得一位淡水生物。</p></details>`,
    tank: card("1", "安排入住", `6 个产肥位住鱼，3 个观赏位住其他水族。产肥鱼每 ${R.productionHours} 小时产 1 份，最多储存 ${R.storageLimit} 份，存满暂停。`) + card("2", "打开养鱼管理", "点菜单或场景中的养鱼舱展开管理面板，查看产肥进度并领取；再点一次即可收起。") + card("3", "把肥料撒在正在长的作物上", "常见 / 稀有 / 珍稀 / 传说鱼分别产 1 / 2 / 3 / 4 小时催熟肥。每轮最多缩短一半生长时间；换鱼会重置该位进度。") + `<p class="help-note">兔子每天留一份有机肥，可催熟 30 分钟；麻雀每天带一颗小萝卜种子。点小路上的礼物拾取，未领取的天数不累积。</p>`,
    points: card("1", "日常任务补水", `轻笺每日任务每完成 1 项可领取 ${R.dailyWater} 滴水，最多存 ${R.waterCap} 滴。三项都完成，再送 2 颗基础种子。商店可建造一台海水过滤器，随等级每天另收 ${R.purifierWater}–${R.purifierLevels[2].water} 滴水，未领的旧水不跨天累积。`) + card("2", "种子花积分，收获赚积分", "商店出售基础和进阶种子。稀有种子来自等级、连签、挑战、收藏等奖励；收获后的作物和多余水族可卖积分。") + card("3", "按自己的节奏经营", "没有每日、每周积分上限。收益受土地、水滴、生长与产肥时间约束；多照看可以多收一些。玉米也能留着换鱼饵。") + `<p class="help-note">当前 ${state.wallet} 积分 · 具体收支可点顶部积分查看。</p>`,
    facilities: card("1", "诱饵工坊 · Lv.6", "180 积分建造。每份普通鱼饵加一份小番茄或生菜，分别制作果香引鱼饵或草木觅贝饵，偏向鱼类或底栖水族。每批 1–3 份，用时 2 小时，完成后留在工坊等你收好。") + card("2", "花园蜂箱 · Lv.6", "160 积分建造。薰衣草一束补 2 份花粉，向日葵一束补 6 份，最多存 6 份。每天可选一株浇过水、正在生长的普通复收作物，消耗 1 份花粉，让下一次收获多 1 份；每株仅一次，不额外增加经验。") + card("3", "海水过滤器 · Lv.8", "240 积分建造，每天收 6 滴水。Lv.12 可花 180 积分并消耗 4 只常见海水底栖水族，升为每天 8 滴；Lv.18 再花 360 积分并消耗 2 只稀有海水底栖水族，升为每天 10 滴。材料从待养区手动选择，可混种，图鉴保留。") + '<p class="help-note">每种设施限建一台，未建时封存。制作鱼饵和补充花粉会消耗材料；每天先用免费垂钓次数，之后才消耗选定的鱼饵。</p>',
    collection: card("1", "认识作物和水族", "首次收获作物、发现水族会点亮图鉴，也会增加庄园经验。买种子、浇水和铲除不增加经验。") + card("2", "每升一级都有礼物", "每级一份成长补给，每 5 级一份丰盛礼包。点顶部等级看奖励用途，再去背包使用。") + card("3", "留意庄园的小伙伴", "轻触兔子会回应，点附近草地可以引它跳过去；码头的青蛙也能互动。图鉴的庄园成就还有种子与称号奖励。")
  };
  return `<nav class="help-tabs" aria-label="玩法分类">${tabs.map(([key, label]) => `<button data-action="help-tab" data-tab="${key}" aria-pressed="${helpTab === key}">${label}</button>`).join("")}</nav><div class="help-content">${pages[helpTab]}</div><p class="help-demo">原型体验 · 不扣减真实积分，重置后恢复示例数据。</p>`;
}
function discoveryStep() {
  const step = state.discoveryGuide === "observe" && state.fishSlots.some((slot) => farmFish(slot)) ? "observe" :
    state.fish.some((f) => !M.placed(state, f.id) && FISH[f.kind]?.fertilizer) ? "place" : "fish";
  return step !== "place" && FarmStage.cal().area === "garden" ? "bay" : step;
}
function positionDiscoveryGuide() {
  document.querySelectorAll(".guide-target").forEach((el) => el.classList.remove("guide-target"));
  const scene = $(".garden-scene"),tip = $(".discovery-guide"),area = $(".discovery-area");
  if (area) area.hidden = true;
  if (!scene || !tip || state.casting) return;
  const step = discoveryStep();
  if (step === "place" || !$("#modal").hidden || $(".catch-reveal")) {
    tip.hidden = true;
    return;
  }
  const viaSign = FarmStage.cal().area === "garden";
  const target = $(viaSign ? '[data-action="area-bay"]' : step === "fish" ? ".pond-hit" : ".aquarium-hit");
  if (!target) {tip.hidden = true;return;}
  tip.hidden = false;
  const r = target.getBoundingClientRect(),s = scene.getBoundingClientRect();
  let pointerContext;
  if (area) {
    const dpi = Math.min(devicePixelRatio || 1, 2);area.width = Math.round(s.width * dpi);area.height = Math.round(s.height * dpi);
    const ctx = area.getContext("2d");ctx.scale(dpi, dpi);pointerContext = ctx;
    if (viaSign) {
      ctx.strokeStyle = "#fff";ctx.lineWidth = 1.25;ctx.setLineDash([5, 4]);ctx.strokeRect(r.left - s.left, r.top - s.top, r.width, r.height);
      tip.querySelector(".guide-short").textContent = "点路牌去海湾";
    } else {
      // The hit area and guide share the same calibrated water contour.
      const d = FarmStage.cal(),region = step === "fish" ? d.pier.castRegion : d.aquarium.glassPolygon;
      const points = region.map((p) => FarmStage.toScene(...p));
      ctx.beginPath();points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));ctx.closePath();
      ctx.fillStyle = "rgba(225,253,255,.22)";ctx.fill();
      // The painting's outer edge is a crop, not an artificial shoreline.
      ctx.beginPath();
      points.forEach((p,i) => {
        const next = (i + 1) % points.length,a = region[i],b = region[next];
        if(step === "fish" && ((a[1] >= d.image[1] - .5 && b[1] >= d.image[1] - .5) || (a[0] <= .5 && b[0] <= .5)))return;
        ctx.moveTo(...p);ctx.lineTo(...points[next]);
      });
      ctx.strokeStyle = "rgba(255,255,255,.96)";ctx.lineWidth = 1.25;ctx.setLineDash([6, 5]);ctx.lineJoin = "round";ctx.stroke();
    }
    area.hidden = false;
  }
  const width = tip.offsetWidth,height = tip.offsetHeight;
  let anchorX = r.left - s.left + r.width / 2;
  let anchorY = viaSign ? r.top + r.height / 2 : r.top;
  if (!viaSign && step === "observe") {
    const polygon=FarmStage.cal().aquarium.swimPolygon;
    const point=polygon.reduce((sum,p)=>[sum[0]+p[0]/polygon.length,sum[1]+p[1]/polygon.length],[0,0]);
    const [x,y]=FarmStage.toScene(...point);anchorX=x;anchorY=s.top+y;
  }
  // 抛竿区采用不规则裁切，外接矩形的中心可能是天空；指向实际落水点。
  if (!viaSign && step === "fish" && typeof FarmStage !== "undefined") {
    const g = FarmStage.pier(),unit = g?.box ? (g.box[2] - g.box[0]) / 1000 : 0;
    const point = unit ? [g.box[0] + g.center[0] * unit, g.box[1] + g.center[1] * unit] : FarmStage.cal().pier.castWater.center;
    const [x, y] = FarmStage.toScene(...point);
    anchorX = x;anchorY = s.top + y;
  }
  const left = Math.max(8, Math.min(s.width - width - 8, anchorX - width / 2));
  const above = anchorY - s.top - height - 10;
  const top = above > 64 ? above : anchorY - s.top + 12;
  const actualTop = Math.max(62, Math.min(s.height - height - 100, top));
  const below = actualTop > anchorY - s.top;
  const tailX = Math.max(20, Math.min(width - 20, anchorX - left));
  tip.style.left = `${left}px`;
  tip.style.top = `${actualTop}px`;
  tip.style.setProperty("--tip-x", `${tailX}px`);
  tip.classList.toggle("below", below);
  // 气泡因边缘或底栏避让而离开目标时，用细连接箭头补齐间隔。
  if (pointerContext) {
    const ctx = pointerContext,start = [left + tailX, actualTop + (below ? -9 : height + 9)],end = [anchorX, anchorY - s.top];
    const dx = end[0] - start[0],dy = end[1] - start[1],length = Math.hypot(dx, dy);
    if (length > 12) {
      const ux = dx / length,uy = dy / length,neck = [end[0] - ux * 7, end[1] - uy * 7];
      ctx.setLineDash([]);ctx.lineCap = "round";ctx.lineJoin = "round";
      ctx.beginPath();ctx.moveTo(...start);ctx.lineTo(...neck);
      ctx.strokeStyle = "#947341";ctx.lineWidth = 4;ctx.stroke();ctx.strokeStyle = "#fff8e8";ctx.lineWidth = 2;ctx.stroke();
      ctx.beginPath();ctx.moveTo(...end);ctx.lineTo(neck[0] - uy * 4, neck[1] + ux * 4);ctx.lineTo(neck[0] + uy * 4, neck[1] - ux * 4);ctx.closePath();
      ctx.fillStyle = "#fff8e8";ctx.fill();ctx.strokeStyle = "#947341";ctx.lineWidth = 1;ctx.stroke();
    }
  }
}
// 庄园是沉浸式的游戏页：隐藏轻笺顶栏，只留左上角的返回按钮；顶栏的庄园入口在有可收获的地或可收肥料时亮一个小点
function syncGuide() {
  const scene = $(".garden-scene");
  if (!scene) return;
  const g = state.adopted ? state.guide : state.guide || "welcome";
  scene.classList.toggle("onboarding", !state.adopted || !!g);
  scene.dataset.guide = g || "";
  const box = $("#gardenGuide");
  const step = g || (!state.casting ? `${state.discoveryGuide || ""}:${state.fish.length}:${FarmStage.cal().area || "all"}` : "casting");
  if (box && box.dataset.step !== step) {
    box.innerHTML = FarmArt.html(guideHTML());
    box.dataset.step = step;
    box.querySelector(".guide-cta")?.focus({ preventScroll: true });
  }
  requestAnimationFrame(positionDiscoveryGuide);
}
function syncShell() {
  document.documentElement.classList.toggle("garden-immersive", view === "tree");
  document.documentElement.dataset.theme = view === "tree" ? "light" : userTheme;
  const themeBtn = $("#themeToggle");
  if (themeBtn) {
    themeBtn.disabled = view === "tree";
    themeBtn.title = view === "tree" ? "庄园固定为白天场景，深色只作用于轻笺页面" : "";
    themeBtn.textContent = userTheme === "dark" ? "浅色" : "深色";
  }
  const crumb = document.querySelector(".breadcrumb");
  if (crumb) crumb.textContent = view === "rules" ? "知识庄园 / 玩法说明" : "工作台";
  const dot = $("#gardenDot");
  if (dot) dot.hidden = !(ripeCount() > 0 || farmReady() > 0);
}
function render({ keepAreaTravel = false } = {}) {
  if (!keepAreaTravel) GardenArea.cancel();
  FarmUI.cancelTool();
  closeDialog(false);
  closeTankManagement(false);
  syncShell();
  applyDensity(false);
  $("#app").innerHTML = FarmArt.html(
  view === "tree" ?
  treePage() :
  view === "workbench" ?
  workbenchPage() :
  `<main class="content">${pageHead("庄园玩法", "种一片菜地，养一舱好鱼。")}${rulesContent()}</main>`);
  update();
  FishMotion.mount();
  if (view === "tree") {
    GardenFX.mountAmbient($(".garden-scene"));
    const sceneElement=$(".garden-scene");
    const wildlife=()=>{
      if(!sceneElement?.isConnected||sceneElement!==$(".garden-scene"))return;
      GardenAnimals3D.mount(sceneElement);
      GardenCritters.mount(sceneElement, { needsSeed: FarmUI.needsBirdSeed, giftPoint: FarmUI.birdGiftScenePoint, deliverSeed: FarmUI.deliverBirdSeed });
      GardenCompanions.mount(sceneElement);
    };
    // Core art, controls and guide load first. Wildlife never competes with
    // those downloads or starts for a scene that the player has already left.
    if(typeof GardenStartup!=="undefined"&&typeof GardenStartup.afterReady==="function")GardenStartup.afterReady(wildlife);else wildlife();
  } else {
    GardenFX.unmountAmbient();
    GardenCritters.unmount();
    GardenCompanions.unmount();
    GardenAnimals3D.unmount();
    GardenCourtyard.mount();
  }
}
function update({ keepWallet = false } = {}) {
  if (view !== "tree") return;
  const walletShown = $("#wallet")?.textContent;
  $("#gameHud").innerHTML = FarmArt.html(hudHTML());
  // 积分飞入期间保留旧数字，到达后再滚动
  if (keepWallet && walletShown !== undefined) $("#wallet").textContent = walletShown;
  $("#gameTools").innerHTML = FarmArt.html(dockHTML());
  FarmUI.sync();
  FarmFacilities.sync();
  syncGuide();
  const size = M.tankSize(state, FISH),
    hash = tankHash();
  const tank = $("#tankSpot");
  // 只有换档（大鱼入住或搬走）时播放舱体伸缩，窗口缩放和端型切换直接到位
  const grows = !tank.classList.contains(size);
  tank.className = "scene-tank " + size + (grows || tank.growing ? " tank-growing" : "");
  tank.setAttribute("style", tankStyle());
  if (grows) {
    clearTimeout(tank.growing);
    tank.growing = setTimeout(() => {
      tank.growing = 0;
      tank.classList.remove("tank-growing");
    }, 900);
  }
  if (tank.dataset.residents !== hash) {
    // 住客变了但舱体没变：只换舱里的住客，鱼缸不重画，已有的鱼接着游、新来的投放进去
    const old = tank.querySelector(".aquarium-art"),
      box = document.createElement("div");
    box.innerHTML = aquariumArt();
    const next = box.firstElementChild;
    if (old && old.getAttribute("viewBox") === next.getAttribute("viewBox") && old.dataset.k === next.dataset.k) {
      old.querySelectorAll(".tank-resident").forEach((el) => el.remove());
      const layer = old.querySelector("g[clip-path]");
      next.querySelectorAll(".tank-resident").forEach((el) => layer.insertBefore(el, layer.querySelector(".bubbles")));
    } else if (old) old.replaceWith(next);else
    tank.prepend(next);
    tank.querySelector(".aquarium-hit")?.setAttribute("aria-label", "展开养鱼舱管理");
    tank.dataset.residents = hash;
  }
  $("#tankLabel").innerHTML = "";
  renderProduction();
  GardenCourtyard.mount();
  updatePond();
  positionFeedback();
  $(".garden-scene").dataset.resources = [M.day(state), farmReady(), state.freeUsed, FarmUI.stateKey()].join("|");
  FishMotion.mount();
}
function syncTankManagement() {
  const open = !!$("#tankProduction") && !$("#tankProduction").hidden;
  document.querySelectorAll('[data-action="tank-manage"]').forEach((el) => {
    el.setAttribute("aria-expanded", String(open));
    if (el.classList.contains("aquarium-hit")) el.setAttribute("aria-label", open ? "收起养鱼舱管理" : "展开养鱼舱管理");
  });
  const scrim = $(".production-scrim");
  if (scrim) scrim.hidden = !open || !isMobileView();
}
function closeTankManagement(restore = true) {
  const panel = $("#tankProduction");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  syncTankManagement();
  if (restore) (productionOpener?.isConnected ? productionOpener : $('[data-dock="farm"]') || $(".aquarium-hit"))?.focus({ preventScroll: true });
  productionOpener = null;
}
async function toggleTankManagement(opener) {
  if (opener.closest(".garden-scene") && $("#tankProduction") && !$("#tankProduction").hidden) {
    productionOpener = opener;
    closeTankManagement();
  } else await openTankManagement(opener);
}
async function openTankManagement(opener = document.activeElement) {
  closeDialog(false);
  setManorArea("bay");
  if (view !== "tree") {view = "tree";$("#viewSelect").value = "tree";render();}
  const panel = $("#tankProduction");
  if (!panel) return;
  productionOpener = opener?.isConnected && opener.closest(".garden-scene") ? opener : $('[data-dock="farm"]') || $(".aquarium-hit");
  panel.hidden = false;
  renderProduction();
  FarmStage.positionManagement();
  $("#productionTitle").focus({ preventScroll: true });
  if (state.discoveryGuide === "observe") {await GardenLive.dismissGuide(state);update();}
}
function renderProduction() {
  syncTankManagement();
  const body = $("#productionBody");if (!body || $("#tankProduction").hidden) return;
  const focused = body.contains(document.activeElement) ? { ...document.activeElement.dataset } : null,scroll = body.querySelector(".production-list")?.scrollTop || 0;
  const farm = state.fishSlots.map((slot, i) => ({ slot, fish: farmFish(slot), i })).filter((x) => x.fish);
  const show = state.showSlots.map((slot, i) => ({ slot, fish: farmFish(slot), i })).filter((x) => x.fish);
  const all = activeFishIds().filter(Boolean).length,ready = farmReady();
  $("#productionCount").textContent = `${all}/${R.farmSlots + R.showSlots}`;
  const rows = (productionTab === "farm" ? farm : show).map(({ slot, fish, i }) => {
    const p = productionTab === "farm" ? M.production(state, slot) : null,name = FISH[fish.kind].name;
    return `<div class="production-row ${p?.ready ? "ready" : ""}"><span class="production-fish" aria-hidden="true">${fishArt(fish.kind)}</span><button class="production-info production-detail" data-action="fish-detail" data-from="tank" data-kind="${fish.kind}" aria-label="查看${name}详情" aria-describedby="production-status-${productionTab}-${i}"><strong>${name}</strong>${p ? `<span id="production-status-${productionTab}-${i}" data-production-clock="${i}"></span><progress class="production-progress" max="${R.productionHours}" value="${p.next === 0 ? R.productionHours : R.productionHours - p.next}" aria-label="${name}本份肥料进度"></progress>` : `<small id="production-status-${productionTab}-${i}">自在游动 · 观赏伙伴</small>`}</button>${p?.ready ? `<button class="production-claim" data-action="collect" data-from="tank" data-slot="${i}" aria-label="收取${name}的 ${p.ready} 份肥料">领取</button>` : ""}</div>`;
  });
  body.innerHTML = `<div class="production-tabs" role="tablist" aria-label="住客类型"><button id="productionFarmTab" role="tab" data-action="production-tab" data-tab="farm" aria-controls="productionList" tabindex="${productionTab === "farm" ? 0 : -1}" aria-selected="${productionTab === "farm"}">产肥 <b>${farm.length}</b></button><button id="productionShowTab" role="tab" data-action="production-tab" data-tab="show" aria-controls="productionList" tabindex="${productionTab === "show" ? 0 : -1}" aria-selected="${productionTab === "show"}">观赏 <b>${show.length}</b></button></div><div class="production-list" id="productionList" role="tabpanel" aria-labelledby="${productionTab === "farm" ? "productionFarmTab" : "productionShowTab"}" tabindex="0">${rows.length ? rows.join("") : `<p class="production-empty">${productionTab === "farm" ? "还没有产肥的鱼儿" : "还没有观赏伙伴"}<br>在「管理住客」安排入住</p>`}</div>${productionTab === "farm" ? `<p class="production-note">每 ${R.productionHours} 小时 1 份 · 最多存 ${R.storageLimit} 份</p>` : ""}<footer class="production-actions"><button data-action="farm">管理住客</button><button class="production-all" data-action="collect" data-from="tank" ${ready ? "" : "disabled"}>${ready ? `收取全部 · ${ready} 份` : "暂无可领肥料"}</button></footer>`;
  body.querySelector(".production-list").scrollTop = scroll;
  if (focused) {
    const target = [...body.querySelectorAll("button:not(:disabled)")].find((el) => ["action", "slot", "kind", "tab"].every((key) => el.dataset[key] === focused[key]));
    (target || $("#productionTitle")).focus({ preventScroll: true });
  }
  refreshProductionClocks();
}
function refreshProductionClocks() {
  document.querySelectorAll("[data-production-clock]").forEach((el) => {
    const p = M.production(state, state.fishSlots[+el.dataset.productionClock]);
    el.textContent = p.ready ? `${p.ready} 份可领${p.next === 0 ? " · 已存满" : ""}` : `还需 ${clockTime(p.next)}`;
    const progress = el.nextElementSibling;if (progress) progress.value = p.next === 0 ? R.productionHours : R.productionHours - p.next;
  });
}
function refreshClocks() {
  FarmUI.refreshClocks();
  refreshProductionClocks();
}
function animateNumber(el, from, to, ms) {
  if (!el) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = to;
    return;
  }
  const start = performance.now();
  function tick(now) {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
let disposeCatalogImages = () => {};
function showDialog(title, intro, body, foot = "", wide = false, family = "", backTo = "") {
  disposeCatalogImages();
  disposeCatalogImages = () => {};
  body=FarmArt.html(body);foot=FarmArt.html(foot);
  FarmUI.rememberPanel();
  const focused = $("#tankProduction")?.contains(document.activeElement) ? $('[data-dock="farm"]') : document.activeElement;
  closeTankManagement(false);
  const oldDialog = $("#dialog");
  if (!$("#modal").hidden && oldDialog.dataset.family === "atlas-dialog") {
    const item = focused?.closest(".atlas-card");
    atlasPositions.set(oldDialog.dataset.atlasFilter || "all", {
      top: oldDialog.querySelector(".dialog-body").scrollTop,
      key: item?.dataset.kind || item?.dataset.crop
    });
  }
  FarmUI.cancelTool();
  const opening = $("#modal").hidden;
  if (opening) {
    clearTimeout(toastTimer);
    $("#toast").hidden = true;
    previousFocus = focused?.closest(".farm-tools") && document.documentElement.classList.contains("light-note-mobile-rendering") ?
    $('[data-dock="tools"]') :
    focused;
    previousAction = previousFocus?.dataset?.action || null;
    document.body.style.overflow = "hidden";
  }
  const dialog = $("#dialog");
  const sameFamily = !opening && family && dialog.dataset.family === family;
  dialog.className = "dialog" + (wide ? " wide" : "") + (family ? ` tabbed-dialog ${family}` : "");
  dialog.dataset.family = family;
  delete dialog.dataset.panelKey;
  if (sameFamily) {
    // Tab 切换保留弹框外壳与页签节点，只换内容；避免入场重播和焦点跳动。
    $("#dialogTitle").textContent = title;
    const subtitle = dialog.querySelector(".dialog-head p");
    if (subtitle) subtitle.textContent = intro;
    const content = dialog.querySelector(".dialog-body"),next = document.createElement("div");
    // Fixed category navigation is a sibling of the sole scroll owner. Move it back only
    // while reconciling so the existing tab buttons/focus can be reused, then pin it again.
    const navigation = dialog.querySelector(":scope > .panel-navigation");
    if (navigation) content.prepend(navigation);
    const scrollTop = content.scrollTop;
    const panelScroll = [...content.querySelectorAll(".tank-panel")].map((panel) => panel.scrollTop);
    next.innerHTML = body;
    const tabs = content.querySelector(".fish-tabs,.bag-tabs"),nextTabs = next.querySelector(".fish-tabs,.bag-tabs");
    if (tabs && nextTabs && tabs.children.length === nextTabs.children.length) {
      const buttons = [...nextTabs.children];
      [...tabs.children].forEach((button, i) => {
        button.className = buttons[i].className;
        button.innerHTML = buttons[i].innerHTML;
        for (const attribute of ["aria-pressed", "aria-selected"]) {
          if (buttons[i].hasAttribute(attribute)) button.setAttribute(attribute, buttons[i].getAttribute(attribute));else
          button.removeAttribute(attribute);
        }
      });
      nextTabs.replaceWith(tabs);
    }
    content.replaceChildren(...next.childNodes);
    content.scrollTop = scrollTop;
    content.querySelectorAll(".tank-panel").forEach((panel, i) => {panel.scrollTop = panelScroll[i] || 0;});
    const footer = dialog.querySelector(".dialog-foot");
    if (footer && footer.innerHTML !== foot) footer.innerHTML = foot;
  } else {
    dialog.innerHTML = `<div class="dialog-head"><div><div class="game-title">${FarmArt.ui("leaves-left", "title-leaves")}<h2 id="dialogTitle">${title}</h2>${FarmArt.ui("leaves-right", "title-leaves")}</div>${intro ? `<p>${intro}</p>` : ""}</div><button class="dialog-close" data-action="close" aria-label="关闭弹窗">×</button></div><div class="dialog-body">${body}</div>${foot ? `<div class="dialog-foot">${foot}</div>` : ""}`;
  }
  const close = dialog.querySelector(".dialog-close");
  close.dataset.action = backTo ? "dialog-back" : "close";
  close.setAttribute("aria-label", backTo === "atlas" ? "返回图鉴" : "关闭弹窗");
  if (backTo) close.dataset.dialogBack = backTo;else delete close.dataset.dialogBack;
  FarmArt.decorateActions(dialog);
  $("#modal").hidden = false;
  if (family === "atlas-dialog") disposeCatalogImages = FarmArt.mountCatalogImages(dialog.querySelector(".dialog-body"));
  if (sameFamily && focused?.isConnected) focused.focus({ preventScroll: true });else
  dialog.focus({ preventScroll: true });
  requestAnimationFrame(positionDiscoveryGuide);
}
function backFromDialog(nested = false) {
  if ($(nested ? '[data-dialog-back="atlas"]' : '.dialog-close[data-dialog-back="atlas"]')) atlasDialog();
  else if (!nested || !FarmFacilities.back() && !FarmUI.back()) closeDialog();
}
function closeDialog(restore = true) {
  disposeCatalogImages();
  disposeCatalogImages = () => {};
  FarmUI.rememberPanel();
  FarmUI.dismissPurchase();
  FarmFacilities.dismiss();
  pendingPlacement = null;
  if ($("#modal").hidden) return;
  $("#modal").hidden = true;
  document.body.style.overflow = "";
  if (restore) {
    const focus = previousFocus?.isConnected ?
    previousFocus :
    previousAction ?
    document.querySelector(`[data-action="${previousAction}"]`) :
    null;
    focus?.focus({ preventScroll: true });
  }
  previousFocus = null;
  previousAction = null;
  requestAnimationFrame(positionDiscoveryGuide);
}
function rulesDialog() {
  showDialog(
    "庄园指南",
    "",
    rulesContent(),
    '<button class="button primary" data-action="close">回到庄园</button>',
    true, "help-dialog"
  );
}

function manorMenu() {
  showDialog("庄园小记", `相伴 ${M.day(state)} 天`, `<div class="manor-menu">${[["daily", "每日任务", M.pendingDailyWater(state).length ? "有奖励待领" : `${state.dailyDone.filter(Boolean).length} / 3`], ["level", "成长奖励", `Lv.${M.level(state)}`], ["memories", "庄园日记", "看看收获"], ["rules", "玩法帮助", "种植 · 钓鱼 · 养鱼"]].map(([action, title, detail]) => `<button data-action="${action}" class="${action === "daily" && M.pendingDailyWater(state).length ? "has-reward" : ""}"><strong>${title}</strong><small>${detail}</small><span aria-hidden="true">›</span></button>`).join("")}</div>`, "", false, "manor-menu-dialog");
}

const wait = (ms) => new Promise((r) => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? Math.min(ms, 60) : ms));

function dailyDialog() {
  const done = state.dailyDone.filter(Boolean).length;
  const claimed = (state.dailyWaterClaims || []).reduce((n, v) => n + v, 0);
  const pending = M.pendingDailyWater(state).reduce((n, r) => n + r.water, 0);
  const names = GardenLive.quests.map((q) => esc(q.label || q.key));
  const arts = [toolSprite("daily"), `<img src="knowledge-garden-v19/incoming/dock-r3/atlas.webp" alt="">`, `<img src="knowledge-garden-v19/incoming/dock-r3/backpack.webp" alt="">`];
  const tasks = names.map((name, i) => {
    const received = state.dailyWaterClaims?.[i] || 0,complete = state.dailyDone[i],remaining = R.dailyWater - received;
    return `<article class="manor-quest ${complete ? "done" : ""}"><div class="quest-art">${arts[i]}</div><div><h3>${name}</h3><small>${complete ? remaining ? "已完成 · 待领取" : "✓ 水滴已领取" : "在轻笺完成"}</small></div><span class="quest-water">${toolSprite("water")}<b>${remaining || R.dailyWater}</b><small>滴</small></span><button class="tile-btn ${!complete || remaining && state.water < R.waterCap ? "primary" : ""}" data-action="${complete ? "claim-daily-water" : "complete-daily"}" data-index="${i}" ${complete && (!remaining || state.water >= R.waterCap) ? "disabled" : ""}>${!complete ? "去完成" : !remaining ? "已领取" : state.water >= R.waterCap ? "水桶已满" : "领取"}</button></article>`;
  }).join("");
  showDialog("每日任务", "每天积累一点知识，为庄园添水。", `<div class="quest-summary"><div><strong>今日已完成 ${done} / 3 项</strong><span class="quest-progress"><i style="width:${done / 3 * 100}%"></i></span></div><span><b>每天可得 ${R.dailyWater * 3} 滴</b><small>今日已领 ${claimed} 滴</small></span></div><div class="manor-quests">${tasks}</div><div class="quest-bucket">${toolSprite("water")}<span>储水桶现有 <b>${state.water} 滴</b><small>储水容量 ${R.waterCap} 滴 · 装不下的水滴可在今日稍后领取</small></span><button class="tile-btn primary quest-claim-all" data-action="claim-all-daily-water" ${!pending || state.water >= R.waterCap ? "disabled" : ""}>${!pending ? "暂无可领取" : state.water >= R.waterCap ? "水桶已满" : `一键领取 · ${Math.min(pending, R.waterCap - state.water)} 滴`}</button></div>`,
  '<button class="button" data-action="collections">庄园成就</button><button class="button primary" data-action="close">回到庄园</button>', false, "daily-dialog");
}

function baitDialog() {
  const free = remainingCasts(),selected = state.preferredBait || "bait";
  const option = (kind, name, count, effect) => `<article class="bait-choice ${selected === kind ? "selected" : ""}">${M.BAIT_RECIPES[kind] ? FarmFacilities.baitArt(kind) : `<img src="knowledge-garden-v19/incoming/farm-r2/sprites/icon-bait${kind === "rainbow" ? "-rainbow" : ""}.webp" alt="">`}<div><h3>${name} <small>× ${count}</small></h3><p>${effect}</p></div><button class="tile-btn ${selected === kind ? "" : "primary"}" data-action="select-bait" data-kind="${kind}" aria-pressed="${selected === kind}" ${selected === kind ? "disabled" : ""}>${selected === kind ? "✓ 已选用" : "选用"}</button></article>`;
  const crafted = state.workshop || M.BAIT_RECIPES[selected] || Object.values(state.craftedBait || {}).some(Boolean) ? Object.entries(M.BAIT_RECIPES).map(([key, r]) => option(key, r.name, state.craftedBait?.[key] || 0, `更易遇见${r.preference}`)).join("") : "";
  showDialog("鱼饵箱", free ? `今日还有 ${free} 次免费垂钓，暂不消耗鱼饵。` : "点水面抛竿，继续使用上次选用的鱼饵。",
  option("bait", "普通鱼饵", state.bait, "每竿使用 1 份") + option("rainbow", "彩虹鱼饵", state.rainbowBait, "必定上钩") + crafted + `<p class="bait-memory-note">${crafted && free ? "免费次数优先，之后才消耗特制鱼饵。" : ""}用完时再提醒更换，不会自动消耗另一种鱼饵。</p>${state.workshop ? '<button class="tile-btn" data-action="facility-open" data-facility="workshop">去工坊制作</button>' : ""}`,
  `<button class="button" data-action="buy-bait" data-count="1" ${state.wallet < R.baitCost ? "disabled" : ""}>买普通鱼饵 · ${R.baitCost} 积分</button><button class="button primary" data-action="close">选好了</button>`, false, "bait-dialog");
}
let finishReel = null;
const castText = () => remainingCasts() ? `免费 ${remainingCasts()} 次` : state.preferredBait === "rainbow" ? `彩虹鱼饵 ${state.rainbowBait} 份` : M.BAIT_RECIPES[state.preferredBait] ? `${M.BAIT_RECIPES[state.preferredBait].name} ${state.craftedBait?.[state.preferredBait] || 0} 份` : `普通鱼饵 ${state.bait} 份`;
function updatePond() {
  const pond = $("#pondSpot");
  if (!pond) return;
  const seaPhase = fishingSpot === "sea" ? fishingPhase : "idle";
  pond.dataset.phase = seaPhase;
  pond.classList.toggle("casting", state.casting && fishingSpot === "sea");
  const hit = pond.querySelector(".pond-hit");
  hit.disabled = state.casting && seaPhase !== "bite";
  hit.setAttribute("aria-label", seaPhase === "bite" ? "鱼儿咬钩了，点击收竿" : state.casting ? "正在垂钓" : `在钓鱼区抛竿，可遇见淡水与海水伙伴，${castText()}`);
  const sign = $(".pier-sign");
  if (sign) {sign.disabled = hit.disabled;sign.setAttribute("aria-label", `钓鱼区，${castText()}`);}
  pond.querySelector(".pond-hint").textContent = "";
  GardenCourtyard.updateFishing(seaPhase);
  const label = $("#pondLabel");
  label.innerHTML = "";
  label.hidden = true;
  pond.classList.toggle("has-result", false);
}
function focusFishing() {
  closeDialog();
  setManorArea("bay");
  if (view !== "tree") {
    view = "tree";
    $("#viewSelect").value = "tree";
    render();
  }
  $("#pondSpot")?.scrollIntoView({ behavior: "smooth", block: "center" });
  $(".pond-hit")?.focus({ preventScroll: true });
}
async function cast(event, choice = null) {
  if (state.casting) {if (fishingPhase === "bite") finishReel?.();return;}
  // 在 click 阶段再锁定一次落点，避免 focus 顺序、触控或悬停位置不同步。
  if (event?.detail > 0) GardenCourtyard.aimAtPointer(event);
  const selected = choice || state.preferredBait || "bait";
  const source = await M.beginCast(state, selected);
  if (!source) {baitDialog();toast("上次选用的鱼饵用完了，补充或换一种吧");return;}
  closeDialog();
  const session = state,
    forced = $("#castResult").value;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pondEl = $("#pondSpot");
  // 抛竿时就确定结果：只有真的上钩才播放咬钩，空竿只有轻轻一碰
  const result = await M.resolveCast(state, FISH, Math.random, forced === "random" ? null : forced);
  state.casting = true;
  catchResult = null;
  fishingPhase = "cast";
  const inputSession = FishingInput.start({
    target: $(".garden-scene"),
    canReel: () => state === session && fishingPhase === "bite",
    onReel: () => finishReel?.()
  });
  updatePond();
  lockToolbar(true);
  syncGuide();
  announce(source === "free" ? "消耗一次免费机会，已抛竿" : source === "rainbow" ? "用了一份彩虹鱼饵，已抛竿" : "消耗一份鱼饵，已抛竿");
  let releaseReel = null,castAgain = false;
  const step = (phase, ms) => {
    fishingPhase = phase;
    updatePond();
    return new Promise((r) => setTimeout(r, reduced ? 50 : ms));
  };
  try {
    await new Promise((r) => setTimeout(r, reduced ? 50 : 900));
    if (state !== session) return;
    await step("wait", 1600);
    if (state !== session) return;
    if (result.fish) {
      // 咬钩：浮漂被猛地拽下水、竿梢连抽几下，然后收线
      fishingPhase = "bite";
      updatePond();
      GardenFX.bite(pondEl);
      announce("鱼儿咬钩了，点击庄园任意位置或按空格收竿，也可以等自动收竿");
      await new Promise((resolve) => {
        let timer;
        const finish = () => {clearTimeout(timer);if (finishReel === finish) finishReel = null;resolve();};
        releaseReel = finish;
        finishReel = finish;
        timer = setTimeout(finish, reduced ? 60 : 2400);
      });
      if (state !== session) return;
      await step("retrieve", 700);
    } else {
      await step("nibble", 1000);
      if (state !== session) return;
      await step("retrieve", 500);
    }
    if (state !== session) return;
    state.casting = false;
    FishingInput.stop(inputSession);
    fishingPhase = "idle";
    fishingSpot = "sea";
    const caught = result.fish;
    update();
    if (!caught) {
      GardenFX.miss(pondEl, "空竿", "鱼儿碰了碰鱼饵，又游走了");
      announce("这次空竿");
      return;
    }
    castAgain = await revealCaught(result, pondEl, { session });
  } finally {
    releaseReel?.();
    FishingInput.stop(inputSession);
    // 重置演示场景后，旧动画不得清除新一轮垂钓的收竿回调或操作锁。
    if (state === session) {
      state.casting = false;
      fishingPhase = "idle";
      fishingSpot = "sea";
      updatePond();
      lockToolbar(false);
    }
  }
  // 明确点选后才续竿；每日免费用完就停，不自动消耗任何鱼饵。
  if (castAgain === true && state === session && remainingCasts() > 0) await cast(null);
}
// 揭晓一位新住客：钓鱼上钩、拆淡水鱼苗袋共用。首钓只可放进养鱼舱，其后可卖出或先收着
async function revealCaught(result, anchorEl, { session = state, source = "fish" } = {}) {
  const caught = result.fish;
  announce(`${source === "fry" ? "鱼苗袋里是" : "钓到"}${FISH[caught.kind].name}`);
  const creature = isCreature(caught.kind),
    slots = creature ? state.showSlots : state.fishSlots,
    freeSlot = slots.findIndex((x) => !x),
    price = M.sellPrice(caught.kind, FISH);
  const choice = await GardenFX.revealCatch(anchorEl, {
    art: fishArt(caught.kind),
    name: FISH[caught.kind].name,
    quality: FISH[caught.kind].quality,
    qualityClass: qClass(FISH[caught.kind].quality) || "common",
    size: `${FISH[caught.kind].water === "fresh" ? "淡水" : "海水"} · ${creature ? `${fishSize(caught.kind)} · 不产肥，可观赏` : fishSize(caught.kind)}`,
    discovered: result.discovered,
    detail: `${state.fish.filter((f) => f.kind === caught.kind).length > 1 ? `已拥有 ${state.fish.filter((f) => f.kind === caught.kind).length} ${creature ? "位" : "尾"} · ` : ""}${creature ? "住进观赏位，让水舱热闹一点" : `入住后每 ${R.productionHours} 小时产肥 · 每份催熟 ${M.FERT[FISH[caught.kind].fertilizer].hours} 小时`}`,
    firstCatch: result.firstCatch,
    guidePlace: state.discoveryGuide === "place" && !creature,
    actions: [
    { key: "place", label: creature ? freeSlot >= 0 ? "放进观赏位" : "换进观赏位" : freeSlot >= 0 ? "放进养鱼舱" : "换进养鱼舱", primary: true },
    ...(!result.firstCatch ? [{ key: "sell", label: `卖出 · +${price} 积分` }, { key: "keep", label: "先收着" },
    ...(source === "fish" && remainingCasts() > 0 ? [{ key: "again", label: `收好，再免费钓一次 · 余 ${remainingCasts()} 次` }] : [])] : [])]

  });
  if (state !== session) return;
  if (choice === "place") {
    const ok = freeSlot >= 0 && (creature ? await M.placeShow(state, caught.id, freeSlot, FISH) : await M.place(state, caught.id, freeSlot, FISH));
    if (ok) {
      update();
      toast(`${FISH[caught.kind].name}已入住${creature ? "观赏位" : `，${R.productionHours} 小时后可收肥`}`);
    } else chooseDialog(null, caught.id, creature ? "show" : "farm");
  } else if (choice === "sell") await sellFlow(caught.id, anchorEl, false);else
  update();
  return choice === "again";
}
// 稀有度小圆点
const qualityDot = (kind) => `<i class="q-dot ${qClass(FISH[kind].quality) || "common"}" title="${FISH[kind].quality}"></i>`;
const fishLabel = (f) => FISH[f.kind].name;
const sellBtn = (f, from = "farm") => {
  const price = M.sellPrice(f.kind, FISH);
  return `<button class="tile-btn sell" data-action="sell" data-fish="${f.id}" data-from="${from}" aria-label="卖出${fishLabel(f)}，得 ${price} 积分"><span>卖出</span>${FarmArt.ui("coin", "resident-coin")}<b>${price}</b></button>`;
};
// 舱里的一格：住客或空位
function slotTile(slot, i, area) {
  const f = farmFish(slot);
  const chooseAction = area === "show" ? "choose-show" : "choose";
  if (!f)
  return `<button class="tank-tile empty" data-action="${chooseAction}" data-slot="${i}"><span class="tile-plus" aria-hidden="true">＋</span><span class="tile-empty-text">${area === "show" ? "放一位水族" : "放一尾鱼"}</span></button>`;
  const info = FISH[f.kind];
  const p = area === "show" ? null : M.production(state, slot);
  const status = p ?
  p.ready === R.storageLimit ?
  "肥料已存满" :
  p.ready ?
  `可收 ${p.ready} 份` :
  `${duration(p.next)} 后产肥` :
  `${info.quality} · ${fishSize(f.kind)}`;
  return `<div class="tank-tile filled ${qClass(info.quality) || "common"}"><div class="tile-art">${fishArt(f.kind)}</div><div class="tile-name">${qualityDot(f.kind)}<span>${info.name}</span></div><div class="tile-status${p && p.ready ? " ready" : ""}">${status}</div>${p ? `<small class="resident-yield">每份催熟 ${M.FERT[info.fertilizer].hours} 小时</small><div class="tile-progress"><span style="width:${p.progress * 100}%"></span></div>` : ""}<div class="tile-actions resident-actions">${sellBtn(f)}<button class="tile-btn" data-action="unplace" data-fish="${f.id}">收回</button><button class="tile-btn" data-action="${chooseAction}" data-slot="${i}">更换</button></div></div>`;
}
// 待养区的一格：卖出、放生（仅鱼）、入住
function storedTile(f) {
  const info = FISH[f.kind],
    creature = isCreature(f.kind);
  const release = creature ? "" : `<button class="tile-btn" data-action="release" data-fish="${f.id}" data-from="farm" aria-label="放生${fishLabel(f)}，得 1 份${M.FERT[info.fertilizer].name}">放生</button>`;
  return `<div class="tank-tile filled stored ${qClass(info.quality) || "common"}"><div class="tile-art">${fishArt(f.kind)}</div><div class="tile-name">${qualityDot(f.kind)}<span>${info.name}</span></div><div class="tile-status">${creature ? "观赏 · 不产肥" : `每份催熟 ${M.FERT[info.fertilizer].hours} 小时`} · ${fishSize(f.kind)}</div><div class="tile-actions resident-actions">${sellBtn(f)}${release}<button class="tile-btn primary" data-action="${creature ? "assign-show" : "assign"}" data-fish="${f.id}">${creature ? "观赏" : "入住"}</button></div></div>`;
}
let storedFilter = "all";
function farmDialog() {
  const active = activeFishIds();
  const storedAll = state.fish.filter((f) => !active.includes(f.id));
  const stored = storedAll.filter((f) => storedFilter === "all" || storedFilter === "creature" === isCreature(f.kind));
  const vacancies = M.residentPlan(state, FISH).length;
  const farmed = state.fishSlots.filter(Boolean).length,
    shown = state.showSlots.filter(Boolean).length;
  const tabs = [
  ["all", "全部"],
  ["fish", "鱼"],
  ["creature", "水族"]].

  map(([k, t]) => `<button data-action="stored-filter" data-kind="${k}" class="${storedFilter === k ? "active" : ""}">${t}</button>`).
  join("");
  showDialog(
    tankLabel(),
    "",
    `<div class="farm-board"><section class="tank-panel"><div class="panel-head"><h3>产肥位 <b>${farmed} / ${R.farmSlots}</b></h3><button class="collect-chip" data-action="collect" data-from="farm" ${farmReady() ? "" : "disabled"}>${fertilizerArt()}${farmReady() ? `收集 ${farmReady()} 份` : "肥料积累中"}</button></div><div class="tile-grid">${state.fishSlots.map((slot, i) => slotTile(slot, i, "farm")).join("")}</div><div class="panel-head show-head"><h3>观赏位 <b>${shown} / ${R.showSlots}</b></h3><span>不产肥，只为好看</span></div><div class="tile-grid">${state.showSlots.map((slot, i) => slotTile(slot, i, "show")).join("")}</div></section><section class="tank-panel stored-panel"><div class="panel-head"><h3>待养区 <b>${storedAll.length}</b></h3><div class="fish-tabs mini">${tabs}</div></div><div class="resident-plan"><span>产肥优先肥效，观赏优先稀有度。已有住客不动。</span><button class="tile-btn" data-action="fill-residents" ${vacancies ? "" : "disabled"}>${vacancies ? `安排 ${vacancies} 位入住空位` : "暂无可安排的住客"}</button></div><div class="stored-scroll">${stored.length ? `<div class="tile-grid">${stored.map(storedTile).join("")}</div>` : `<div class="farm-empty">${storedAll.length ? "这一类还没有" : "待养区空空的<br>去海边钓场遇见下一位朋友吧"}</div>`}</div></section></div>`,
    `<span class="foot-info">鱼住产肥位，每尾 ${R.productionHours} 小时产 1 份催熟肥；水族住观赏位。待养水族可随时卖出，图鉴记录保留。</span><button class="button" data-action="fishing">去钓鱼</button><button class="button primary" data-action="tank-manage">回到养鱼舱</button>`,
    true,
    "farm-dialog"
  );
}
// 卖出：珍稀、传说先确认，避免手滑
async function sellFlow(id, from, reopen) {
  const fish = state.fish.find((x) => x.id === id);
  if (!fish) return;
  const info = FISH[fish.kind],
    price = M.sellPrice(fish.kind, FISH);
  const back = reopen === "shop" ? "shop" : reopen ? "farm" : "";
  if (["珍稀", "传说"].includes(info.quality)) {
    showDialog(
      `卖出${fishLabel(fish)}？`,
      `${info.quality}，卖出后得 ${price} 积分，${R.buybackHours} 小时内可花原价赎回。图鉴记录保留。`,
      `<div class="fish-detail-art">${fishArt(fish.kind)}</div>`,
      `<button class="button" data-action="${back === "shop" ? "shop-mode" : back || "close"}" data-mode="sell">再想想</button><button class="button primary" data-action="sell-confirm" data-fish="${id}" data-from="${back}">确认卖出</button>`
    );
    return;
  }
  await doSell(id, from, reopen);
}
async function doSell(id, from, reopen) {
  const fish = state.fish.find((x) => x.id === id);
  if (!fish) return;
  const label = fishLabel(fish);
  const wasPlaced = M.placed(state, id);
  if (wasPlaced) await M.unplace(state, id, FISH);
  const n = await M.sell(state, id, FISH);
  if (n) {
    update();
    if (reopen === "shop") FarmUI.shopDialog("sell-fish");else
    if (reopen) farmDialog();else
    closeDialog();
    GardenFX.flyTo(from || $("#pondSpot"), $("#wallet"), coinSprite, { size: 34 });
    toast(`卖出${label} · +${n} 积分`);
  } else {
    update();
    if (reopen === "shop") FarmUI.shopDialog("sell-fish");else if (reopen) farmDialog();
    toast(wasPlaced ? "暂时无法卖出，已收回待养区" : "暂时无法卖出，请重新查看待养区");
  }
}
// 选位置：area 为 farm（产肥位，只放鱼）或 show（观赏位，只放其他水族）
let pendingPlacement = null;
async function placeResident(id, index, area = "farm", confirmed = false) {
  const slots = area === "show" ? state.showSlots : state.fishSlots;
  const incoming = state.fish.find((f) => f.id === id),old = farmFish(slots[index]);
  if (!incoming || M.placed(state, id) || !Number.isInteger(index) || index < 0 || index >= slots.length) return;
  if (old && !confirmed) {
    const p = area === "farm" ? M.production(state, slots[index]) : null;
    pendingPlacement = { id, index, area, previous: old.id, session: state };
    showDialog("换一位新住客", "原来的住客会回到待养区，图鉴记录保留。",
    `<div class="resident-comparison"><div>${fishArt(old.kind)}<b>${FISH[old.kind].name}</b><small>${area === "farm" ? `每 ${R.productionHours} 小时产 1 份 · 催熟 −${M.FERT[FISH[old.kind].fertilizer].hours} 小时` : "回到待养区"}</small></div><span aria-hidden="true">→</span><div>${fishArt(incoming.kind)}<b>${FISH[incoming.kind].name}</b><small>${area === "farm" ? `每 ${R.productionHours} 小时产 1 份 · 催熟 −${M.FERT[FISH[incoming.kind].fertilizer].hours} 小时` : "入住观赏位"}</small></div></div>${p ? `<p class="info-box">已产 ${p.ready} 份肥料会自动收好。${p.next === 0 ? "储存已满。" : `这一份已积累 ${shortDuration(R.productionHours - p.next)}，换鱼后重新计时。`}新住客 ${R.productionHours} 小时后产出第一份。</p>` : ""}`,
    '<button class="button" data-action="farm">保留原住客</button><button class="button primary" data-action="place-confirm">确认更换</button>');
    $("#dialog").classList.add("resident-dialog");
    return;
  }
  const ok = area === "show" ? await M.placeShow(state, id, index, FISH) : await M.place(state, id, index, FISH);
  if (ok) {catchResult = null;update();farmDialog();toast(area === "show" ? "新朋友已住进观赏位" : "鱼儿已入住 · 开始积累催熟肥");}
}
function chooseDialog(slot, fishId = null, area = "farm") {
  const slots = area === "show" ? state.showSlots : state.fishSlots,
    unit = area === "show" ? "观赏位" : "产肥位";
  if (fishId !== null) {
    showDialog(
      "选一个位置",
      area === "show" ? "原来的住客会回到待养区。" : "已产出的肥料自动收集，原来的鱼回到待养区。",
      `<div class="tile-grid">${slots.
      map((s, i) => {
        const f = farmFish(s);
        return `<button class="tank-tile ${f ? "filled pick" : "empty"}" data-action="${area === "show" ? "place-show" : "place"}" data-fish="${fishId}" data-slot="${i}">${f ? `<div class="tile-art">${fishArt(f.kind)}</div><div class="tile-name"><span>${FISH[f.kind].name}</span></div><div class="tile-status">换下这${area === "show" ? "位" : "尾"}</div>` : `<span class="tile-plus" aria-hidden="true">＋</span><span class="tile-empty-text">第 ${i + 1} 个${unit}</span>`}</button>`;
      }).
      join("")}</div>`,
      '<button class="button" data-action="farm">返回养鱼舱</button>',
      true
    );
    return;
  }
  const stored = state.fish.filter((f) => !activeFishIds().includes(f.id) && isCreature(f.kind) === (area === "show"));
  showDialog(
    `放进第 ${slot + 1} 个${unit}`,
    area === "show" ? "选一位待养区里的水族朋友。" : "选一尾待养的鱼。更换时自动收好已产肥料，未完成进度重新开始。",
    stored.length ?
    `<div class="tile-grid">${stored.
    map(
      (f) =>
      `<button class="tank-tile filled pick ${qClass(FISH[f.kind].quality) || "common"}" data-action="${area === "show" ? "place-show" : "place"}" data-fish="${f.id}" data-slot="${slot}"><div class="tile-art">${fishArt(f.kind)}</div><div class="tile-name">${qualityDot(f.kind)}<span>${FISH[f.kind].name}</span></div><div class="tile-status">${area === "farm" ? `每份催熟 ${M.FERT[FISH[f.kind].fertilizer].hours} 小时` : FISH[f.kind].quality + " · " + fishSize(f.kind)}</div></button>`
    ).
    join("")}</div>` :
    `<div class="farm-empty">待养区里还没有${area === "show" ? "其他水族" : "鱼"}，去钓鱼认识新朋友吧。</div>`,
    '<button class="button" data-action="farm">返回养鱼舱</button><button class="button soft" data-action="fishing">去钓鱼</button>',
    true
  );
}
const WILDLIFE_ATLAS = {
  rabbit: { name: "野兔", habitat: "草地邻居", text: "喜欢小路旁的草地，先停下观察，再用后脚蹬地跳向下一处。", actions: ["小跳回应"], gift: "rabbit" },
  sparrow: { name: "麻雀", habitat: "田边邻居", text: "常在菜地两侧的小路上啄食，轻轻招呼便飞去另一处歇脚。", actions: ["跳跃啄食", "拍翅换个落点"], gift: "radish" },
  frog: { name: "青蛙", habitat: "池塘邻居", text: "守着码头的一小片岸边。轻触后跃入水中，过一会儿再跳回栈桥。", actions: ["跃入水中", "返回岸边"] },
  butterfly: { name: "凤蝶", habitat: "花丛邻居", text: "在两侧花丛间盘旋，停下来合拢翅膀，再向另一朵花飞去。", actions: ["绕花飞行", "原地振翅"] },
  ladybird: { name: "瓢虫", habitat: "植株邻居", text: "起飞前先抬起红色鞘翅，再展开薄薄的膜翅，落地后慢慢合上。", actions: ["展开鞘翅", "掠过花丛"] },
  dragonfly: { name: "蜻蜓", habitat: "水边邻居", text: "在水边和花丛上方悬停。轻触会绕一圈、掠过，或短暂跟随手指。", actions: ["盘旋", "掠过", "跟随手指"] }
};
function wildlifeEntries() {
  return Object.keys(WILDLIFE_ATLAS).filter((key) => !isMobileView() || !["frog", "dragonfly"].includes(key)).map((key) => ({ type: "wildlife", key }));
}
function wildlifeArt(kind) {
  return FarmArt.wildlife(kind);
}
function wildlifeGift(kind) {
  if (kind === "rabbit") return { art: FarmArt.fertilizer("rabbit"), name: M.FERT.rabbit.name, daily: `每日 1 份${M.FERT.rabbit.name}`, effect: `作物加速 ${M.FERT.rabbit.hours * 60} 分钟`, pickup: "拾取小路上的肥料袋，收进背包", status: M.poopReady(state) ? "草地有礼物" : "今日已拾取" };
  if (kind === "sparrow") return { art: FarmArt.packet("radish"), name: "小萝卜种子", daily: "每日 1 颗小萝卜种子", effect: `种下后浇水，${M.CROPS.radish.first} 小时首收`, pickup: "留意麻雀停留的小路，拾取落下的种子", status: M.birdSeedReady(state) ? "种子待拾取" : M.birdCanDeliver(state) ? "等待麻雀送来" : "今日已拾取" };
  return null;
}
function wildlifeCard(kind) {
  const item = WILDLIFE_ATLAS[kind],gift = wildlifeGift(kind);
  return `<button class="atlas-card discovered wildlife-card" data-action="wildlife-detail" data-kind="${kind}" aria-label="${item.name}${gift ? `，${gift.daily}` : "，轻触看随机动作"}"><strong>${item.name}</strong><small class="wildlife-habitat">${item.habitat}</small><span class="wildlife-card-art">${wildlifeArt(kind)}</span><span class="wildlife-card-story">${item.text}</span><span class="wildlife-card-gift ${gift ? "has-gift" : ""}">${gift ? `<span>${gift.art}</span><b>${gift.daily}</b>` : "轻触看随机动作"}</span></button>`;
}
function wildlifeDetail(kind) {
  const item = WILDLIFE_ATLAS[kind];if (!item) return;
  const gift = wildlifeGift(kind);
  const giftHTML = gift ? `<section class="wildlife-gift-panel"><h3>每天的小礼物</h3><div class="wildlife-gift-content"><span class="wildlife-gift-art">${gift.art}</span><div><strong>${gift.name} <b>×1</b></strong><p>${gift.effect}</p><small>${gift.status}</small></div></div><p class="wildlife-pickup">${gift.pickup}</p></section>` : '<p class="wildlife-companion-note">在庄园陪伴你的小邻居，轻触会有随机动作。</p>';
  const actions = item.actions.map((label) => `<li>${kind === "rabbit" ? '<img src="knowledge-garden-v19/farm/wildlife-rabbit-action-3-r14.webp" alt="" draggable="false">' : ""}<span>${label}</span></li>`).join("");
  showDialog(item.name, item.habitat, `<div class="wildlife-sheet"><div class="wildlife-detail-art">${wildlifeArt(kind)}</div><p class="wildlife-story">${item.text}</p>${giftHTML}<section class="wildlife-actions-panel"><h3>轻触时的动作</h3><ul>${actions}</ul></section>${gift ? '<p class="wildlife-daily-note">每天最多 1 份，未拾取不累积；互动不会增加产量。</p>' : ""}</div>`, '<button class="button primary" data-action="close">回到庄园</button>', false, "wildlife-detail-dialog", "atlas");
}
async function readAtlasEntry(type, key) {
  try {
    if (await M.readAtlasEntry(state, type, key)) $("#gameTools").innerHTML = FarmArt.html(dockHTML());
  } catch { /* Reading metadata must never close or block a species detail. Retry on the next visit. */ }
}
function atlasDialog() {
  const restoreFocus = !$("#modal").hidden && $("#dialog").dataset.family !== "atlas-dialog";
  const unread = M.atlasUnreadEntries(state, FISH);
  const hasNew = (filter) => unread.some((item) => filter === "all" || (filter === "crops" ? item.type === "crop" :
  item.type === "fish" && (filter === "fish" ? !isCreature(item.key) : filter === "creature" && isCreature(item.key))));
  const entries = atlasFilter === "wildlife" ? wildlifeEntries() : M.collectionEntries(FISH);
  const got = (item) => item.type === "wildlife" || (item.type === "crop" ? !!state.cropDex[item.key] : state.discoveries[item.key] !== undefined);
  const items = entries.filter((item) => atlasFilter === "fish" ? item.type === "fish" && !isCreature(item.key) :
  atlasFilter === "creature" ? item.type === "fish" && isCreature(item.key) :
  atlasFilter === "crops" ? item.type === "crop" : atlasFilter === "missing" ? !got(item) : true);
  const progressItems = atlasFilter === "missing" ? entries : items;
  const have = progressItems.filter(got).length,total = progressItems.length;
  const pct = total ? Math.round(have / total * 100) : 0;
  showDialog(atlasFilter === "wildlife" ? "庄园邻居" : "图鉴", "",
  `${atlasFilter === "wildlife" ? "" : `<div class="atlas-progress"><span>已收录 <b>${have} / ${total}</b></span><div class="atlas-bar"><span style="width:${pct}%"></span></div><small>常见 → 稀有</small></div>`}<div class="fish-tabs" role="group" aria-label="图鉴分类">${[
  ["all", "全部"], ["fish", "鱼类"], ["creature", "其他生物"], ["crops", "作物"], ["wildlife", "场景生物"], ["missing", "未发现"]].
  map(([k, t]) => `<button data-action="atlas-filter" data-kind="${k}" class="${atlasFilter === k ? "active" : ""}" aria-pressed="${atlasFilter === k}" aria-label="${t}${hasNew(k) ? "，有新物种未查看" : ""}">${t}${hasNew(k) ? '<i class="atlas-tab-dot" aria-hidden="true"></i>' : ""}</button>`).join("")}</div><div class="atlas-grid${atlasFilter === "wildlife" ? " wildlife-grid" : ""}">${items.map((item) => {
    const k = item.key,found = got(item);
    if (item.type === "wildlife") return FarmArt.deferCatalogImages(wildlifeCard(k));
    if (item.type === "crop") return FarmArt.deferCatalogImages(FarmUI.cropAtlasCard(k));
    return FarmArt.deferCatalogImages(`<button class="atlas-card ${found ? "discovered" : ""}" data-action="fish-detail" data-kind="${k}" data-atlas-entry="fish" aria-label="${found ? FISH[k].name : "尚未遇见的生物"}${M.atlasEntryUnread(state, "fish", k) ? "，新物种未查看" : ""}">${M.atlasEntryUnread(state, "fish", k) ? '<i class="atlas-unread-dot" aria-hidden="true"></i>' : ""}${fishArt(k, !found).replace('class="fish-art', `class="fish-art ${found ? "" : "silhouette"}`)}</button>`);
  }).join("")}</div>${!items.length ? '<div class="farm-empty">这一页已经收集齐了，去看看其他收藏吧。</div>' : ""}`,
  `<button class="button" data-action="collections">庄园成就</button>${atlasFilter === "wildlife" ? '<button class="button primary" data-action="close">回到庄园</button>' : '<button class="button primary" data-action="fishing">去钓鱼 ↗</button>'}`, true, "atlas-dialog");
  $("#dialog").dataset.atlasFilter = atlasFilter;
  const position = atlasPositions.get(atlasFilter);
  const content = $("#dialog .dialog-body");
  content.scrollTop = position?.top || 0;
  if (restoreFocus && position?.key) {
    const card = [...content.querySelectorAll(".atlas-card")].find((el) => (el.dataset.kind || el.dataset.crop) === position.key);
    card?.focus({ preventScroll: true });
  }
}
function fishDetail(k, from = "atlas") {
  const f = FISH[k],
    found = state.discoveries[k] !== undefined;
  const acquisition = f.water === "fresh" ? "垂钓可遇见，也可从商店的淡水鱼苗袋获得。" : "在钓鱼区垂钓时有机会遇见。";
  const destination = `${f.water === "fresh" ? '<button class="button" data-action="shop-tab" data-tab="aquatic">淡水鱼苗袋</button>' : ""}<button class="button primary" data-action="fishing">去钓鱼区</button>`;
  if (!found) {
    showDialog(
      "尚未遇见",
      acquisition,
      `<div class="fish-detail-art">${fishArt(k, true)}</div>`,
      `${from === "tank" ? '<button class="button" data-action="tank-manage" data-dialog-back="tank-manage">返回养鱼舱</button>' : ""}${destination}`, false, "", from === "tank" ? "" : "atlas"
    );
    return;
  }
  showDialog(
    f.name,
    `${f.quality} · 已发现`,
    `<div class="fish-detail-art">${fishArt(k)}</div><p>${f.description}</p><p class="species-acquisition">获取方式：${acquisition}</p><div class="detail-grid"><div><small>体长</small><strong>${fishSize(k)}</strong></div><div class="fish-output"><small>${f.fertilizer ? "产出肥料" : "住处"}</small>${f.fertilizer ? `<span>${fertilizerArt(f.fertilizer)}<strong>${M.FERT[f.fertilizer].name}</strong></span><small>每份缩短 ${shortDuration(M.FERT[f.fertilizer].hours)}</small>` : "<strong>观赏位 · 不产肥</strong>"}</div><div><small>卖出价</small><strong>${M.sellPrice(k, FISH)} 积分</strong></div></div><div class="info-box">第一次相遇：第 ${state.discoveries[k]} 天。当前拥有 ${state.fish.filter((x) => x.kind === k).length} ${f.fertilizer ? "尾" : "位"}。<br>${f.fertilizer ? `每尾在产肥位每 ${R.productionHours} 小时产 1 份${M.FERT[f.fertilizer].name}，最多暂存 ${R.storageLimit} 份。` : "住在养鱼舱的观赏位里，不占产肥位。"}</div>`,
    `${from === "tank" ? '<button class="button" data-action="tank-manage" data-dialog-back="tank-manage">返回养鱼舱</button>' : ""}${destination}`, false, "", from === "tank" ? "" : "atlas"
  );
}

function collectionDialog() {
  const cards = Object.entries(M.COLLECTIONS).map(([key, c]) => {
    const p = M.collectionProgress(state, key, FISH);
    const goal = c.type === "fish" ? "鱼类全图鉴" : c.type === "creature" ? "其他水族全图鉴" : c.type === "allcrop" ? "作物全图鉴（收获或盛开）" : c.type === "all" ? "完成鱼类、水族与作物全图鉴" : c.type === "crop" ? "收获 5 种作物" : c.type === "rare" ? "收获 3 种稀有作物" : `发现 12 种${c.type === "sea" ? "海水" : "淡水"}生物`;
    const action = p.claimed ? "" : p.unlocked && p.count >= p.target ? `<button class="tile-btn primary" data-action="collection-claim" data-collection="${key}">领取成就奖励</button>` : `<button class="tile-btn" data-action="${["fish", "creature", "all"].includes(c.type) ? "atlas" : c.type === "sea" ? "fishing" : c.type === "fresh" ? "fishing" : c.type === "rare" ? "level" : "bag"}" data-tab="aquatic">${["fish", "creature", "all"].includes(c.type) ? "查看图鉴" : c.type === "sea" ? "去海钓" : c.type === "fresh" ? "去钓鱼" : c.type === "rare" ? "找稀有种子" : "去播种"}</button>`;
    return `<article class="collection-card ${p.claimed ? "complete" : ""}"><div class="collection-art">${FarmArt.packet(c.seed)}</div><h3>${c.name}</h3><p>${goal} · ${p.count} / ${p.target}</p><progress value="${p.count}" max="${p.target}" aria-label="${c.name}收藏进度"></progress><small>${p.claimed ? "✓ 成就奖励已领取" : p.unlocked ? "收集完成即可领奖" : `Lv.${c.level} 可领奖 · 现在也能积累进度`}</small><p>奖励：${M.CROPS[c.seed].name}种子 × ${c.count}</p><small>成就纪念「${c.title}」</small>${action}</article>`;
  }).join("");
  showDialog("庄园成就", "记录每一次收集，领取种子装点庄园。",
  `<div class="collection-grid">${cards}</div>`, '<button class="button" data-action="atlas" data-dialog-back="atlas">返回图鉴</button><button class="button primary" data-action="bag">去播种</button><button class="button" data-action="close">回到庄园</button>', false, "collections-dialog");
}
function memoriesDialog() {
  showDialog(
    "庄园日记",
    `在庄园度过的第 ${M.day(state)} 天。`,
    state.memories.length ?
    state.memories.
    slice().
    reverse().
    map((x) => `<div class="memory-entry"><p>${esc(x.text)}</p><small>第 ${x.day} 天</small></div>`).
    join("") :
    '<div class="farm-empty">还没有记录。第一次收获、庄园升级都会记在这里。</div>',
    '<button class="button primary" data-action="close">回到庄园</button>'
  );
}
// 奖励图、名称与用途始终来自同一条奖励配置，触屏也能直接读到用途。
function levelRewardItems(lv) {
  const r = M.LEVEL_REWARDS[lv];
  const items = Object.entries(r.seeds || {}).map(([key, count]) => {
    const c = M.CROPS[key];
    const use = c.bait ? `背包播种；收获后可换${c.bait === "rainbowBait" ? "彩虹" : "普通"}鱼饵` :
    c.fertilizer ? `可剪 ${c.harvests} 轮；每轮花束可售 ${c.sell} 积分，另得 1 份${M.FERT[c.fertilizer].name}` :
    c.sell === null ? "背包播种；开花观赏、点亮图鉴，不可出售" :
    `背包播种；${c.first} 小时后${c.type === "flower" ? "开花" : "收获"}${c.harvests > 1 ? `，可收 ${c.harvests} 轮` : ""}`;
    return { art: FarmArt.packet(key), name: `${c.name}种子`, count, use };
  });
  for (const [key, count] of Object.entries(r.fertilizers || {})) {
    const f = M.FERT[key];
    items.push({ art: fertilizerArt(key), name: f.name, count, use: `背包「肥料」使用；每份缩短 ${f.hours} 小时` });
  }
  if (r.water) items.push({ art: toolSprite("water"), name: "水滴", count: r.water, use: `存入水桶；播种后浇水，每块地 ${R.plantWater} 滴` });
  if (r.bait) items.push({ art: '<img src="knowledge-garden-v19/incoming/farm-r2/sprites/icon-bait.webp" alt="">', name: "普通鱼饵", count: r.bait, use: "海边钓鱼；免费次数用完后，每份再钓 1 次" });
  if (r.rainbowBait) items.push({ art: '<img src="knowledge-garden-v19/incoming/farm-r2/sprites/icon-bait-rainbow.webp" alt="">', name: "彩虹鱼饵", count: r.rainbowBait, use: "免费次数用完后手动选用，保证上钩" });
  return items;
}
function levelFacilityUnlocks(lv) {
  const items=Object.entries(M.FACILITIES).filter(([,f])=>f.gardenLevel===lv).map(([key,f])=>({
    art:FarmFacilities.art(key),name:f.name,use:`达到 Lv.${lv} 后，可在场景中查看建造条件。`
  }));
  for(const tier of R.purifierLevels.filter(t=>t.gardenLevel===lv)) items.push({
    art:FarmFacilities.purifierArt(tier.level),name:`海水过滤器${tier.level>1?` Lv.${tier.level}`:""}`,
    use:tier.level===1?"解锁海水过滤器的建造资格，每日可收清水。":"解锁设备升级资格，可前往海水过滤器查看材料。"
  });
  return items;
}
function levelDialog(selected) {
  const info = M.levelInfo(state.xp);
  const lv = Number.isInteger(selected) ? Math.max(1, Math.min(R.levels.length, selected)) : info.lv;
  const start = Math.floor((lv - 1) / 5) * 5 + 1;
  const claimed = (n) => Object.hasOwn(state.rewards, `level-${n}`);
  const pending = M.pendingLevelRewards(state);
  const available = lv <= info.lv && !claimed(lv);
  const special = lv % 5 === 0;
  const items = levelRewardItems(lv),unlocks = M.unlocksAt(lv),devices=levelFacilityUnlocks(lv);
  const unlockText = [unlocks.plots ? `新增 ${unlocks.plots} 块田，可多种些喜欢的作物` : "", unlocks.crops.length ? `商店上新：${unlocks.crops.map((k) => M.CROPS[k].name).join("、")}` : ""].filter(Boolean).join(" · ");
  const route = Array.from({ length: 5 }, (_, i) => {
    const n = start + i,ready = n <= info.lv && !claimed(n),device=levelFacilityUnlocks(n)[0];
    const label = claimed(n) ? "已领取" : ready ? "待领取" : "未解锁";
    return `<button class="level-stop ${device ? "facility-unlock" : ""} ${claimed(n) ? "claimed" : ready ? "unclaimed" : "locked"} ${n % 5 === 0 ? "milestone" : ""} ${ready ? "ready" : ""}" data-action="level-select" data-level="${n}" aria-pressed="${n === lv}" aria-label="Lv.${n}${device ? `，设备解锁：${device.name}` : n % 5 === 0 ? ' 里程碑' : ''}，${label}"><strong>Lv.${n}${device ? '<span class="level-device-label">设备</span>' : ""}</strong><span class="level-stop-art" aria-hidden="true">${device?.art || levelRewardItems(n)[0].art}</span><small>${claimed(n) ? "✓ 已领取" : ready ? "待领取" : "未解锁"}</small>${ready ? '<i aria-hidden="true"></i>' : ""}</button>`;
  }).join("");
  const pct = info.next ? Math.min(100, (state.xp - info.at) / (info.next - info.at) * 100) : 100;
  const hero = `<div class="level-hero"><div class="level-medal"><small>Lv.</small><b>${info.lv}</b></div><div class="level-journey"><strong>${info.next ? `下一站 · Lv.${info.lv + 1}` : "庄园满级啦"}</strong><div class="level-xp" role="progressbar" aria-label="本级经验" aria-valuemin="0" aria-valuemax="${info.next ? info.next - info.at : 1}" aria-valuenow="${info.next ? state.xp - info.at : 1}"><i style="width:${pct}%"></i></div><span>${info.next ? `${state.xp - info.at} / ${info.next - info.at} 经验` : "每一次照料，都值得收藏"}</span></div>${pending.length ? `<button class="level-pending" data-action="level-select" data-level="${pending[0]}">待领 ${pending.length} 级<span>去看看 ›</span></button>` : '<span class="level-all-claimed">奖励已收好</span>'}</div>`;
  const status = available ? `<button class="button primary" data-action="level-claim" data-level="${lv}">领取 Lv.${lv} ${special ? "礼包" : "奖励"}</button>` : `<span class="level-claim-state">${claimed(lv) ? "✓ 奖励已领取" : `还差 ${R.levels[lv - 1] - state.xp} 经验解锁`}</span>`;
  showDialog("庄园成长", "每级一份心意，每 5 级一份丰盛礼包。",
  `<div class="level-route-heading"><button data-action="level-select" data-level="${start - 1}" aria-label="前 5 级" ${start === 1 ? "disabled" : ""}><span aria-hidden="true">‹</span></button><strong>Lv.${start} — Lv.${start + 4}</strong><button data-action="level-select" data-level="${start + 5}" aria-label="后 5 级" ${start + 4 === R.levels.length ? "disabled" : ""}><span aria-hidden="true">›</span></button></div><nav class="level-route" aria-label="等级奖励路线">${route}</nav><section class="level-gift ${special ? "milestone" : ""}" aria-label="Lv.${lv} 奖励详情"><div class="level-gift-heading"><h3>Lv.${lv} · ${lv === 1 ? "初见庄园" : devices.length ? "设备解锁" : special ? "里程碑礼包" : "成长补给"}</h3><span>${special ? "额外加赠" : available ? "可以领取啦" : claimed(lv) ? "已领取" : "升级即得"}</span></div><div class="level-gift-items">${devices.map(device=>`<div class="level-gift-item level-facility-unlock"><span class="level-gift-art" aria-hidden="true">${device.art}</span><div><strong>${device.name}<b>Lv.${lv} 解锁</b></strong><p>${device.use}</p></div></div>`).join("")}${items.map((item) => `<div class="level-gift-item"><span class="level-gift-art" aria-hidden="true">${item.art}</span><div><strong>${item.name}<b>× ${item.count}</b></strong><p>${item.use}</p></div></div>`).join("")}</div>${unlockText ? `<p class="level-unlocks">${unlockText}</p>` : ""}${M.LEVEL_REWARDS[lv].fertilizers ? '<p class="level-gift-note">每轮施肥最多缩短一半生长时间。</p>' : ""}</section>`,
  `<button class="button level-achievements" data-action="collections">庄园成就</button><div class="level-reward-actions">${pending.length > 1 ? `<button class="button" data-action="level-claim-all">领取全部 ${pending.length} 级</button>` : ""}${status}${claimed(lv) ? `<button class="button primary" data-action="${M.LEVEL_REWARDS[lv].seeds ? "bag" : M.LEVEL_REWARDS[lv].fertilizers ? "fert" : "fishing"}">去${M.LEVEL_REWARDS[lv].seeds ? "播种" : M.LEVEL_REWARDS[lv].fertilizers ? "施肥" : "钓鱼"}</button>` : ""}</div>`, false, "level-dialog");
  // 进度独立于内容滚动，切换等级不重播弹框入场，也不让标题盖住进度。
  const head = $("#dialog .dialog-head > div");
  head.querySelector(".level-hero")?.remove();
  head.insertAdjacentHTML("beforeend", hero);
  $("#dialog .dialog-body").scrollTop = 0;
  if (Number.isInteger(selected)) $("#dialog .level-stop[aria-pressed='true']")?.focus({ preventScroll: true });
}
function ledgerDialog() {
  const rows = state.ledger.slice().reverse().map((e) => `<li class="ledger-entry ${e.amount > 0 ? "income" : "expense"}"><span class="ledger-mark">${e.amount > 0 ? "+" : "−"}</span><div><strong>${esc(e.text)}</strong><small>第 ${Math.floor(e.at / 24)} 天</small></div><b>${e.amount > 0 ? "+" : ""}${e.amount}</b></li>`).join("");
  showDialog("积分账本", GardenLive.testing ? "测试账本 · 不影响正式积分" : "每一份收获，都记在这里。",
  `<section class="manor-wallet"><span class="wallet-coin">${coinSprite}</span><div><small>${GardenLive.testing ? "测试积分" : "我的积分"}</small><strong>${state.wallet}</strong></div><button class="tile-btn" data-action="shop-tab" data-tab="seeds">去商店</button></section><div class="ledger-heading"><h3>庄园收支</h3><span>${GardenLive.testing ? "独立测试存档" : "与轻笺共用积分"}</span></div>${rows ? `<ol class="manor-ledger">${rows}</ol>` : '<section class="ledger-empty"><span class="ledger-empty-mark">✦</span><h3>账本翻开了新的一页</h3><p>卖出收获、领取奖励和购买物品后，记录会留在这里。</p></section>'}`,
  '<button class="button primary" data-action="close">收好账本</button>', false, "ledger-dialog");
}

function lockToolbar(locked) {
  document.
  querySelectorAll(".prototype-controls button,.prototype-controls select").
  forEach((x) => x.disabled = locked);
}
function advance(hours) {
  if (!M.advance(state, hours)) return;
  closeDialog();
  if (view === "tree") update();else
  render();
  toast(`已模拟到${timeLabel()}`);
}
function applyDensity(relayout = true) {
  const mobile =
  document.documentElement.classList.contains("force-mobile") ||
  innerWidth <= 700 || innerWidth <= 1100 && innerHeight > innerWidth ||
  new URLSearchParams(location.search).get("renderProfile") === "mobile";
  // 庄园是固定比例的游戏画布；轻笺页面继续使用用户保存的桌面密度。
  const d = mobile || view === "tree" ?
  1 :
  { compact: 0.88, standard: 1, comfortable: 1.12 }[
  $("#densitySelect").value];

  const vals = {
    font: 14,
    small: 12,
    space: 16,
    control: 38,
    pad: 24,
    heading: 22,
    large: 32,
    "dialog-width": 760,
    wide: 1100
  };
  if (mobile)
  Object.assign(vals, { pad: 16, space: 14, heading: 20, large: 28 });
  document.documentElement.style.setProperty("--d", d);
  Object.entries(vals).forEach(([k, v]) =>
  document.documentElement.style.setProperty("--" + k, v * d + "px")
  );
  const changed =
  document.documentElement.classList.contains("light-note-mobile-rendering") !== mobile;
  document.documentElement.classList.toggle(
    "light-note-mobile-rendering",
    mobile
  );
  document.documentElement.style.setProperty("--garden-chrome", $(".prototype-lab > summary").getBoundingClientRect().height + 2 + "px");
  if (relayout && changed && view === "tree" && $("#tankSpot")) render();
  requestAnimationFrame(positionFeedback);
}
function init() {
  $(".prototype-lab").addEventListener("toggle", () => requestAnimationFrame(positionFeedback));
  // 只有 Tab 键导航才显示焦点框；按下鼠标或触摸即退出键盘模式
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Tab") document.documentElement.classList.add("kbd-nav");
    },
    true
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      document.documentElement.classList.remove("kbd-nav");
      if (!e.target.closest('#tankProduction,[data-action="tank-manage"],.production-scrim')) closeTankManagement(false);
    },
    true
  );
  document.addEventListener("focusin", (e) => {
    if (!e.target.closest('#tankProduction,[data-action="tank-manage"]')) closeTankManagement(false);
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-action]");
    if (!b || b.disabled) return;
    const a = b.dataset.action;
    // Leaving never waits for a cast, guide or pending command receipt.
    if (a === "exit") { requestManorExit(b); return; }
    if (a === "reset-test") {
      showDialog("重置测试庄园", "Root 流程测试", '<p>从见面礼和首次引导重新开始。测试进度保留在当前标签页，刷新后继续测试；点击“返回正式庄园”恢复正式进度。测试中的购买、出售和奖励不会写入正式积分与资产。</p>', '<button class="button" data-action="close">取消</button>'+ (GardenLive.testing ? '<button class="button" data-action="restore-formal">返回正式庄园</button>' : '') + '<button class="button primary" data-action="confirm-reset-test">重新开始测试</button>');
      return;
    }
    if (a === "confirm-reset-test" || a === "restore-formal") {
      b.disabled = true;
      try { await (a === "restore-formal" ? GardenLive.restoreFormal() : GardenLive.resetTest()); }
      catch { b.disabled = false; toast("暂时无法重置，请稍后重试"); }
      return;
    }
    if (state.casting && a !== "close" && a !== "cast") return;
    if (!["plot", "fert-select", "fert-cancel", "tool-select", "tools-toggle", "tool-cancel"].includes(a)) FarmUI.cancelTool();
    // 引导期间只响应引导里的操作和第 1 块地
    if (state.guide && !["guide-adopt", "plot", "close"].includes(a) && !(state.guide === "plant" && a === "plant-seed")) return;
    switch (a) {
      case "dialog-back":
        backFromDialog();
        break;
      case "close":
        closeDialog();
        break;
      case "rules":
        rulesDialog();
        break;
      case "open-tree":
        view = "tree";
        $("#viewSelect").value = view;
        render();
        break;
      case "guide-skip":
        await GardenLive.dismissGuide(state);
        syncGuide();
        break;
      case "guide-done":
        if (state.discoveryGuide === "observe") {await GardenLive.dismissGuide(state);update();}
        break;
      case "manor-menu":manorMenu();break;
      case "help-tab":
        if (!["plant", "fish", "tank", "facilities", "points", "collection"].includes(b.dataset.tab)) break;
        helpTab = b.dataset.tab;
        if (view === "rules") render();else {rulesDialog();$("#dialog .dialog-body").scrollTop = 0;}
        break;
      case "guide-adopt":{
          const from = b.getBoundingClientRect();
          // 收下见面礼：30 滴水 + 3 颗小萝卜种子，接着引导在第 1 块地播种
          await M.adopt(state);
          state.guide = "plant";
          update();
          GardenFX.flyTo(from, $("#waterCount"), toolSprite("water"), { size: 36 });
          break;
        }
      case "level-claim-all":{
          const levels = await M.claimAllLevelRewards(state);
          update();levelDialog();
          if (levels.length) toast(`收好 ${levels.length} 级奖励 · 种子和肥料已放入背包`);
          break;
        }
      case "collections":collectionDialog();break;
      case "collection-claim":
        if (await M.claimCollection(state, b.dataset.collection, FISH)) {update();collectionDialog();toast("成就已点亮 · 奖励种子已放进背包");}
        break;
      case "level-claim":
        if (await M.claimLevelReward(state, +b.dataset.level)) {
          update();
          levelDialog(+b.dataset.level);
          toast("奖励已收好，可按卡片说明使用");
        }
        break;
      case "level-select":
        levelDialog(+b.dataset.level);
        break;
      case "level":
        levelDialog();
        break;
      case "release":{
          const from = b.getBoundingClientRect();
          const id = +b.dataset.fish;
          const kind = await M.release(state, id, FISH);
          if (kind) {
            if (catchResult?.fish?.id === id) catchResult = null;
            update();
            if (b.dataset.from === "farm") farmDialog();
            GardenFX.flyTo(from, FarmUI.fertilizerTarget(), toolSprite("fertilizer"), { size: 40 });
            toast(`已放生，图鉴记录保留 · +1 份${M.FERT[kind].name}`);
          }
          break;
        }
      case "daily":
        dailyDialog();
        break;
      case "complete-daily":{
          GardenLive.tasks(+b.dataset.index);
          break;
        }
      case "claim-daily-water":{
          const from = b.getBoundingClientRect(),reward = await M.claimDailyWater(state, +b.dataset.index);
          if (reward) {update();dailyDialog();GardenFX.flyTo(from, $("#waterCount"), toolSprite("water"), { size: 36 });toast(`水滴 +${reward.water} · 已装入水桶`);}
          break;
        }
      case "claim-all-daily-water":{
          const from = b.getBoundingClientRect(),reward = await M.claimAllDailyWater(state);
          if (reward) {update();dailyDialog();GardenFX.flyTo(from, $("#waterCount"), toolSprite("water"), { size: 36 });toast(`水滴 +${reward.water}${reward.pending ? ` · 余下 ${reward.pending} 滴今日可继续领取` : " · 已装入水桶"}`);}
          break;
        }
      case "bait":
        try {localStorage.setItem("manor-bait-chest-seen", "1");} catch {}
        $(".bait-chest")?.classList.remove("unseen");
        baitDialog();
        break;
      case "select-bait":
        if (!(await M.selectBait(state, b.dataset.kind))) break;
        try {localStorage.setItem("manor-preferred-bait", state.preferredBait);} catch {}
        update();
        baitDialog();
        toast(`已选${b.dataset.kind === "rainbow" ? "彩虹" : "普通"}鱼饵，下次继续使用`);
        break;
      case "growth-gifts":
        showDialog("稀有种子来源", "连签、每周挑战和庄园里程碑，都能带来新种子。", FarmUI.rewardsHTML(), '<button class="button" data-action="bag">返回背包</button>', false, "daily-dialog");
        break;
      case "cast-bait":
        await cast(null, b.dataset.kind);
        break;
      case "buy-bait":
        FarmUI.purchase("bait", +b.dataset.count, null, "bait");
        break;
      case "fishing":
        focusFishing();
        break;
      case "dismiss-catch":
        catchResult = null;
        updatePond();
        break;
      case "area-garden":
        await navigateManorArea("garden");break;
      case "area-bay":
        await navigateManorArea("bay");break;
      case "cast":
        setManorArea("bay");
        await cast(e);
        break;
      case "tank-manage":
        await toggleTankManagement(b);
        break;
      case "production-tab":
        productionTab = b.dataset.tab === "show" ? "show" : "farm";renderProduction();break;
      case "fill-residents":{
          const placed = await M.fillEmptySlots(state, FISH);
          update();
          farmDialog();
          toast(placed.length ? `${placed.length} 位新朋友已入住 · 已有住客照常积累` : "没有可安排的空位，已有住客保持原位");
          break;
        }
      case "farm":
        farmDialog();
        break;
      case "production-close":
        closeTankManagement();
        break;
      case "collect":{
          const from = b.getBoundingClientRect();
          const before = { ...state.fertilizers };
          const n = b.dataset.slot === undefined ? await M.collect(state, FISH) : await M.collectSlot(state, +b.dataset.slot, FISH);
          if (n) {
            update();
            if (b.dataset.from === "farm") farmDialog();
            let flight = 0;
            for (const [kind, total] of Object.entries(state.fertilizers)) {
              for (let i = 0; i < total - before[kind]; i++) GardenFX.flyTo(from, FarmUI.fertilizerTarget(), fertilizerArt(kind), { size: 36, delay: flight++ * 100 });
            }
            toast(`收肥 +${n} · 已放入背包`);
            announce(`收集了 ${n} 份催熟肥`);
          }
          break;
        }
      case "choose":
        chooseDialog(+b.dataset.slot);
        break;
      case "choose-show":
        chooseDialog(+b.dataset.slot, null, "show");
        break;
      case "assign-show":{
          const index = state.showSlots.findIndex((x) => !x);
          if (index < 0) chooseDialog(null, +b.dataset.fish, "show");else
          if (await M.placeShow(state, +b.dataset.fish, index, FISH)) {
            update();
            toast(`住进了${tankLabel()}的观赏位`);
            farmDialog();
          }
          break;
        }
      case "place-show":
        await placeResident(+b.dataset.fish, +b.dataset.slot, "show");
        break;
      case "place-confirm":{
          const p = pendingPlacement;pendingPlacement = null;
          if (!p || p.session !== state || !$("#dialog").classList.contains("resident-dialog")) break;
          const slots = p.area === "show" ? state.showSlots : state.fishSlots;
          if (slots[p.index]?.fishId !== p.previous) {farmDialog();toast("住客已变化，请重新选择");break;}
          await placeResident(p.id, p.index, p.area, true);
          break;
        }
      case "unplace":
        if (await M.unplace(state, +b.dataset.fish, FISH)) {
          update();
          farmDialog();
          toast("已收回待养区");
        }
        break;
      case "sell-confirm":
        await doSell(+b.dataset.fish, b.getBoundingClientRect(), b.dataset.from === "shop" ? "shop" : b.dataset.from === "farm");
        break;
      case "sell":
        await sellFlow(+b.dataset.fish, b.getBoundingClientRect(), b.dataset.from === "shop" ? "shop" : b.dataset.from === "farm");
        break;
      case "assign":{
          const index = state.fishSlots.findIndex((x) => !x);
          if (index < 0) chooseDialog(null, +b.dataset.fish);else
          if (await M.place(state, +b.dataset.fish, index, FISH)) {
            catchResult = null;
            update();
            toast(`鱼儿已入住${tankLabel()}`);
            farmDialog();
          }
          break;
        }
      case "place":
        await placeResident(+b.dataset.fish, +b.dataset.slot);
        break;
      case "wildlife-detail":
        wildlifeDetail(b.dataset.kind);break;
      case "atlas":
        atlasDialog();
        break;
      case "atlas-filter":
        atlasFilter = b.dataset.kind;
        atlasDialog();
        break;
      case "fish-detail":
        fishDetail(b.dataset.kind, b.dataset.from);
        if (b.dataset.atlasEntry === "fish") void readAtlasEntry("fish", b.dataset.kind);
        break;
      case "stored-filter":
        storedFilter = b.dataset.kind;
        farmDialog();
        break;
      case "memories":
        memoriesDialog();
        break;
      case "enter-garden":{
          view = "tree";
          $("#viewSelect").value = view;
          render();
          break;
        }
      case "ledger":
        ledgerDialog();
        break;
      default:
        if (!(await FarmFacilities.handle(a, b))) await FarmUI.handle(a, b);
    }
  });
  $("#modal").addEventListener("click", (e) => {
    if (e.target === $("#modal")) backFromDialog();
  });
  document.addEventListener("keydown", (e) => {
    if ($("#modal").hidden) {
      if (e.key === "Escape") {
        document.documentElement.classList.remove("kbd-nav");
        if ($("#tankProduction") && !$("#tankProduction").hidden) {e.preventDefault();closeTankManagement();} else
        FarmUI.cancelTool(true);
      }
      if (e.target.matches('.production-tabs [role="tab"]') && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        productionTab = e.key === "Home" ? "farm" : e.key === "End" ? "show" : productionTab === "farm" ? "show" : "farm";
        renderProduction();
        $(`.production-tabs [data-tab="${productionTab}"]`).focus({ preventScroll: true });
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();e.stopPropagation();
      document.documentElement.classList.remove("kbd-nav");
      backFromDialog(true);
    }
    if (e.key === "Tab") {
      const items = [
      ...$("#dialog").querySelectorAll(
        'button:not(:disabled),input,select,[tabindex="0"]'
      )];

      if (!items.length) {
        e.preventDefault();
        return;
      }
      const index = items.indexOf(document.activeElement);
      if (e.shiftKey && index <= 0) {
        e.preventDefault();
        items.at(-1).focus();
      } else if (!e.shiftKey && index === items.length - 1) {
        e.preventDefault();
        items[0].focus();
      }
    }
  });
  // 演示选项来自真实图鉴，避免新品种只能看图、无法体验钓获或动作。
  $("#castResult").innerHTML = '<option value="random">随机</option><option value="empty">演示空竿</option>' +
  [false, true].map((creature) => `<optgroup label="${creature ? "观赏水族" : "鱼类"}">${Object.entries(FISH).
  filter(([, f]) => f.group === "creature" === creature).
  map(([k, f]) => `<option value="${esc(k)}">${esc(f.name)} · ${esc(f.quality)}</option>`).join("")}</optgroup>`).join("");
  const previewCreatures = Object.keys(FISH).filter((k) => FISH[k].group === "creature");
  const longBodyPreview = document.createElement("option");
  longBodyPreview.value = "serpentine";
  longBodyPreview.textContent = "长身游动 · 电鳗 / 皇带鱼";
  $("#sceneSelect").append(longBodyPreview);
  ["新水族 · 溪流与甲壳", "新水族 · 海洋与漂游"].forEach((label, i) => {const option = document.createElement("option");option.value = `newlife-${i}`;option.textContent = label;$("#sceneSelect").append(option);});
  for (let i = 0; i < Math.ceil(previewCreatures.length / 3); i++) {
    const option = document.createElement("option");
    option.value = `motion-${i}`;
    option.textContent = `动作 ${i + 1} · ${previewCreatures.slice(i * 3, i * 3 + 3).map((k) => FISH[k].name).join(" / ")}`;
    $("#sceneSelect").append(option);
  }
  $("#sceneSelect").value = scene;
  $("#sceneSelect").addEventListener("change", (e) => {
    FishingInput.stop();
    scene = e.target.value;
    const rememberedBait = state.preferredBait;
    state = M.create(scene, FISH);
    FarmStage.setArea("garden");
    state.preferredBait = rememberedBait;
    FishMotion.forget();
    catchResult = null;
    fishingPhase = "idle";
    atlasFilter = "all";
    atlasPositions.clear();
    render();
  });
  $("#viewSelect").addEventListener("change", (e) => {
    FishingInput.stop();
    view = e.target.value;
    render();
  });
  $("#themeToggle").addEventListener("click", () => {
    userTheme = userTheme === "dark" ? "light" : "dark";
    syncShell();
  });
  $("#deviceToggle").addEventListener("click", () => {
    const on = document.documentElement.classList.toggle("force-mobile");
    $("#shell").classList.toggle("mobile-preview", on);
    $("#deviceToggle").textContent = on ? "桌面预览" : "手机预览";
    applyDensity();
  });
  $("#densitySelect").addEventListener("change", () => applyDensity());
  $("#timeAdvance").addEventListener("click", () => advance(6));
  $("#dayAdvance").addEventListener("click", () => advance(24));
  $("#reset").addEventListener("click", () => {
    FishingInput.stop();
    const rememberedBait = state.preferredBait;
    state = M.create(scene, FISH);
    FarmStage.setArea("garden");
    state.preferredBait = rememberedBait;
    FishMotion.forget();
    catchResult = null;
    fishingPhase = "idle";
    $("#castResult").value = "random";
    atlasFilter = "all";
    atlasPositions.clear();
    render();
    toast("已恢复当前场景的示例数据");
  });
  window.addEventListener("resize", () => {applyDensity();requestAnimationFrame(positionDiscoveryGuide);});
  applyDensity();
  render();
  let tick = Date.now();
  setInterval(() => {
    const now = Date.now(),
      hours = (now - tick) / 3600000;
    if (state.casting) return;
    tick = now;
    M.advance(state, hours);
    if (document.hidden || view !== "tree") return;
    if ($(".garden-scene").dataset.resources !== [M.day(state), farmReady(), state.freeUsed, FarmUI.stateKey()].join("|")) update();else
    refreshClocks();
  }, 1000);
}
init();
if(typeof GardenStartup!=='undefined'){GardenStartup.mounted();GardenStartup.ready();}
