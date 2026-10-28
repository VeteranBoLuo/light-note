/* Knowledge Manor deterministic rules and user-approved crop catalog.
   Existing crop prices, growth cycles and the shared points currency are preserved.
   Time, random outcomes and mutations are authorised by the server command boundary. */
const GardenModel = (() => {
  const RULES = Object.freeze({
    // 三项任务每天共 15 滴；海水过滤器随等级另产 6 / 8 / 10 滴。每块地浇水 5 滴。
    dailyWater: 5,
    waterCap: 60,
    purifierCost: 240,
    purifierWater: 6,
    purifierLevels: Object.freeze([
      Object.freeze({level:1, gardenLevel:8, cost:240, water:6, materials:Object.freeze({})}),
      Object.freeze({level:2, gardenLevel:12, cost:180, water:8, material:Object.freeze({quality:"常见", count:4})}),
      Object.freeze({level:3, gardenLevel:18, cost:360, water:10, material:Object.freeze({quality:"稀有", count:2})}),
    ]),
    plantWater: 5,
    plotCount: 8,
    // Lv1..Lv30；Lv(n+1)→Lv(n+2) 需 60 + 20n + 3n²，逐级递增。
    // 累计 Lv10=1872、Lv20=10887、Lv30=33002；不靠购买、浇水或铲除刷经验。
    levels: Object.freeze(Array.from({ length: 30 }, (_, n) => 60 * n + 10 * n * (n - 1) + n * (n - 1) * (2 * n - 1) / 2)),
    plotsAt: Object.freeze({ 1: 4, 2: 5, 4: 6, 7: 7, 18: 8 }),
    firstCropXp: 20,
    firstFishXp: 10,
    // 每株作物累计施肥加速不超过当前这一轮生长时长的一半
    accelShare: 0.5,
    baitCost: 8,
    baitBundleCount: 10,
    baitBundlePrice: 76,
    // 淡水鱼苗袋必得一位生物，定价高于一次海钓；每天最多 2 袋。
    fryPrice: 24,
    fryDaily: 2,
    dailyFree: 3,
    // 新用户仅首次固定一尾基础产肥鱼；此后基础成功率 25%，连续空四竿后第五竿必得。
    firstFish: "clown",
    success: 0.25,
    pityCasts: 5,
    // 产肥位 6 个，每尾 48 小时产 1 份，最多存 4 份
    farmSlots: 6,
    productionHours: 48,
    storageLimit: 4,
    showSlots: 3,
    // 卖出价（积分）：按稀有度；不产肥的其他水族 ×1.5
    sellPrice: Object.freeze({ 常见: 2, 稀有: 5, 珍稀: 12, 传说: 30 }),
    // 上钩后各稀有度的占比：越珍稀越难遇到
    rarityOdds: Object.freeze({ 常见: 0.7, 稀有: 0.22, 珍稀: 0.07, 传说: 0.01 }),
    creatureSellRate: 1.5,
    buybackHours: 24,
    buybackLimit: 10,
    buybackFeePercent: 10,
  });
  // 作物：type once 单次收获 / multi 连续结果 / flower 观赏；first 首次成熟（小时），every 之后每轮间隔；
  // harvests 可收获次数（观赏花为可剪的束数）；price 种子价（null 不可购买）；sell 每份卖价（null 不可出售）
  const CROPS = Object.freeze({
    radish: { name: "小萝卜", tier: "basic", type: "once", first: 4, every: 0, harvests: 1, price: 2, sell: 3, xp: 8, unlock: 1 },
    tomato: { name: "小番茄", tier: "basic", type: "multi", first: 10, every: 6, harvests: 3, price: 4, sell: 2, xp: 5, unlock: 1 },
    carrot: { name: "胡萝卜", tier: "basic", type: "once", first: 12, every: 0, harvests: 1, price: 3, sell: 5, xp: 12, unlock: 1 },
    corn: { name: "玉米", tier: "basic", type: "once", first: 48, every: 0, harvests: 1, price: 4, sell: 6, xp: 15, unlock: 2, bait: "bait" },
    strawberry: { name: "草莓", tier: "advanced", type: "multi", first: 24, every: 12, harvests: 4, price: 10, sell: 4, xp: 9, unlock: 4 },
    lavender: { name: "薰衣草", tier: "advanced", type: "flower", first: 36, every: 24, harvests: 3, price: 6, sell: 3, xp: 10, unlock: 6 },
    pumpkin: { name: "南瓜", tier: "advanced", type: "once", first: 48, every: 0, harvests: 1, price: 8, sell: 14, xp: 40, unlock: 8 },
    lettuce: { name: "生菜", tier: "basic", type: "once", first: 6, every: 0, harvests: 1, price: 3, sell: 4, xp: 10, unlock: 2 },
    eggplant: { name: "茄子", tier: "advanced", type: "multi", first: 18, every: 16, harvests: 3, price: 9, sell: 5, xp: 10, unlock: 5 },
    sunflower: { name: "向日葵", tier: "advanced", type: "flower", first: 30, every: 18, harvests: 2, price: 12, sell: 9, xp: 18, unlock: 7 },
    pepper: { name: "彩椒", tier: "advanced", type: "multi", first: 28, every: 16, harvests: 4, price: 16, sell: 6, xp: 16, unlock: 10 },
    blueberry: { name: "蓝莓", tier: "advanced", type: "multi", first: 48, every: 24, harvests: 5, price: 24, sell: 8, xp: 18, unlock: 12 },
    pea: { name: "豌豆", tier: "basic", type: "once", first: 8, every: 0, harvests: 1, price: 4, sell: 6, xp: 12, unlock: 3 },
    potato: { name: "土豆", tier: "advanced", type: "once", first: 20, every: 0, harvests: 1, price: 6, sell: 9, xp: 18, unlock: 5 },
    cucumber: { name: "黄瓜", tier: "advanced", type: "multi", first: 16, every: 12, harvests: 4, price: 10, sell: 4, xp: 8, unlock: 7 },
    rosemary: { name: "迷迭香", tier: "advanced", type: "flower", first: 24, every: 24, harvests: 3, price: 8, sell: 4, xp: 10, unlock: 9 },
    watermelon: { name: "西瓜", tier: "advanced", type: "once", first: 36, every: 0, harvests: 1, price: 10, sell: 15, xp: 36, unlock: 11 },
    grape: { name: "葡萄", tier: "advanced", type: "multi", first: 40, every: 20, harvests: 4, price: 20, sell: 8, xp: 18, unlock: 16 },
    tea: { name: "茶树", tier: "advanced", type: "multi", typeLabel: "连续采摘", first: 60, every: 36, harvests: 4, price: 22, sell: 10, xp: 22, unlock: 20 },
    rainbowcorn: { name: "彩虹玉米", tier: "rare", type: "once", first: 24, every: 0, harvests: 1, price: null, sell: 20, xp: 60, unlock: 1, bait: "rainbowBait" },
    starpumpkin: { name: "星光南瓜", tier: "rare", type: "once", first: 48, every: 0, harvests: 1, price: null, sell: 40, xp: 120, unlock: 1 },
    moonorchid: { name: "月光兰", tier: "rare", type: "flower", first: 72, every: 48, harvests: 3, price: null, sell: 30, xp: 150, fertilizer: "legend", unlock: 1 },
  });
  const RARE = Object.keys(CROPS).filter((k) => CROPS[k].tier === "rare");
  const FERT = {
    rabbit: { name: "兔子便便肥", hours: 0.5 },
    eco: { name: "生态催熟肥", hours: 1 },
    nourish: { name: "滋养催熟肥", hours: 2 },
    fertile: { name: "丰沃催熟肥", hours: 3 },
    legend: { name: "星辉催熟肥", hours: 4 },
  };
  const FACILITIES = Object.freeze({
    workshop: Object.freeze({name:"诱饵工坊", cost:180, gardenLevel:6}),
    beehive: Object.freeze({name:"花园蜂箱", cost:160, gardenLevel:6}),
    composter: Object.freeze({name:"堆肥箱", cost:120, gardenLevel:9}),
  });
  const COMPOST_LEVELS = Object.freeze([
    Object.freeze({gardenLevel:FACILITIES.composter.gardenLevel,cost:FACILITIES.composter.cost,hours:12,storage:2,fertilizer:"eco"}),
    Object.freeze({gardenLevel:14,cost:180,hours:12,storage:2,fertilizer:"nourish"}),
    Object.freeze({gardenLevel:20,cost:360,hours:12,storage:2,fertilizer:"fertile"}),
  ]);
  const COMPOST_RULES = Object.freeze({residuePerBatch:3,hours:COMPOST_LEVELS[0].hours,storage:COMPOST_LEVELS[0].storage,levels:COMPOST_LEVELS});
  const BAIT_RECIPES = Object.freeze({
    fruit: Object.freeze({name:"果香引鱼饵", crop:"tomato", preference:"海水鱼类"}),
    herb: Object.freeze({name:"草木觅贝饵", crop:"lettuce", preference:"海水底栖水族"}),
  });
  const FACILITY_RULES = Object.freeze({craftHours:2, craftMax:3, targetWeight:4, pollenCapacity:6,
    flowerPollen:Object.freeze({lavender:3, sunflower:6, rosemary:4}),
    pollinationCrops:Object.freeze(["tomato","strawberry","eggplant","pepper","blueberry","cucumber","grape"])});
  // 每级一次补给，每 5 级加赠里程碑礼包；Lv.1 就是见面礼，不重复发放。
  // 领取不加经验，施肥仍受半轮加速上限约束。
  const LEVEL_REWARDS = Object.freeze({
    1: { seeds: { radish: 3 }, water: 30 },
    2: { seeds: { corn: 1 } },
    3: { seeds: { corn: 2 } },
    4: { seeds: { strawberry: 1 } },
    5: { seeds: { strawberry: 2 }, fertilizers: { eco: 2 }, bait: 1 },
    6: { seeds: { lavender: 1 } },
    7: { fertilizers: { eco: 1 } },
    8: { seeds: { pumpkin: 1 } },
    9: { fertilizers: { nourish: 2 } },
    10: { seeds: { rainbowcorn: 1 }, fertilizers: { nourish: 2 }, bait: 2 },
    11: { seeds: { tomato: 2 } },
    12: { fertilizers: { fertile: 2 } },
    13: { seeds: { strawberry: 2 } },
    14: { bait: 2 },
    15: { seeds: { rainbowcorn: 2 }, fertilizers: { fertile: 2 }, bait: 2 },
    16: { seeds: { pumpkin: 2 } },
    17: { fertilizers: { nourish: 2 } },
    18: { seeds: { starpumpkin: 1 } },
    19: { bait: 2 },
    20: { seeds: { starpumpkin: 2 }, fertilizers: { fertile: 3 }, bait: 3 },
    21: { seeds: { lavender: 2 } },
    22: { fertilizers: { fertile: 2 } },
    23: { seeds: { rainbowcorn: 1 } },
    24: { fertilizers: { nourish: 2 } },
    25: { seeds: { moonorchid: 1 }, fertilizers: { legend: 2 }, bait: 3 },
    26: { seeds: { pumpkin: 2 } },
    27: { fertilizers: { fertile: 2 } },
    28: { seeds: { starpumpkin: 1 } },
    29: { fertilizers: { legend: 2 } },
    30: { seeds: { moonorchid: 2 }, fertilizers: { legend: 4 }, rainbowBait: 1 },
  });
  function claimLevelReward(s, lv) {
    const reward = LEVEL_REWARDS[lv], id = `level-${lv}`;
    if (!s.adopted || !Number.isInteger(lv) || !reward || level(s) < lv || Object.hasOwn(s.rewards, id)) return false;
    for (const [key, n] of Object.entries(reward.seeds || {})) s.seeds[key] = (s.seeds[key] || 0) + n;
    for (const [key, n] of Object.entries(reward.fertilizers || {})) s.fertilizers[key] = (s.fertilizers[key] || 0) + n;
    s.bait += reward.bait || 0;
    s.rainbowBait += reward.rainbowBait || 0;
    s.water = Math.min(RULES.waterCap, s.water + (reward.water || 0));
    s.rewards[id] = s.now;
    diary(s, `领取 Lv.${lv} 成长奖励`);
    return reward;
  }
  const pendingLevelRewards = s => Object.keys(LEVEL_REWARDS).map(Number).filter(lv => s.adopted && lv <= level(s) && !Object.hasOwn(s.rewards, `level-${lv}`));
  function claimAllLevelRewards(s) {
    return pendingLevelRewards(s).filter(lv => claimLevelReward(s, lv));
  }
  // 收藏路线只奖励一次，不发积分或经验；纪念称号只留在成就中，不改变等级栏。
  const COLLECTIONS = Object.freeze({
    harvest: { name: "五色菜园", title: "田园新手", level: 6, target: 5, type: "crop", seed: "lavender", count: 1 },
    coast: { name: "海岸来客", title: "海岸收藏家", level: 12, target: 12, type: "sea", seed: "rainbowcorn", count: 1 },
    freshwater: { name: "溪流之友", title: "溪流守望者", level: 18, target: 12, type: "fresh", seed: "starpumpkin", count: 1 },
    fishbook: { name: "百川鱼友", title: "鱼类收藏家", level: 1, target: 60, type: "fish", seed: "starpumpkin", count: 2 },
    creaturebook: { name: "水下奇遇", title: "水族博物学家", level: 1, target: 33, type: "creature", seed: "rainbowcorn", count: 2 },
    cropbook: { name: "四季满园", title: "四季园艺师", level: 1, target: 10, type: "allcrop", seed: "moonorchid", count: 2 },
    completebook: { name: "庄园万物志", title: "万物收藏家", level: 1, target: 103, type: "all", seed: "moonorchid", count: 3 },
    raregarden: { name: "月光庄园", title: "月光园艺师", level: 24, target: 3, type: "rare", seed: "moonorchid", count: 1 },
  });
  function collectionProgress(s, key, catalog) {
    const c = COLLECTIONS[key];
    if (!c) return null;
    // 全图鉴目标跟随真实目录扩充；已领取的成就保留，不重新发奖。
    const crops = Object.keys(s.cropDex).filter(k => CROPS[k]);
    const aquatic = Object.keys(s.discoveries).filter(k => catalog[k]);
    const kinds = c.type === "all" ? [...crops, ...aquatic]
      : ["crop", "allcrop", "rare"].includes(c.type) ? crops.filter(k => c.type !== "rare" || CROPS[k].tier === "rare")
      : aquatic.filter(k => c.type === "fish" ? !!catalog[k].fertilizer : c.type === "creature" ? catalog[k].group === "creature" : catalog[k].water === c.type);
    const target=key==="fishbook"?Object.values(catalog).filter(f=>f.fertilizer).length
      :key==="creaturebook"?Object.values(catalog).filter(f=>f.group==="creature").length
      :key==="cropbook"?Object.keys(CROPS).length
      :key==="completebook"?Object.keys(catalog).length+Object.keys(CROPS).length:c.target;
    return { count: Math.min(target, kinds.length), target, unlocked: level(s) >= c.level, claimed: Object.hasOwn(s.rewards, `collection-${key}`) };
  }
  function claimCollection(s, key, catalog) {
    const p = collectionProgress(s, key, catalog), c = COLLECTIONS[key];
    if (!s.adopted || !p || !p.unlocked || p.claimed || p.count < p.target) return false;
    grantSeed(s, c.seed, c.count, `collection-${key}`);
    diary(s, `完成「${c.name}」，留下「${c.title}」纪念，奖励种子已收好`);
    return true;
  }
  const day = (s) => Number.isInteger(s.calendarDay) ? s.calendarDay : Math.floor(s.now / 24);
  const week = (s) => Math.floor(day(s) / 7);
  function levelInfo(xp) {
    const L = RULES.levels;
    let lv = 1;
    while (lv < L.length && xp >= L[lv]) lv++;
    return { lv, at: L[lv - 1], next: lv < L.length ? L[lv] : null };
  }
  const level = (s) => levelInfo(s.xp).lv;
  const plotsOpen = (lv) => Math.max(...Object.entries(RULES.plotsAt).filter(([k]) => lv >= +k).map(([, v]) => v));
  // 某个等级会解锁什么：地块、商店种子与设施建造/升级资格。
  function unlocksAt(lv) {
    const prev = lv > 1 ? plotsOpen(lv - 1) : 0;
    const facilities=Object.values(FACILITIES).filter(f=>f.gardenLevel===lv).map(f=>f.name);
    RULES.purifierLevels.filter(t=>t.gardenLevel===lv).forEach(t=>facilities.push(t.level===1?"海水过滤器":`海水过滤器 Lv.${t.level} 升级`));
    return { plots: plotsOpen(lv) - prev, crops: Object.keys(CROPS).filter((k) => CROPS[k].price !== null && CROPS[k].unlock === lv), facilities };
  }
  const emptyPlot = (lastCrop = null) => ({ crop: null, planted: null, watered: null, accel: 0, done: 0, next: null, lastCrop,
    pollinated:false, pollinationPending:false });

  // ---------- 地块 ----------
  function plotState(s, i) {
    const p = s.plots[i];
    if (!Number.isInteger(i) || i < 0 || !p || i >= plotsOpen(level(s))) return "locked";
    if (!p.crop) return "empty";
    if (p.watered === null) return "dry";
    const c = CROPS[p.crop];
    if (s.now < p.next) return "growing";
    // 观赏花开好以后：还有能剪的束（或第一次赏花）就是 ripe，否则一直盛开
    if (c.type === "flower" && p.done >= c.harvests) return "bloom";
    return "ripe";
  }
  // 这一轮生长的总时长（小时）
  const cycle = (s, p) => (p.done ? CROPS[p.crop].every : CROPS[p.crop].first);
  function remaining(s, i) {
    const p = s.plots[i];
    if (!p.crop || p.watered === null) return null;
    return Math.max(0, p.next - s.now);
  }
  // 生长阶段：0 播种 1 发芽 2 幼苗 3 开花/结果 4 成熟。浇水后先是湿润的播种土包，按这一轮的生长进度依次长到下一阶段，
  // STAGE_AT 是各阶段开始时的进度；连续结果作物摘过以后停在 3 重新结果，观赏花开过一次以后一直盛开
  const STAGE_AT = [0, 0.15, 0.4, 0.7];
  function growthStage(s, i) {
    const st = plotState(s, i),
      p = s.plots[i];
    if (st === "empty" || st === "locked") return -1;
    if (st === "dry") return 0;
    if (st === "ripe" || st === "bloom") return 4;
    if (CROPS[p.crop].type === "flower" && p.done) return 4;
    if (p.done) return 3;
    const done = progress(s, i);
    let k = 0;
    STAGE_AT.forEach((at, j) => {
      if (done >= at) k = j;
    });
    return k;
  }
  // 这一轮各阶段开始的时刻（第 0–3 阶段）与成熟时刻；施肥提前 next 后整体跟着提前。未浇水时为 null
  function stageTimes(s, i) {
    const p = s.plots[i];
    if (!p.crop || p.watered === null) return null;
    const total = cycle(s, p);
    return [...STAGE_AT.map((at) => p.next - total * (1 - at)), p.next];
  }
  function progress(s, i) {
    const p = s.plots[i];
    if (!p.crop || p.watered === null) return 0;
    return Math.min(1, Math.max(0, 1 - (p.next - s.now) / cycle(s, p)));
  }
  function plant(s, i, key) {
    if (plotState(s, i) !== "empty" || !CROPS[key] || !(s.seeds[key] > 0)) return false;
    s.seeds[key]--;
    Object.assign(s.plots[i], emptyPlot(), { crop: key, planted: s.now });
    return true;
  }
  // 选种建议只整理已有种子，不购买、不增产；续种仍需正常消耗种子和浇水。
  function seedChoices(s, filter = "all") {
    return Object.keys(CROPS).filter(key => s.seeds[key] > 0 &&
      (filter === "new" ? !s.cropDex[key] : filter === "bait" ? !!CROPS[key].bait : true))
      .sort((a, b) => CROPS[a].first - CROPS[b].first);
  }
  function replantSeed(s, i) {
    if (plotState(s, i) !== "empty") return null;
    const key = s.plots[i].lastCrop;
    return CROPS[key] && s.seeds[key] > 0 ? key : null;
  }
  // 浇水：播下的种子要浇一次水才开始长；水不够的地保持待浇水，不损失种子
  function water(s, indices) {
    const done = [];
    for (const i of indices) {
      if (plotState(s, i) !== "dry" || s.water < RULES.plantWater) continue;
      const p = s.plots[i];
      s.water -= RULES.plantWater;
      p.watered = s.now;
      p.next = s.now + CROPS[p.crop].first;
      done.push(i);
    }
    // 第一次成功浇水解除操作锁；首钓与入住只保留可跳过提示。
    if (s.guide === "water" && done.includes(0)) { s.guide = null; s.discoveryGuide = "fish"; }
    return done;
  }
  function discoverCrop(s, key) {
    const first = !s.cropDex[key];
    s.cropDex[key] ??= { first: day(s), count: 0 };
    s.cropDex[key].count++;
    if (first) (s.atlasUnread ??= {})[`crop:${key}`] = true;
    return first;
  }
  // 收获物进仓库；月光兰每轮另产一份星辉肥。剪完花仍留在田中，不能重复领取。
  function harvest(s, indices) {
    const out = [];
    for (const i of indices) {
      if (plotState(s, i) !== "ripe") continue;
      const p = s.plots[i],
        key = p.crop,
        c = CROPS[key];
      const first = discoverCrop(s, key);
      const xp = c.xp + (first ? RULES.firstCropXp : 0);
      s.xp += xp;
      const item = c.sell !== null || c.bait;
      const bonus = item && p.pollinationPending && c.type === "multi" ? 1 : 0;
      if (item) s.crops[key] = (s.crops[key] || 0) + 1 + bonus;
      if (c.fertilizer) s.fertilizers[c.fertilizer] = (s.fertilizers[c.fertilizer] || 0) + 1;
      // 只结算下次收获的加成，已授粉标记留在这株作物上，后续轮次不能再授粉。
      p.pollinationPending = false;
      p.done++;
      if (p.done === c.harvests && s.composter) {
        // Settle earlier batches before adding a new residue: it cannot fuel past production.
        const compost=composterProjection(s);
        if (Number.isSafeInteger(compost.residue+1)) {
          compost.residue++;s.composter=compost;s.composter=composterProjection(s);
        }
      }
      if (c.type === "once") Object.assign(p, emptyPlot(key));
      else if (p.done < c.harvests) {
        p.next = s.now + c.every;
        p.accel = 0;
      } else if (c.type === "multi") Object.assign(p, emptyPlot(key));
      if (first) diary(s, `第一次收获「${c.name}」`);
      out.push({ i, key, xp, item: !!item, first, quantity:item?1+bonus:0, bonus, fertilizer:c.fertilizer||null });
    }
    return out;
  }
  // 施肥：缩短这一轮剩余的生长时间；每株累计加速不超过这一轮时长的一半，成熟的地不消耗肥料
  function fertilize(s, i, kind) {
    const fert = FERT[kind];
    if (!fert || !(s.fertilizers[kind] > 0) || plotState(s, i) !== "growing") return 0;
    const p = s.plots[i];
    const room = cycle(s, p) * RULES.accelShare - p.accel;
    const gain = Math.min(fert.hours, room, p.next - s.now);
    if (gain <= 1e-9) return 0;
    p.accel += gain;
    p.next -= gain;
    s.fertilizers[kind]--;
    return gain;
  }
  function remove(s, i) {
    if (!s.plots[i]?.crop || i >= plotsOpen(level(s))) return false;
    Object.assign(s.plots[i], emptyPlot());
    return true;
  }
  // 兔子每天留下一份便便，拾取后是最低一档的催熟肥；不拾取就留着，不会累积第二份
  const poopReady = (s) => s.adopted && s.poopDay !== day(s);
  function pickPoop(s) {
    if (!poopReady(s)) return false;
    s.poopDay = day(s);
    s.fertilizers.rabbit++;
    return true;
  }

  // ---------- 种子、仓库与积分 ----------
  // 周收支仅用于统计。合法库存可随时出售，产出由水滴、地块和服务端生长周期控制。
  function spend(s, cost, text) {
    s.wallet -= cost;
    s.weekSpent += cost;
    record(s, text, -cost);
  }
  function earn(s, amount, text) {
    s.wallet += amount;
    s.weekEarned += amount;
    record(s, text, amount);
  }
  const buyable = (s, key) => CROPS[key]?.price != null && level(s) >= CROPS[key].unlock;
  function buySeed(s, key, n = 1) {
    if (!buyable(s, key) || !Number.isInteger(n) || n < 1 || n > 10) return false;
    const cost = CROPS[key].price * n;
    if (s.wallet < cost) return false;
    spend(s, cost, `购买${CROPS[key].name}种子 × ${n}`);
    s.seeds[key] = (s.seeds[key] || 0) + n;
    return true;
  }
  // 奖励发放的种子（稀有种子只能这样获得）；reason 用于幂等，同一个奖励只发一次
  function grantSeed(s, key, n, reason) {
    if (!CROPS[key] || !Number.isSafeInteger(n) || n < 1 || (reason && Object.hasOwn(s.rewards, reason))) return false;
    if (reason) s.rewards[reason] = s.now;
    s.seeds[key] = (s.seeds[key] || 0) + n;
    return true;
  }
  // 只按真实库存卖整份，报价不改状态；出售后扣除库存，重复请求不能出售已扣除的份数。
  function quoteCropSale(s, key, n = 1) {
    const c = CROPS[key];
    const stock = s.crops[key] || 0;
    const empty = { sold: 0, points: 0, left: stock };
    if (!c || c.sell === null || !Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(stock) || stock < 1) return empty;
    const sold = Math.min(n, stock), points = sold * c.sell;
    if (![points, s.wallet + points, s.weekEarned + points].every(Number.isSafeInteger)) return empty;
    return { sold, points, left: stock - sold };
  }
  function sellCrop(s, key, n) {
    const result = quoteCropSale(s, key, n ?? s.crops[key]);
    const { sold, points } = result;
    if (!sold) return result;
    s.crops[key] -= sold;
    earn(s, points, `卖出${CROPS[key].name} × ${sold}`);
    return result;
  }
  function sellAllCrops(s) {
    let sold = 0, points = 0;
    for (const key of Object.keys(s.crops)) {
      if (!s.crops[key] || !CROPS[key] || CROPS[key].sell === null) continue;
      const r = sellCrop(s, key);
      sold += r.sold;
      points += r.points;
    }
    return { sold, points };
  }
  // 玉米换鱼饵；彩虹玉米换彩虹鱼饵（下一竿必定上钩，不改变稀有度）
  function convertBait(s, key, count = 1) {
    const to = CROPS[key]?.bait;
    if (!s.adopted || s.casting || !to || !Number.isSafeInteger(count) || count < 1 ||
      !Number.isSafeInteger(s.crops[key]) || s.crops[key] < count ||
      !Number.isSafeInteger(s[to]) || !Number.isSafeInteger(s[to] + count)) return null;
    s.crops[key] -= count;
    s[to] += count;
    return to;
  }
  function record(s, text, amount) {
    s.ledger.push({ text, amount, at: s.now });
    if (s.ledger.length > 60) s.ledger.shift();
  }
  function diary(s, text) {
    s.memories.push({ text, day: day(s) });
    s.memories = s.memories.slice(-30);
  }

  // 麻雀每天只带回一颗最基础的商店种子；错过的天数不累积，不直接奖励经验/积分。
  const birdCanDeliver = s => s.adopted && !s.guide && s.birdSeedDay !== day(s);
  const birdSeedReady = s => s.birdSeedDay === day(s) && s.birdSeedPickedDay !== day(s);
  function deliverBirdSeed(s) {
    if (!birdCanDeliver(s)) return false;
    s.birdSeedDay = day(s);
    return true;
  }
  function pickBirdSeed(s) {
    if (!birdSeedReady(s)) return false;
    s.birdSeedPickedDay = day(s);
    s.seeds.radish = (s.seeds.radish || 0) + 1;
    diary(s, "麻雀从远处带回一颗小萝卜种子");
    return true;
  }

  // ---------- 每日任务与时间 ----------
  // 每完成 1 项可领取 5 滴水；任务本身不再附送种子。
  function completeDaily(s, index) {
    if (!Number.isInteger(index) || index < 0 || index > 2 || s.dailyDone[index]) return false;
    s.dailyDone[index] = true;
    return true;
  }
  // 庄园只领取水滴，与轻笺积分领取分开。水桶装不下的部分留待当日领取。
  const pendingDailyWater = s => s.dailyDone.flatMap((done,index) => done && (s.dailyWaterClaims?.[index]||0)<RULES.dailyWater
    ? [{index,water:RULES.dailyWater-(s.dailyWaterClaims?.[index]||0)}] : []);
  function claimDailyWater(s,index) {
    const reward=pendingDailyWater(s).find(r=>r.index===index);
    if(!s.adopted||!reward)return null;
    const water=Math.min(reward.water,Math.max(0,RULES.waterCap-s.water));
    if(!water)return null;
    s.dailyWaterClaims ||= [0,0,0];s.dailyWaterClaims[index]+=water;s.water+=water;
    return {water};
  }
  function claimAllDailyWater(s) {
    let water=0;
    for(const reward of pendingDailyWater(s)) water+=claimDailyWater(s,reward.index)?.water||0;
    return water ? {water,pending:pendingDailyWater(s).reduce((n,r)=>n+r.water,0)} : null;
  }
  function advance(s, hours) {
    if (s.casting || !Number.isFinite(hours) || hours < 0) return false;
    const oldDay = day(s);
    s.now += hours;
    if (day(s) !== oldDay) {
      s.freeUsed = 0;
      s.dailyDone = [false, false, false];
      s.dailyWaterClaims = [0,0,0];
      if (Math.floor(day(s) / 7) !== Math.floor(oldDay / 7)) {
        s.weekEarned = 0;
        s.weekSpent = 0;
      }
    }
    return true;
  }

  // 建成后先净化 24 小时；此后每天生成一批水，旧批次不跨天叠加。
  function purifierStatus(s) {
    if (!s.adopted || !s.purifier) return { owned:false, level:0, daily:0, ready:0, claimed:0 };
    const tier=RULES.purifierLevels[Number.isInteger(s.purifier.level)&&s.purifier.level>=1&&s.purifier.level<=3?s.purifier.level-1:0];
    const remaining=Number.isFinite(s.purifier.purchasedAt)?Math.max(0,s.purifier.purchasedAt+24-s.now):0;
    const claimed=s.purifier.claimDay===day(s) ? Math.max(0,Math.min(tier.water,s.purifier.claimedWater||0)) : 0;
    return { owned:true, level:tier.level, daily:tier.water, ready:remaining?0:tier.water-claimed, claimed, remaining };
  }
  function buyPurifier(s) {
    if (!s.adopted || s.casting || s.purifier || level(s)<RULES.purifierLevels[0].gardenLevel ||
      ![s.wallet,s.weekSpent+RULES.purifierCost].every(Number.isSafeInteger) || s.wallet<RULES.purifierCost) return false;
    spend(s,RULES.purifierCost,"建造海水过滤器");
    s.purifier={level:1,purchasedAt:s.now,claimDay:null,claimedWater:0};
    diary(s,"海水过滤器建好了，24 小时后可收第一批清水");
    return true;
  }
  function claimPurifier(s) {
    const p=purifierStatus(s),water=Math.min(p.ready,Math.max(0,RULES.waterCap-s.water));
    if (!p.owned || !water) return null;
    s.purifier.claimDay=day(s);s.purifier.claimedWater=p.claimed+water;s.water+=water;
    return {water,left:p.daily-s.purifier.claimedWater};
  }

  function buyFacility(s, key) {
    const facility=FACILITIES[key];
    if(!facility||!s.adopted||s.casting||s[key]||level(s)<facility.gardenLevel||
      ![s.wallet,s.weekSpent+facility.cost].every(Number.isSafeInteger)||s.wallet<facility.cost)return false;
    spend(s,facility.cost,`建造${facility.name}`);
    s[key]=key==="workshop"?{purchasedAt:s.now,job:null,nextJobId:1}:key==="composter"?{purchasedAt:s.now,level:1,residue:0,stock:0,nextReady:null}:{purchasedAt:s.now,pollen:0,lastPollinatedDay:null};
    diary(s,`${facility.name}建好了`);
    return true;
  }
  // Pure projection bounded by the current tier's storage, even after a long absence.
  function composterProjection(s) {
    if(!s.composter)return null;
    const c={...s.composter,level:s.composter.level||1,stockByFertilizer:{...(s.composter.stockByFertilizer||{eco:s.composter.stock})}},tier=COMPOST_LEVELS[c.level-1];
    while(c.nextReady!==null && c.nextReady<=s.now && c.stock<tier.storage) {
      const finished=c.nextReady;c.stock++;c.stockByFertilizer[tier.fertilizer]=(c.stockByFertilizer[tier.fertilizer]||0)+1;c.nextReady=null;
      if(c.stock<tier.storage && c.residue>=COMPOST_RULES.residuePerBatch) {
        c.residue-=COMPOST_RULES.residuePerBatch;c.nextReady=finished+tier.hours;
      }
    }
    if(c.nextReady===null && c.stock<tier.storage && c.residue>=COMPOST_RULES.residuePerBatch) {
      c.residue-=COMPOST_RULES.residuePerBatch;c.nextReady=s.now+tier.hours;
    }
    return c;
  }
  function composterStatus(s) {
    const c=composterProjection(s);
    if(!c)return {owned:false,level:0,hours:COMPOST_LEVELS[0].hours,storage:COMPOST_LEVELS[0].storage,fertilizer:COMPOST_LEVELS[0].fertilizer,stored:{},phase:"sealed",residue:0,stock:0,remaining:0};
    const tier=COMPOST_LEVELS[c.level-1];
    return {owned:true,level:c.level,hours:tier.hours,storage:tier.storage,fertilizer:tier.fertilizer,stored:{...c.stockByFertilizer},phase:c.stock>=tier.storage?"full":c.nextReady!==null?"working":c.stock?"ready":"idle",
      residue:c.residue,stock:c.stock,remaining:c.nextReady===null?0:Math.max(0,c.nextReady-s.now)};
  }
  function upgradeComposter(s,plan) {
    const c=composterProjection(s),tier=c&&COMPOST_LEVELS[c.level];
    if(!s.adopted||s.casting||!tier||plan?.level!==c.level+1||plan?.cost!==tier.cost||level(s)<tier.gardenLevel||
      ![s.wallet,s.weekSpent+tier.cost].every(Number.isSafeInteger)||s.wallet<tier.cost)return false;
    // Settle completed batches at the old quality. The active batch keeps its deadline.
    spend(s,tier.cost,`升级堆肥箱 Lv.${c.level+1}`);c.level++;
    s.composter=c;s.composter=composterProjection(s);
    diary(s,`堆肥箱升至 Lv.${c.level}`);
    return true;
  }
  function collectCompost(s) {
    const c=composterProjection(s);
    if(!s.adopted||s.casting||!c||!c.stock||Object.entries(c.stockByFertilizer).some(([key,count])=>!Number.isSafeInteger((s.fertilizers[key]||0)+count)))return 0;
    const count=c.stock;for(const [key,n] of Object.entries(c.stockByFertilizer))if(n)s.fertilizers[key]=(s.fertilizers[key]||0)+n;
    c.stock=0;c.stockByFertilizer={};s.composter=c;
    s.composter=composterProjection(s);
    return count;
  }
  function workshopStatus(s) {
    const job=s.workshop?.job;
    if(!s.workshop)return {owned:false,phase:"sealed",job:null,remaining:0};
    return {owned:true,phase:!job?"idle":s.now>=job.readyAt?"ready":"crafting",job,
      remaining:job?Math.max(0,job.readyAt-s.now):0};
  }
  function craftQuote(s, recipe, count=1) {
    const def=BAIT_RECIPES[recipe], valid=!!def&&Number.isSafeInteger(count)&&count>=1&&count<=FACILITY_RULES.craftMax;
    const missing=valid?Math.max(0,count-(s.bait||0))+Math.max(0,count-(s.crops[def.crop]||0)):0;
    return {recipe,count,crop:def?.crop,valid,missing,
      ready:valid&&s.adopted&&!s.casting&&workshopStatus(s).phase==="idle"&&missing===0};
  }
  function startCraft(s, recipe, count=1) {
    const quote=craftQuote(s,recipe,count);
    if(!quote.ready)return null;
    const id=s.workshop.nextJobId||1;
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(id+1))return null;
    s.bait-=count;s.crops[quote.crop]-=count;
    s.workshop.job={id,recipe,count,started:s.now,readyAt:s.now+FACILITY_RULES.craftHours};
    s.workshop.nextJobId=id+1;
    return {...s.workshop.job};
  }
  function collectCraft(s, jobId) {
    const status=workshopStatus(s),job=status.job;
    if(!s.adopted||s.casting||status.phase!=="ready"||!job||job.id!==jobId||!BAIT_RECIPES[job.recipe])return null;
    const stock=s.craftedBait?.[job.recipe]||0;
    if(!Number.isSafeInteger(stock+job.count))return null;
    s.craftedBait||={fruit:0,herb:0};s.craftedBait[job.recipe]=stock+job.count;s.workshop.job=null;
    return {recipe:job.recipe,count:job.count};
  }
  function beehiveStatus(s) {
    const hive=s.beehive;
    return {owned:!!hive,pollen:hive?.pollen||0,capacity:FACILITY_RULES.pollenCapacity,
      usedToday:!!hive&&hive.lastPollinatedDay===day(s)};
  }
  function refillPollen(s, crop) {
    const amount=FACILITY_RULES.flowerPollen[crop],hive=s.beehive;
    if(!s.adopted||s.casting||!hive||!amount||!(s.crops[crop]>0)||
      !Number.isSafeInteger(hive.pollen)||hive.pollen<0||hive.pollen+amount>FACILITY_RULES.pollenCapacity)return 0;
    s.crops[crop]--;hive.pollen+=amount;
    return amount;
  }
  const pollinationEligible = (s,i) => !!s.beehive && Number.isInteger(i) && plotState(s,i)==="growing" &&
    FACILITY_RULES.pollinationCrops.includes(s.plots[i].crop) && !s.plots[i].pollinated;
  const pollinationTargets = s => s.plots.flatMap((p,i)=>pollinationEligible(s,i)?[i]:[]);
  function pollinate(s,i) {
    const hive=s.beehive;
    if(!s.adopted||s.casting||!pollinationEligible(s,i)||!Number.isSafeInteger(hive.pollen)||hive.pollen<1||
      hive.lastPollinatedDay===day(s))return false;
    hive.pollen--;hive.lastPollinatedDay=day(s);
    s.plots[i].pollinated=true;s.plots[i].pollinationPending=true;
    return true;
  }

  // 升级先生成待确认的个体清单；确认时逐一核验原个体，不能用后来补入的材料悄悄替换。
  const purifierMaterial = (kind, tier, catalog) => !!catalog[kind] && catalog[kind].water==="sea" &&
    catalog[kind].group==="creature"&&catalog[kind].habitat==="bottom"&&catalog[kind].quality===tier.material.quality;
  function purifierUpgradePlan(s,catalog={},selected=[]) {
    const p=purifierStatus(s),tier=p.owned&&RULES.purifierLevels[p.level];
    if(!tier)return null;
    const eligible=s.fish.filter(f=>!placed(s,f.id)&&f.id!==s.firstCompanionPending&&purifierMaterial(f.kind,tier,catalog));
    const ids=Array.isArray(selected)?[...selected]:[];
    return {level:tier.level,cost:tier.cost,ids,
      eligible:eligible.map(f=>f.id),available:eligible.length,required:tier.material.count,quality:tier.material.quality,
      ready:level(s)>=tier.gardenLevel&&s.wallet>=tier.cost&&ids.length===tier.material.count&&
        new Set(ids).size===ids.length&&ids.every(id=>eligible.some(f=>f.id===id))};
  }
  function upgradePurifier(s,plan,catalog={}) {
    const p=purifierStatus(s),tier=RULES.purifierLevels[p.level];
    if(!p.owned||!tier||s.casting||!plan||plan.level!==tier.level||plan.cost!==tier.cost||level(s)<tier.gardenLevel||
      ![s.wallet,s.weekSpent+tier.cost].every(Number.isSafeInteger)||s.wallet<tier.cost||!Array.isArray(plan.ids)||new Set(plan.ids).size!==plan.ids.length)return false;
    const chosen=plan.ids.map(id=>s.fish.find(f=>f.id===id));
    if(chosen.some(f=>!f||placed(s,f.id)||f.id===s.firstCompanionPending||!purifierMaterial(f.kind,tier,catalog))||chosen.length!==tier.material.count)return false;
    // 所有前提均通过后，一次性扣积分和材料。图鉴、已领取水量均保持不变。
    const used=new Set(plan.ids);
    spend(s,tier.cost,`海水过滤器升级 Lv.${tier.level}`);
    s.fish=s.fish.filter(f=>!used.has(f.id));s.purifier.level=tier.level;
    diary(s,`海水过滤器升至 Lv.${tier.level}，每日可收 ${tier.water} 滴清水`);
    return true;
  }

  // ---------- 钓鱼与养鱼舱（沿用） ----------
  const placed = (s, fishId) => [...s.fishSlots, ...s.showSlots].some((x) => x?.fishId === fishId);
  // 放生待养区里的鱼：图鉴记录保留，按稀有度返还 1 份对应催熟肥；不产肥的其他水族不能放生换肥
  function release(s, fishId, catalog) {
    if(s.firstCompanionPending===fishId)return null;
    if (placed(s, fishId)) return null;
    const i = s.fish.findIndex((f) => f.id === fishId);
    if (i < 0 || !catalog[s.fish[i].kind]?.fertilizer) return null;
    const [fish] = s.fish.splice(i, 1);
    const kind = catalog[fish.kind]?.fertilizer;
    if (kind) s.fertilizers[kind]++;
    return kind || null;
  }
  function baitPrice(count) {
    if (!Number.isInteger(count) || count < 1 || count > RULES.baitBundleCount) return null;
    return count === RULES.baitBundleCount ? RULES.baitBundlePrice : count * RULES.baitCost;
  }
  function buyBait(s, count) {
    const cost = baitPrice(count);
    if (cost === null || s.wallet < cost) return false;
    spend(s, cost, `兑换鱼饵 × ${count}`);
    s.bait += count;
    return true;
  }
  function selectBait(s, kind) {
    if (!["bait", "rainbow",...Object.keys(BAIT_RECIPES)].includes(kind) || s.casting) return false;
    s.preferredBait = kind;
    return true;
  }
  // 免费次数优先；用尽后沿用用户上次选择，库存不足不擅自换另一种。
  function beginCast(s, choice = s.preferredBait || "bait") {
    if (s.casting || s.firstCompanionPending) return null;
    if (!["bait", "rainbow",...Object.keys(BAIT_RECIPES)].includes(choice)) return null;
    let source;
    if (s.freeUsed < RULES.dailyFree) {
      s.freeUsed++;
      source = "free";
    } else if (choice === "rainbow" && s.rainbowBait > 0) {
      s.rainbowBait--;
      source = "rainbow";
    } else if (choice === "bait" && s.bait > 0) {
      s.bait--;
      source = "bait";
    } else if (BAIT_RECIPES[choice] && s.craftedBait?.[choice]>0) {
      s.craftedBait[choice]--;
      source=choice;
    } else return null;
    if (source !== "free") s.preferredBait = choice;
    s.casting = true;
    s.castPending = true;
    s.castSource = source;
    s.castPity = RULES.pityCasts;
    return source;
  }
  function addFish(s, kind) {
    const f = { id: s.nextFishId++, kind };
    s.fish.push(f);
    if (s.discoveries[kind] === undefined) {
      s.discoveries[kind] = day(s);
      (s.atlasUnread ??= {})[`fish:${kind}`] = true;
    }
    return f;
  }
  // 淡水鱼苗袋：稀有度占比与钓鱼相同，但不会空；花费计入每周净收益的“花费”一侧
  const fryLeft = (s) => (s.fryDay === day(s) ? Math.max(0, RULES.fryDaily - s.fryUsed) : RULES.fryDaily);
  function buyFry(s, catalog, rng = Math.random) {
    if (!fryLeft(s) || s.wallet < RULES.fryPrice) return null;
    const pool = Object.keys(catalog).filter((k) => catalog[k].water === "fresh");
    if (!pool.length) return null;
    if (s.fryDay !== day(s)) {
      s.fryDay = day(s);
      s.fryUsed = 0;
    }
    s.fryUsed++;
    spend(s, RULES.fryPrice, "淡水鱼苗袋");
    const roll = rng();
    let acc = 0,
      rarity = "传说";
    for (const [q, p] of Object.entries(RULES.rarityOdds)) {
      acc += p;
      if (roll < acc) {
        rarity = q;
        break;
      }
    }
    const bucket = pool.filter((k) => catalog[k].quality === rarity);
    const picks = bucket.length ? bucket : pool;
    const kind = picks[Math.min(picks.length - 1, Math.floor(rng() * picks.length))];
    const discovered = s.discoveries[kind] === undefined;
    const fish = addFish(s, kind);
    if (discovered) s.xp += RULES.firstFishXp;
    return { fish, discovered };
  }
  // 庄园垂钓使用完整水族池；可选水域筛选仍供限定场景使用，不改变生物栖息地。
  const poolOf = (catalog, spot) => Object.keys(catalog).filter((k) => !spot || (catalog[k].water || "sea") === spot);
  function resolveCast(s, catalog, rng = Math.random, forced = null, spot = null) {
    if (!s.casting || !s.castPending) return null;
    const pool = poolOf(catalog, spot);
    if (!pool.length) return null;
    // 只认明确的新用户标记，不由当前背包或图鉴反推，卖出/放生/跨日不会重新触发。
    // 强制结果仅用于原型实验室，优先于首钓；旧状态缺少标记时不补发。
    const firstCatch = s.firstCastDone === false && !forced;
    if (firstCatch && !pool.includes(RULES.firstFish)) return null;
    s.castPending = false;
    s.casting = false;
    s.firstCastDone = true;
    const forcedFish = forced && catalog[forced] ? forced : null;
    const sure = s.castSource === "rainbow";
    // The threshold is captured at cast time. Legacy pending casts have no pity,
    // and do not count a historical miss towards the new guarantee.
    const pity = s.castPity || 0;
    const misses = Number.isInteger(s.emptyCastStreak) ? Math.max(0, s.emptyCastStreak) : 0;
    const success = firstCatch || forcedFish || (forced !== "empty" && (sure || (pity > 0 && misses >= pity - 1) || rng() < RULES.success));
    s.emptyCastStreak = success || !pity ? 0 : Math.min(pity - 1, misses + 1);
    delete s.castPity;
    if (!success) {
      return { fish: null };
    }
    let kind = firstCatch ? RULES.firstFish : forcedFish;
    if (!kind) {
      const roll = rng();
      let acc = 0,
        rarity = "传说";
      for (const [q, p] of Object.entries(RULES.rarityOdds)) {
        acc += p;
        if (roll < acc) {
          rarity = q;
          break;
        }
      }
      const bucket = pool.filter((k) => catalog[k].quality === rarity);
      const picks = bucket.length ? bucket : pool;
      const target=k=>s.castSource==="fruit"?!!catalog[k].fertilizer:
        s.castSource==="herb"?catalog[k].group==="creature"&&catalog[k].habitat==="bottom":false;
      const favored=BAIT_RECIPES[s.castSource]&&picks.some(target);
      const weights=picks.map(k=>favored&&target(k)?FACILITY_RULES.targetWeight:1);
      const total=weights.reduce((a,b)=>a+b,0);
      let pick=Math.min(1-Number.EPSILON,Math.max(0,rng()))*total;
      kind=picks[picks.length-1];
      for(let n=0;n<picks.length;n++){pick-=weights[n];if(pick<0){kind=picks[n];break;}}
    }
    const discovered = s.discoveries[kind] === undefined;
    const fish = addFish(s, kind);
    if (discovered) s.xp += RULES.firstFishXp;
    if (s.discoveryGuide === "fish") s.discoveryGuide = "place";
    // 首钓伙伴先入住，走完鱼舱引导；钓获不再附带种子奖励。
    if(firstCatch) {s.firstCompanionPending=fish.id;s.discoveryGuide="place";}
    return { fish, discovered, firstCatch };
  }
  const farmFish = (s, slot) => (slot ? s.fish.find((f) => f.id === slot.fishId) : null);
  function production(s, slot) {
    const H = RULES.productionHours,
      cap = RULES.storageLimit;
    if (!farmFish(s, slot)) return { ready: 0, progress: 0, next: H };
    const elapsed = Math.max(0, s.now - slot.started);
    const count = Math.min(cap, Math.floor(elapsed / H));
    return { ready: count, progress: count === cap ? 1 : (elapsed % H) / H, next: count === cap ? 0 : H - (elapsed % H) };
  }
  function collectSlot(s, index, catalog) {
    const slot = s.fishSlots[index],
      fish = farmFish(s, slot);
    if (!fish) return 0;
    const n = production(s, slot).ready;
    if (!n) return 0;
    s.fertilizers[catalog[fish.kind].fertilizer] += n;
    slot.started = n === RULES.storageLimit ? s.now : slot.started + n * RULES.productionHours;
    return n;
  }
  function collect(s, catalog) {
    return s.fishSlots.reduce((sum, _, i) => sum + collectSlot(s, i, catalog), 0);
  }
  // 产肥位只住会产肥的鱼
  function place(s, fishId, index, catalog) {
    const fish = s.fish.find((f) => f.id === fishId);
    if (!Number.isInteger(index) || index < 0 || !fish || !catalog[fish.kind]?.fertilizer || index >= RULES.farmSlots || placed(s, fishId)) return false;
    collectSlot(s, index, catalog);
    s.fishSlots[index] = { fishId, started: s.now };
    if (s.discoveryGuide === "place") s.discoveryGuide = "observe";
    if(s.firstCompanionPending===fishId)s.firstCompanionPending=null;
    return true;
  }
  // 观赏位住不产肥的其他水族，只为好看
  function placeShow(s, fishId, index, catalog) {
    const fish = s.fish.find((f) => f.id === fishId);
    if (!Number.isInteger(index) || index < 0 || index >= RULES.showSlots || !fish || catalog[fish.kind]?.fertilizer || placed(s, fishId)) return false;
    s.showSlots[index] = { fishId };
    return true;
  }
  // 一键安排只填空位：产肥位优先肥效，观赏位优先稀有度；不移动现有住客。
  function residentPlan(s, catalog) {
    const waiting = s.fish.filter(f => catalog[f.kind] && !placed(s, f.id));
    const plan = [];
    for (const area of ["farm", "show"]) {
      const slots = area === "farm" ? s.fishSlots : s.showSlots;
      const score = f => area === "farm" ? FERT[catalog[f.kind].fertilizer]?.hours || 0 : RULES.sellPrice[catalog[f.kind].quality] || 0;
      const candidates = waiting.filter(f => !!catalog[f.kind].fertilizer === (area === "farm"))
        .sort((a, b) => score(b) - score(a));
      for (let index = 0; index < slots.length && candidates.length; index++) {
        if (!slots[index]) plan.push({ fishId: candidates.shift().id, index, area });
      }
    }
    return plan;
  }
  function fillEmptySlots(s, catalog) {
    return residentPlan(s, catalog).filter(({ fishId, index, area }) =>
      area === "farm" ? place(s, fishId, index, catalog) : placeShow(s, fishId, index, catalog));
  }
  // 收回到待养区：产肥位先收好已产出的肥料
  function unplace(s, fishId, catalog) {
    const i = s.fishSlots.findIndex((x) => x?.fishId === fishId);
    if (i >= 0) {
      collectSlot(s, i, catalog);
      s.fishSlots[i] = null;
      return true;
    }
    const j = s.showSlots.findIndex((x) => x?.fishId === fishId);
    if (j < 0) return false;
    s.showSlots[j] = null;
    return true;
  }
  const sellPrice = (kind, catalog) => {
    const c = catalog[kind];
    if (!c) return 0;
    return Math.round(RULES.sellPrice[c.quality] * (c.fertilizer ? 1 : RULES.creatureSellRate));
  };
  // 卖出待养区里的生物：消耗唯一个体换成积分，图鉴记录保留。
  function sell(s, fishId, catalog) {
    if(s.firstCompanionPending===fishId)return 0;
    if (placed(s, fishId)) return 0;
    const i = s.fish.findIndex((f) => f.id === fishId);
    if (i < 0) return 0;
    const price = sellPrice(s.fish[i].kind, catalog);
    if (!price || ![price, s.wallet + price, s.weekEarned + price].every(Number.isSafeInteger)) return 0;
    const [fish] = s.fish.splice(i, 1);
    earn(s, price, `卖出${catalog[fish.kind].name || "一位水族"}`);
    s.nextSaleId ||= 1;
    s.buybacks=[{id:s.nextSaleId++,fish:{...fish},points:price,buybackPoints:buybackPrice(price),soldAt:s.now},...buybackEntries(s)].slice(0,RULES.buybackLimit);
    return price;
  }
  const buybackEntries=s=>(s.buybacks||[]).filter(r=>Number.isFinite(r.soldAt)&&s.now>=r.soldAt&&s.now-r.soldAt<RULES.buybackHours);
  function buybackPrice(points) {
    const result=points+Math.max(1,Math.ceil(points*RULES.buybackFeePercent/100));
    return Number.isSafeInteger(points)&&points>0&&Number.isSafeInteger(result)?result:0;
  }
  const buybackCost=entry=>entry.buybackPoints??entry.points;
  function buyback(s,saleId,catalog,quotedPoints) {
    const entry=buybackEntries(s).find(r=>r.id===saleId),cost=entry?buybackCost(entry):0;
    // Old receipts keep their quote. New fees require a matching displayed quote, including older clients.
    if(!entry||!catalog[entry.fish.kind]||s.fish.some(f=>f.id===entry.fish.id)||s.wallet<cost||
      (entry.buybackPoints!==undefined&&quotedPoints===undefined)||(quotedPoints!==undefined&&quotedPoints!==cost)||
      ![cost,s.wallet-cost,s.weekSpent+cost].every(Number.isSafeInteger)||cost<=0)return null;
    spend(s,cost,`赎回${catalog[entry.fish.kind].name||"一位水族"}`);
    const fish={...entry.fish};s.fish.push(fish);
    s.buybacks=s.buybacks.filter(r=>r.id!==saleId);
    return fish;
  }
  function tankSize(s, catalog) {
    const size = Math.max(0, ...[...s.fishSlots, ...s.showSlots].map((slot) => catalog[farmFish(s, slot)?.kind]?.size || 0));
    return size >= 150 ? "ocean" : size >= 50 ? "large" : "normal";
  }

  // 收藏目录统一由常见到稀有；同档保留目录顺序，首钓伙伴排在鱼类最前。
  function collectionEntries(catalog) {
    const quality = { "常见": 0, "稀有": 1, "珍稀": 2, "传说": 3 }, tier = { basic: 0, advanced: 1, rare: 2 };
    const entries = [...Object.keys(catalog).map(key => ({type:"fish", key, rank:quality[catalog[key].quality] ?? 0})),
      ...Object.keys(CROPS).map(key => ({type:"crop", key, rank:tier[CROPS[key].tier]}))];
    return entries.sort((a,b) => a.rank - b.rank || Number(b.key === RULES.firstFish) - Number(a.key === RULES.firstFish));
  }
  // 未读提示只来自首次获得；已有存档缺少这个字段时不追补历史红点。
  function atlasEntryUnread(s, type, key) {
    const known = type === "fish" ? s.discoveries[key] !== undefined : type === "crop" && !!s.cropDex[key];
    return !!(known && s.atlasUnread?.[`${type}:${key}`]);
  }
  function atlasUnreadEntries(s, catalog) {
    return collectionEntries(catalog).filter(({type,key}) => atlasEntryUnread(s,type,key));
  }
  function readAtlasEntry(s, type, key) {
    if (!atlasEntryUnread(s,type,key)) return false;
    delete s.atlasUnread[`${type}:${key}`];
    return true;
  }
  // 正式新存档仅包含空库存；积分余额在服务端从 user_growth.points 读取。
  function create() {
    return {
      adopted: false, guide: "welcome", discoveryGuide: null,
      now: 24, xp: 0, water: 0, wallet: 0, bait: 0, rainbowBait: 0,
      craftedBait: { fruit: 0, herb: 0 }, workshop: null, beehive: null,
      preferredBait: "bait", freeUsed: 0, firstCastDone: false, emptyCastStreak: 0,
      firstCompanionPending: null, casting: false, castPending: false, castSource: null,
      fish: [], fishSlots: Array(RULES.farmSlots).fill(null), showSlots: Array(RULES.showSlots).fill(null),
      discoveries: {}, atlasUnread: {}, nextFishId: 1, buybacks: [], nextSaleId: 1,
      composter: null,
      fertilizers: { rabbit: 0, eco: 0, nourish: 0, fertile: 0, legend: 0 },
      plots: Array.from({ length: RULES.plotCount }, emptyPlot), seeds: {}, crops: {}, cropDex: {}, rewards: {},
      poopDay: null, birdSeedDay: null, birdSeedPickedDay: null, fryDay: null, fryUsed: 0,
      dailyDone: [false, false, false], dailyWaterClaims: [0, 0, 0], purifier: null,
      weekEarned: 0, weekSpent: 0, ledger: [], memories: [],
    };
  }
  // 首次进入：领取见面礼（30 滴水 + 3 颗小萝卜种子）
  function adopt(s) {
    if (s.adopted) return false;
    s.adopted = true;
    claimLevelReward(s, 1);
    diary(s, "来到庄园，收到见面礼");
    return true;
  }

  return {
    RULES,
    CROPS,
    RARE,
    FERT,
    FACILITIES, BAIT_RECIPES, FACILITY_RULES, COMPOST_RULES,
    LEVEL_REWARDS,
    claimLevelReward,
    pendingLevelRewards,
    claimAllLevelRewards,
    COLLECTIONS,
    collectionProgress,
    claimCollection,
    day,
    week,
    levelInfo,
    level,
    plotsOpen,
    unlocksAt,
    plotState,
    remaining,
    growthStage,
    STAGE_AT,
    stageTimes,
    progress,
    plant,
    seedChoices,
    replantSeed,
    water,
    harvest,
    fertilize,
    remove,
    birdCanDeliver,
    birdSeedReady,
    deliverBirdSeed,
    pickBirdSeed,
    poopReady,
    pickPoop,
    fryLeft,
    buyFry,
    buyable,
    buySeed,
    grantSeed,
    quoteCropSale,
    sellCrop,
    sellAllCrops,
    buybackPrice, buybackCost,
    buybackEntries,
    buyback,
    convertBait,
    create,
    adopt,
    completeDaily,
    pendingDailyWater, claimDailyWater, claimAllDailyWater, selectBait,
    purifierStatus, buyPurifier, claimPurifier, purifierUpgradePlan, upgradePurifier,
    buyFacility, composterStatus, upgradeComposter, collectCompost, workshopStatus, craftQuote, startCraft, collectCraft,
    beehiveStatus, refillPollen, pollinationEligible, pollinationTargets, pollinate,
    advance,
    buyBait,
    baitPrice,
    release,
    beginCast,
    resolveCast,
    addFish,
    farmFish,
    production,
    collect,
    collectSlot,
    place,
    placeShow,
    residentPlan,
    fillEmptySlots,
    collectionEntries,
    atlasEntryUnread, atlasUnreadEntries, readAtlasEntry,
    placed,
    unplace,
    sellPrice,
    sell,
    tankSize,
  };
})();
export default GardenModel;
