import model from './manorModel.js';
import { MANOR_SPECIES } from './manorSpecies.js';

export { model as manorModel, MANOR_SPECIES };
export const MANOR_VERSION = 'knowledge-manor-v2';

export class ManorError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.name = 'ManorError';
    this.code = code;
    this.status = status;
  }
}

const invalid = () => { throw new ManorError('MANOR_COMMAND_INVALID', 400); };
const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(n) || n < min || n > max) invalid();
  return n;
};
const key = (value, catalog) => {
  if (typeof value !== 'string' || !Object.hasOwn(catalog, value)) invalid();
  return value;
};
const indices = (value) => {
  if (!Array.isArray(value) || value.length > model.RULES.plotCount) invalid();
  const result = value.map(n => integer(n, 0, model.RULES.plotCount - 1));
  if (new Set(result).size !== result.length) invalid();
  return result;
};
const ordinal = (value) => {
  if (!/^\d{8}$/.test(value || '')) invalid();
  const y = Number(value.slice(0, 4)), m = Number(value.slice(4, 6)), d = Number(value.slice(6));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) invalid();
  return Math.floor(date.getTime() / 86_400_000);
};

// A timezone change may revisit a previously used calendar date. Keep its existing
// daily usage, just like the main site's day-keyed reward receipts.
function rememberDailyUsage(s) {
  const day = s.calendarDay;
  (s.dailyUsage ||= {})[s.dayKey] = {
    freeUsed: s.freeUsed,
    waterClaims: [...s.dailyWaterClaims],
    poopPicked: s.poopDay === day,
    birdDelivered: s.birdSeedDay === day,
    birdPicked: s.birdSeedPickedDay === day,
    fryUsed: s.fryDay === day ? s.fryUsed : 0,
    pollinated: s.beehive?.lastPollinatedDay === day,
    purifierWater: s.purifier?.claimDay === day ? s.purifier.claimedWater || 0 : 0,
  };
}
function restoreDailyUsage(s, dayKey) {
  const usage = s.dailyUsage?.[dayKey];
  s.freeUsed = usage?.freeUsed || 0;
  s.dailyWaterClaims = usage ? [...usage.waterClaims] : [0, 0, 0];
  s.poopDay = usage?.poopPicked ? s.calendarDay : null;
  s.birdSeedDay = usage?.birdDelivered ? s.calendarDay : null;
  s.birdSeedPickedDay = usage?.birdPicked ? s.calendarDay : null;
  s.fryDay = s.calendarDay;
  s.fryUsed = usage?.fryUsed || 0;
  if (s.beehive) s.beehive.lastPollinatedDay = usage?.pollinated ? s.calendarDay : null;
  if (s.purifier) {
    s.purifier.claimDay = s.calendarDay;
    s.purifier.claimedWater = usage?.purifierWater || 0;
  }
}

/** Empty, account-owned save. The caller supplies the existing LightNote points balance. */
export function createManor({ now, calendar, points }) {
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) invalid();
  integer(points, 0, 2_147_483_647);
  const localDay = ordinal(calendar.dayKey);
  const origin = localDay * 86_400_000 - calendar.utcOffsetMinutes * 60_000 - 86_400_000;
  return {
    ...model.create(), version: MANOR_VERSION,
    clockOrigin: origin, startedDayKey: calendar.dayKey, dayKey: calendar.dayKey,
    calendarTimezone: calendar.timezone || null, calendarOffsetMinutes: calendar.utcOffsetMinutes,
    dailyUsage: {},
    weekKey: calendar.weekKey, calendarDay: 1, now: (time - origin) / 3_600_000,
    wallet: points,
  };
}

/** Read projection: real time and real task progress; it does not award or persist anything. */
export function projectManor(saved, { now, calendar, points, dailyDone = [false, false, false], supplyEligibility = {} }) {
  if (saved.version !== MANOR_VERSION && saved.version !== 'knowledge-manor-v1') throw new ManorError('MANOR_VERSION_UNSUPPORTED', 409);
  const s = structuredClone(saved);
  if (s.version !== MANOR_VERSION) {
    s.version = MANOR_VERSION;
    s.emptyCastStreak = 0;
    delete s.castPity;
  }
  if (!Array.isArray(dailyDone) || dailyDone.length !== 3 || dailyDone.some(x => typeof x !== 'boolean')) invalid();
  integer(points, 0, 2_147_483_647);
  const time = new Date(now).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(s.clockOrigin)) invalid();
  rememberDailyUsage(s);
  s.now = Math.max(s.now, (time - s.clockOrigin) / 3_600_000);
  s.calendarDay = Math.max(1, ordinal(calendar.dayKey) - ordinal(s.startedDayKey) + 1);
  if (s.dayKey !== calendar.dayKey) {
    restoreDailyUsage(s, calendar.dayKey);
  }
  // Valid account timezones span at most 26 hours, so older dates cannot be revisited.
  const oldest = ordinal(calendar.dayKey) - 7;
  for (const date of Object.keys(s.dailyUsage)) if (ordinal(date) < oldest) delete s.dailyUsage[date];
  if (s.weekKey !== calendar.weekKey) {
    s.weekEarned = 0;
    s.weekSpent = 0;
  }
  s.dayKey = calendar.dayKey;
  s.weekKey = calendar.weekKey;
  s.calendarTimezone = calendar.timezone || null;
  s.calendarOffsetMinutes = calendar.utcOffsetMinutes;
  s.wallet = points;
  s.dailyDone = [...dailyDone];
  s.supplyEligibility = { ...supplyEligibility, 'dex-30': Object.keys(s.discoveries).filter(k => Object.hasOwn(MANOR_SPECIES, k)).length >= 30 };
  return s;
}

const emptyArgs = args => { if (args.length) invalid(); };
const commandCatalog = Object.freeze({
  adopt(s, a) { emptyArgs(a); const result = model.adopt(s); if (result) s.guide = 'plant'; return result; },
  plant(s, a) {
    if (a.length !== 2) invalid();
    const i = integer(a[0], 0, 7), result = model.plant(s, i, key(a[1], model.CROPS));
    if (result && i === 0 && s.guide === 'plant') s.guide = 'water';
    return result;
  },
  water(s, a) { if (a.length !== 1) invalid(); return model.water(s, indices(a[0])); },
  harvest(s, a) { if (a.length !== 1) invalid(); return model.harvest(s, indices(a[0])); },
  fertilize(s, a) { if (a.length !== 2) invalid(); return model.fertilize(s, integer(a[0], 0, 7), key(a[1], model.FERT)); },
  remove(s, a) { if (a.length !== 1) invalid(); return model.remove(s, integer(a[0], 0, 7)); },
  buySeed(s, a) { if (a.length !== 2) invalid(); return model.buySeed(s, key(a[0], model.CROPS), integer(a[1], 1, 10)); },
  sellCrop(s, a) {
    if (a.length < 1 || a.length > 2) invalid();
    return model.sellCrop(s, key(a[0], model.CROPS), a[1] == null ? undefined : integer(a[1], 1));
  },
  sellAllCrops(s, a) { emptyArgs(a); return model.sellAllCrops(s); },
  convertBait(s, a) { if (a.length !== 2) invalid(); return model.convertBait(s, key(a[0], model.CROPS), integer(a[1], 1)); },
  buyBait(s, a) { if (a.length !== 1) invalid(); return model.buyBait(s, integer(a[0], 1, model.RULES.baitBundleCount)); },
  buyFry(s, a, ctx) { emptyArgs(a); return model.buyFry(s, MANOR_SPECIES, ctx.random); },
  beginCast(s, a) {
    if (a.length > 1) invalid();
    const result = model.beginCast(s, a[0]);
    if (result) s.castId = crypto.randomUUID();
    return result;
  },
  resolveCast(s, a, ctx) {
    if (a.length !== 1 || typeof a[0] !== 'string' || a[0] !== s.castId) invalid();
    const result = model.resolveCast(s, MANOR_SPECIES, ctx.random);
    if (result) delete s.castId;
    return result;
  },
  selectBait(s, a) { if (a.length !== 1 || typeof a[0] !== 'string') invalid(); return model.selectBait(s, a[0]); },
  sell(s, a) { if (a.length !== 1) invalid(); return model.sell(s, integer(a[0], 1), MANOR_SPECIES); },
  release(s, a) { if (a.length !== 1) invalid(); return model.release(s, integer(a[0], 1), MANOR_SPECIES); },
  buyback(s, a) { if (a.length < 1 || a.length > 2) invalid(); return model.buyback(s, integer(a[0], 1), MANOR_SPECIES, a.length === 2 ? integer(a[1], 1) : undefined); },
  place(s, a) { if (a.length !== 2) invalid(); return model.place(s, integer(a[0], 1), integer(a[1], 0, 5), MANOR_SPECIES); },
  placeShow(s, a) { if (a.length !== 2) invalid(); return model.placeShow(s, integer(a[0], 1), integer(a[1], 0, 2), MANOR_SPECIES); },
  unplace(s, a) { if (a.length !== 1) invalid(); return model.unplace(s, integer(a[0], 1), MANOR_SPECIES); },
  fillEmptySlots(s, a) { emptyArgs(a); return model.fillEmptySlots(s, MANOR_SPECIES); },
  collect(s, a) { emptyArgs(a); return model.collect(s, MANOR_SPECIES); },
  collectSlot(s, a) { if (a.length !== 1) invalid(); return model.collectSlot(s, integer(a[0], 0, 5), MANOR_SPECIES); },
  pickPoop(s, a) { emptyArgs(a); return model.pickPoop(s); },
  deliverBirdSeed(s, a) { emptyArgs(a); return model.deliverBirdSeed(s); },
  pickBirdSeed(s, a) { emptyArgs(a); model.deliverBirdSeed(s); return model.pickBirdSeed(s); },
  buyPurifier(s, a) { emptyArgs(a); return model.buyPurifier(s); },
  claimPurifier(s, a) { emptyArgs(a); return model.claimPurifier(s); },
  buyFacility(s, a) { if (a.length !== 1) invalid(); return model.buyFacility(s, key(a[0], model.FACILITIES)); },
  upgradePurifier(s, a) {
    if (a.length !== 1 || !a[0] || typeof a[0] !== 'object' || Array.isArray(a[0])) invalid();
    const plan = a[0];
    if (!Array.isArray(plan.ids) || plan.ids.length > 4) invalid();
    plan.ids.forEach(n => integer(n, 1));
    integer(plan.level, 2, 3); integer(plan.cost, 1);
    return model.upgradePurifier(s, { level: plan.level, cost: plan.cost, ids: plan.ids }, MANOR_SPECIES);
  },
  collectCompost(s, a) { emptyArgs(a); return model.collectCompost(s); },
  upgradeComposter(s, a) {
    if(a.length!==1||!a[0]||typeof a[0]!== 'object'||Array.isArray(a[0]))invalid();
    const plan={level:integer(a[0].level,2,3),cost:integer(a[0].cost,1)};
    return model.upgradeComposter(s,plan);
  },
  startCraft(s, a) { if (a.length !== 2) invalid(); return model.startCraft(s, key(a[0], model.BAIT_RECIPES), integer(a[1], 1, 3)); },
  collectCraft(s, a) { if (a.length !== 1) invalid(); return model.collectCraft(s, integer(a[0], 1)); },
  refillPollen(s, a) { if (a.length !== 1) invalid(); return model.refillPollen(s, key(a[0], model.FACILITY_RULES.flowerPollen)); },
  pollinate(s, a) { if (a.length !== 1) invalid(); return model.pollinate(s, integer(a[0], 0, 7)); },
  claimDailyWater(s, a) { if (a.length !== 1) invalid(); return model.claimDailyWater(s, integer(a[0], 0, 2)); },
  claimAllDailyWater(s, a) { emptyArgs(a); return model.claimAllDailyWater(s); },
  claimLevelReward(s, a) { if (a.length !== 1) invalid(); return model.claimLevelReward(s, integer(a[0], 1, 30)); },
  claimAllLevelRewards(s, a) { emptyArgs(a); return model.claimAllLevelRewards(s); },
  claimCollection(s, a) { if (a.length !== 1) invalid(); return model.claimCollection(s, key(a[0], model.COLLECTIONS), MANOR_SPECIES); },
  readAtlasEntry(s, a) {
    if (a.length !== 2 || !['fish', 'crop'].includes(a[0])) invalid();
    key(a[1], a[0] === 'fish' ? MANOR_SPECIES : model.CROPS);
    return model.readAtlasEntry(s, a[0], a[1]);
  },
  dismissGuide(s, a) { emptyArgs(a); s.discoveryGuide = null; return true; },
  claimSupply(s, a, ctx) {
    if (a.length !== 1 || !['streak-7','streak-30','streak-100','week-all','dex-30'].includes(a[0])) invalid();
    const id = a[0];
    const count = Object.keys(s.discoveries).filter(k => Object.hasOwn(MANOR_SPECIES, k)).length;
    const eligible = id === 'dex-30' ? count >= 30 : Boolean(ctx.supplyEligibility?.[id]);
    if (!eligible) return null;
    const seed = id === 'streak-7' ? 'rainbowcorn' : id === 'streak-30' ? 'starpumpkin'
      : ['streak-100','dex-30'].includes(id) ? 'moonorchid' : model.RARE[Math.min(model.RARE.length - 1, Math.floor(ctx.random() * model.RARE.length))];
    const ref = id === 'week-all' ? `week-all:${s.weekKey}` : id;
    return model.grantSeed(s, seed, 1, ref) ? { seed, count: 1 } : null;
  },
});

export const MANOR_COMMANDS = Object.freeze(Object.keys(commandCatalog));

/** Only this boundary mutates authoritative saves. No client clock, RNG, reward or state input. */
export function executeManorCommand(saved, command, context) {
  if (!command || !Object.hasOwn(commandCatalog, command.action) || !Array.isArray(command.args)) invalid();
  if (command.args.length > 3) invalid();
  const state = projectManor(saved, context);
  if (!state.adopted && command.action !== 'adopt') throw new ManorError('MANOR_NOT_ADOPTED');
  if (state.casting && !['resolveCast', 'readAtlasEntry'].includes(command.action)) throw new ManorError('MANOR_CAST_PENDING');
  const result = commandCatalog[command.action](state, command.args, context);
  if (!Number.isSafeInteger(state.wallet) || state.wallet < 0 || state.wallet > 2_147_483_647) {
    throw new ManorError('MANOR_POINTS_INVALID');
  }
  rememberDailyUsage(state);
  return { state, result, pointsDelta: state.wallet - context.points };
}
