import { describe, expect, it, vi } from 'vitest';
import { normalizeAiProductEvent } from '../aiProductTelemetry.js';
import {
  aiSkillDurationBucket,
  aiSkillLengthBucket,
  aiSkillResourceCountBucket,
  buildAiSkillTelemetryDimensions,
  recordAiSkillTelemetry,
} from './telemetry.js';

describe('ai skill telemetry', () => {
  it.each([
    ['routine.daily_brief', 'routine', 'desktop_workbench'],
    ['toolbox.idea_to_draft', 'toolbox', 'toolbox'],
    ['community.review_screen', 'community', 'community_review'],
    ['organize.metadata', 'organize', 'organize_center'],
    ['tag.icon_keywords', 'tag', 'tag_icon_picker'],
  ])('%s 的合法入口维度能通过统一事件校验', (id, domain, surface) => {
    const dimensions = buildAiSkillTelemetryDimensions({
      skill: { id, domain },
      request: { requestId: 'request-1', input: {}, scope: { resourceRefs: [] }, client: { surface } },
      error: { code: 'AI_PROVIDER_ERROR' },
      durationMs: 200,
    });
    expect(normalizeAiProductEvent({ event: 'ai_skill_failed', dimensions })).toMatchObject({
      eventName: 'ai_skill_failed',
      dimensions: { skillId: id, surface, errorCode: 'AI_RUNTIME' },
    });
    expect(() =>
      normalizeAiProductEvent({
        event: 'ai_skill_failed',
        dimensions: { ...dimensions, surface: 'private arbitrary input' },
      }),
    ).toThrow();
  });

  it('只生成有界、无正文的 Skill 维度', () => {
    const dimensions = buildAiSkillTelemetryDimensions({
      skill: { id: 'note.batch_summarize', domain: 'note' },
      request: {
        requestId: 'request-1',
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
      requestId: 'request-1',
      measurementVersion: '2',
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

  it('同步抛出的埋点错误同样不影响主链路', async () => {
    await expect(
      recordAiSkillTelemetry({
        recorder: () => {
          throw new Error('failed');
        },
        identity: {},
        event: 'ai_skill_started',
        dimensions: {},
      }),
    ).resolves.toMatchObject({ skipped: true });
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
