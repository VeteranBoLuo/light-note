import { knowledgeMaintenanceHash } from './knowledgeMaintenancePlan.js';

export function parseHelpPolicyTarget(args) {
  const prefixes = [
    '--target-billing-mode=',
    '--target-economy-version=',
    '--target-gift-version=',
    '--target-guest-quota=',
  ];
  const values = prefixes.map((prefix) => args.filter((arg) => arg.startsWith(prefix)));
  if (values.some((matches) => matches.length > 1)) throw new Error('HELP_TARGET_INVALID');
  if (values.every((matches) => matches.length === 0)) return null;
  if (values.some((matches) => matches.length !== 1)) throw new Error('HELP_TARGET_INCOMPLETE');
  const [billingMode, economyVersion, giftVersion, guest] = values.map((matches, i) =>
    matches[0].slice(prefixes[i].length),
  );
  if (!['permanent_only', 'daily_and_permanent'].includes(billingMode) || !/^\d+$/.test(guest))
    throw new Error('HELP_TARGET_INVALID');
  const guestQuota = Number(guest);
  if (!Number.isSafeInteger(guestQuota) || guestQuota < 0 || (billingMode === 'permanent_only' && guestQuota !== 0))
    throw new Error('HELP_TARGET_INVALID');
  return { billingMode, economyVersion, giftVersion, guestQuota };
}
export function selectHelpPolicyFacts(current, target, { catalogs, schedules }) {
  if (!target) return current;
  const catalog = catalogs[target.economyVersion];
  const schedule = schedules.find((item) => item.version === target.giftVersion);
  if (!catalog || !schedule || (target.billingMode === 'permanent_only' && catalog.version !== 'points-economy-c11'))
    throw new Error('HELP_TARGET_UNSUPPORTED');
  const frame = catalog.frameItems.find((item) => item.id === 'frame_galaxy');
  return {
    ...current,
    ...target,
    levelGifts: [...schedule.tokens],
    levelGiftMode: target.billingMode === 'permanent_only' ? 'on' : current.levelGiftMode,
    platformDailyBrief: target.billingMode === 'permanent_only' || current.platformDailyBrief,
    galaxyFrame: frame && { cost: frame.cost, minLevel: frame.minLevel },
  };
}
export function assertHelpPolicyFacts(plan, facts, { restore = false } = {}) {
  const expected = restore ? plan.previousFacts : plan.targetFacts;
  if (expected && knowledgeMaintenanceHash(expected) !== knowledgeMaintenanceHash(facts))
    throw new Error('KNOWLEDGE_PLAN_OUTDATED');
  if (!restore && knowledgeMaintenanceHash(facts) !== plan.factsHash) throw new Error('KNOWLEDGE_PLAN_OUTDATED');
}
