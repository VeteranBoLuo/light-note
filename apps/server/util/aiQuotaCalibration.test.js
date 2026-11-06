import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_INSTRUCTION,
  calibrationFixtures,
  calibrationText,
  calibrationManifestHash,
  compareCalibrationUsage,
} from './aiQuotaCalibration.js';
import { estimateTypedTextTokens, calibratedNoteOutputTokens } from './aiTokenEstimate.js';
import { estimateAiSkillReservationBudget } from './aiBillingCatalog.js';
import { estimateAiProviderTokens } from './agent/aiGateway.js';
import skill from './aiSkill/skills/noteTransformSkill.js';

describe('fixed synthetic reservation calibration', () => {
  it('covers 3k/8k/15k, four character styles, full and short outputs, and repeat processing without storing private content', async () => {
    const fixtures = calibrationFixtures();
    expect(fixtures).toHaveLength(15);
    expect(new Set(fixtures.map((row) => row.id)).size).toBe(15);
    expect(calibrationManifestHash()).toMatch(/^[a-f0-9]{64}$/);
    for (const fixture of fixtures) {
      const text = calibrationText(fixture.language, fixture.chars);
      expect(text).toHaveLength(fixture.chars);
      const input = skill.validateInput({ text, operation: fixture.operation, instruction: CALIBRATION_INSTRUCTION });
      const prepared = await skill.prepare({ input });
      const request = { skillId: skill.id, input };
      const budget = estimateAiSkillReservationBudget(skill, request, undefined, undefined, { calibrated: true });
      const providerBudget = estimateAiProviderTokens(
        prepared.messages,
        skill.resolveModelPolicy(input, { calibrated: true }),
        { calibrated: true },
      );
      expect(budget.totalTokens, fixture.id).toBeGreaterThanOrEqual(providerBudget);
      expect(budget.evidenceTokens).toBe(0);
      expect(budget.totalTokens).toBeLessThanOrEqual(120000);
    }
  });
  it('counts code punctuation, rare scripts and astral characters conservatively and preserves short-output caps', () => {
    expect(estimateTypedTextTokens('{}[]()')).toBe(6);
    expect(estimateTypedTextTokens('汉字')).toBe(3);
    expect(estimateTypedTextTokens('😀')).toBe(3);
    expect(calibratedNoteOutputTokens({ text: '长'.repeat(15000), operation: 'polish' })).toBeGreaterThan(8192);
    expect(calibratedNoteOutputTokens({ text: '长'.repeat(60000), operation: 'expand' })).toBe(32768);
    expect(calibratedNoteOutputTokens({ text: '长'.repeat(15000), operation: 'title' })).toBe(256);
  });
  it('separates missing usage and uses budget admission as well as actual charge for gift estimates', () => {
    const result = compareCalibrationUsage([
      {
        id: 'polish',
        operation: 'polish',
        round: 1,
        usageComplete: true,
        actualTokens: 20000,
        outputChars: 3000,
        chars: 3000,
        baselineReservedTokens: 30000,
        candidateReservedTokens: 40000,
      },
      { id: 'missing', usageComplete: false },
    ]);
    expect(result).toMatchObject({
      missingUsage: 1,
      providerTokens: 20000,
      registrationGiftSinglePass: [{ sampleId: 'polish', approximateNotes: 5 }],
    });
    expect(JSON.stringify(result)).not.toContain('text');
  });
});
