import { describe, it, expect } from 'vitest';
import skill, { validatePublicReviewArguments, validatePublicReviewInput } from './publicResourceReviewSkill.js';
import { createAiSkillExecutionConfig } from '../../aiBillingCatalog.js';
const input = { kind: 'note', title: '长文', body: '字'.repeat(30000), url: '', description: '' };
const result = {
  decision: 'hold',
  categories: ['uncertain'],
  reason: '需要进一步核对',
  evidence: [{ paragraph: 2, quote: '字字' }],
};
describe('public resource AI precheck', () => {
  it('takes the full long material and has no private-resource context or external tools', async () => {
    expect(validatePublicReviewInput(input).body).toHaveLength(30000);
    const prepared = await skill.prepare({ input });
    expect(JSON.parse(prepared.messages[1].content).paragraphs[1].text).toHaveLength(30000);
    expect(prepared.sources).toEqual([]);
    expect(prepared.availableActions).toEqual([]);
    expect(skill.internalOnly).toBe(true);
    expect(skill.allowedInternalCallers).toEqual(['public_resource_review_worker']);
    expect(() => createAiSkillExecutionConfig(skill, { input, scope: { resourceRefs: [] } })).toThrow();
    expect(
      createAiSkillExecutionConfig(
        skill,
        { input, scope: { resourceRefs: [] } },
        { billingPolicy: 'system', systemId: 'public_resource_review' },
      ).billingPolicy,
    ).toBe('system');
  });
  it('validates evidence against numbered original paragraphs', () => {
    expect(validatePublicReviewArguments(result, input).evidence).toEqual(result.evidence);
    for (const evidence of [
      [{ paragraph: 3, quote: '字' }],
      [{ paragraph: 2, quote: '不存在' }],
      [{ paragraph: 0, quote: '长文' }],
    ])
      expect(() => validatePublicReviewArguments({ ...result, evidence }, input)).toThrow('公开资源检查结果不符合协议');
  });
  it('rejects confidence fields, auto-reject decisions, missing input and invalid pass categories', () => {
    expect(() => validatePublicReviewArguments({ ...result, confidence: 0.99 }, input)).toThrow();
    expect(() => validatePublicReviewArguments({ ...result, decision: 'reject' }, input)).toThrow();
    expect(() => validatePublicReviewArguments({ ...result, decision: 'pass' }, input)).toThrow();
    expect(() => validatePublicReviewInput({ ...input, owner: 'other' })).toThrow();
    expect(() => validatePublicReviewInput({ ...input, body: '字'.repeat(30001) })).toThrow();
  });
});
