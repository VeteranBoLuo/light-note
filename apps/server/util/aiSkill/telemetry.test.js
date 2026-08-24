import { describe, expect, it, vi } from 'vitest';
import {
  aiSkillDurationBucket,
  aiSkillLengthBucket,
  aiSkillResourceCountBucket,
  buildAiSkillTelemetryDimensions,
  recordAiSkillTelemetry,
} from './telemetry.js';

describe('ai skill telemetry', () => {
  it('只生成有界、无正文的 Skill 维度', () => {
    const dimensions = buildAiSkillTelemetryDimensions({
      skill: { id: 'note.batch_summarize', domain: 'note' },
      request: {
        input: { instruction: 'private body' },
        scope: {
          resourceRefs: [
            { type: 'note', id: 'secret-id' },
            { type: 'note', id: 'second-id' },
          ],
        },
        client: { surface: 'note_library' },
      },
      response: { result: { content: 'private output' } },
      durationMs: 1_500,
    });
    expect(dimensions).toEqual({
      skillId: 'note.batch_summarize',
      surface: 'note_library',
      resourceType: 'note',
      resourceCountBucket: '2_5',
      inputLengthBucket: '1_50',
      outputLengthBucket: '1_50',
      durationBucket: '1_3s',
    });
    expect(JSON.stringify(dimensions)).not.toContain('private');
    expect(JSON.stringify(dimensions)).not.toContain('secret-id');
  });

  it('覆盖数量、长度和耗时边界', () => {
    expect([0, 1, 2, 6, 11, 21].map(aiSkillResourceCountBucket)).toEqual(['0', '1', '2_5', '6_10', '11_20', '21_plus']);
    expect([0, 1, 51, 201, 501].map(aiSkillLengthBucket)).toEqual(['0', '1_50', '51_200', '201_500', '501_plus']);
    expect([0, 1_500, 4_000, 15_000, 60_000, 130_000].map(aiSkillDurationBucket)).toEqual([
      'under_1s',
      '1_3s',
      '3_10s',
      '10_30s',
      '30_120s',
      '120s_plus',
    ]);
  });

  it('埋点失败只记录稳定错误码，不影响 Skill 主链路', async () => {
    const recorder = vi.fn().mockRejectedValue(Object.assign(new Error('secret database detail'), { code: 'ER_DOWN' }));
    await expect(
      recordAiSkillTelemetry({ recorder, identity: {}, event: 'ai_skill_failed', dimensions: {} }),
    ).resolves.toMatchObject({ skipped: true });
  });
});
