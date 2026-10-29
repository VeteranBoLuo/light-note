import { manorModel as M, MANOR_SPECIES } from '@lightnote/shared/manor';

const ignored = new Set(['readAtlasEntry', 'dismissGuide', 'selectBait', 'deliverBirdSeed']);
export const MANOR_ACTIVITY_GROUPS = Object.freeze({
  plant: ['plant', 'water', 'harvest', 'fertilize', 'pollinate', 'remove'],
  fish: ['beginCast', 'resolveCast', 'buyFry', 'place', 'placeShow', 'unplace', 'release'],
  resource: [
    'pickPoop',
    'pickBirdSeed',
    'claimDailyWater',
    'claimDailyWaterBonus',
    'claimAllDailyWater',
    'claimPurifier',
    'collect',
    'collectSlot',
    'collectCompost',
    'collectCraft',
    'claimLevelReward',
    'claimAllLevelRewards',
    'claimCollection',
    'claimSupply',
  ],
});

/** Safe, bounded facts derived inside the settlement transaction; never store client payloads. */
export function summarizeManorOperation(before, next, action, result) {
  const deltas = [];
  const add = (key, previous, current) => {
    const delta = Number(current || 0) - Number(previous || 0);
    if (Number.isSafeInteger(delta) && delta) deltas.push({ key, delta });
  };
  for (const key of ['water', 'bait', 'rainbowBait']) add(key, before[key], next[key]);
  add('freeCast', -(before.freeUsed || 0), -(next.freeUsed || 0));
  add('pollen', before.beehive?.pollen, next.beehive?.pollen);
  add('residue', before.composter?.residue, next.composter?.residue);
  add('compostStock', before.composter?.stock, next.composter?.stock);
  for (const [field, keys] of [
    ['seeds', Object.keys(M.CROPS)],
    ['crops', Object.keys(M.CROPS)],
    ['fertilizers', Object.keys(M.FERT)],
    ['craftedBait', Object.keys(M.BAIT_RECIPES)],
  ]) {
    for (const key of keys) add(`${field}:${key}`, before[field]?.[key], next[field]?.[key]);
  }
  const counts = (s) => {
    const map = {};
    for (const f of s.fish || []) if (Object.hasOwn(MANOR_SPECIES, f.kind)) map[f.kind] = (map[f.kind] || 0) + 1;
    return map;
  };
  const oldFish = counts(before),
    newFish = counts(next);
  for (const key of Object.keys(MANOR_SPECIES)) add(`fish:${key}`, oldFish[key], newFish[key]);
  for (const key of ['workshop', 'beehive', 'composter', 'purifier']) {
    add(`facility:${key}`, before[key] ? before[key].level || 1 : 0, next[key] ? next[key].level || 1 : 0);
  }
  const changed = Array.isArray(result) ? result.length > 0 : result != null && result !== false && result !== 0;
  return { effectful: !ignored.has(action) && changed, deltas };
}
