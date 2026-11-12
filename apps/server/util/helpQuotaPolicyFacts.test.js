import { describe, expect, it } from 'vitest';
import { parseHelpPolicyTarget, selectHelpPolicyFacts, assertHelpPolicyFacts } from './helpQuotaPolicyFacts.js';
import { buildHelpKnowledgeRefreshEntries } from './helpKnowledgeRefreshContent.js';
import { knowledgeMaintenanceHash } from './knowledgeMaintenancePlan.js';
import { AI_LEVEL_GIFT_VERSIONS, RANKS } from './growth.js';
import { ECONOMY_CATALOGS } from './pointsEconomyCatalog.js';
const facts = {
  billingMode: 'daily_and_permanent',
  economyVersion: 'points-economy-c10',
  giftVersion: 'ai-level-gifts-v1',
  levelGiftMode: 'off',
  platformDailyBrief: false,
  levelGifts: [...AI_LEVEL_GIFT_VERSIONS[0].tokens],
  guestQuota: 50000,
  ranks: RANKS,
  galaxyFrame: { cost: 520, minLevel: 10 },
  makeupWindowDays: 3,
};
const target = {
  billingMode: 'permanent_only',
  economyVersion: 'points-economy-c11',
  giftVersion: 'ai-level-gifts-v1',
  guestQuota: 0,
};
const resolved = () =>
  selectHelpPolicyFacts(facts, target, { catalogs: ECONOMY_CATALOGS, schedules: AI_LEVEL_GIFT_VERSIONS });
describe('target help facts', () => {
  it('prepares future facts without changing active runtime and requires the complete explicit target', () => {
    expect(parseHelpPolicyTarget([])).toBeNull();
    expect(() => parseHelpPolicyTarget(['--target-billing-mode=permanent_only'])).toThrow('HELP_TARGET_INCOMPLETE');
    expect(
      parseHelpPolicyTarget([
        '--target-billing-mode=permanent_only',
        '--target-economy-version=points-economy-c11',
        '--target-gift-version=ai-level-gifts-v1',
        '--target-guest-quota=0',
      ]),
    ).toEqual(target);
    expect(resolved()).toMatchObject({ ...target, levelGiftMode: 'on', platformDailyBrief: true });
    expect(facts.billingMode).toBe('daily_and_permanent');
    expect(() =>
      selectHelpPolicyFacts(
        facts,
        { ...target, giftVersion: 'unknown' },
        { catalogs: ECONOMY_CATALOGS, schedules: AI_LEVEL_GIFT_VERSIONS },
      ),
    ).toThrow('HELP_TARGET_UNSUPPORTED');
  });
  it('renders the fixed 419w schedule, no reset or guest allowance promise, preserves old title matching', () => {
    const entries = buildHelpKnowledgeRefreshEntries(resolved());
    const faq = entries.find((item) => item.key === 'quota-faq');
    expect(faq.content).toContain('419 万 tokens');
    expect(faq.content).toContain('12 万 tokens');
    expect(faq.matchTitles).toContain('AI 额度每天多少：每日等级额度与永久余额');
    expect(entries.some((entry) => entry.content.includes('等待每日周期重置'))).toBe(false);
    expect(entries.some((entry) => entry.content.includes('游客公开 AI 能力当前按设备每日'))).toBe(false);
    expect(entries.find((item) => item.key === 'entitlements').content).toContain('85 万 tokens | 419 万 tokens');
    expect(buildHelpKnowledgeRefreshEntries(facts).find((item) => item.key === 'quota-faq').content).toContain(
      '每日周期重置',
    );
  });
  it('apply/verify require target runtime facts and restore requires the previous runtime facts', () => {
    const prepared = resolved();
    const plan = { targetFacts: prepared, previousFacts: facts, factsHash: knowledgeMaintenanceHash(prepared) };
    expect(() => assertHelpPolicyFacts(plan, facts)).toThrow('KNOWLEDGE_PLAN_OUTDATED');
    expect(() => assertHelpPolicyFacts(plan, prepared)).not.toThrow();
    expect(() => assertHelpPolicyFacts(plan, { ...prepared, economyVersion: 'points-economy-c10' })).toThrow(
      'KNOWLEDGE_PLAN_OUTDATED',
    );
    expect(() => assertHelpPolicyFacts(plan, prepared, { restore: true })).toThrow('KNOWLEDGE_PLAN_OUTDATED');
    expect(() => assertHelpPolicyFacts(plan, facts, { restore: true })).not.toThrow();
  });
});
