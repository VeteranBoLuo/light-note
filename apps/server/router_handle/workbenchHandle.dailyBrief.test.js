import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshDailyBrief, query } = vi.hoisted(() => ({ refreshDailyBrief: vi.fn(), query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, msg = '') => ({ data, status, msg }) }));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: () => true }));
vi.mock('../util/obsClient.js', () => ({ buildObjectUrl: vi.fn(), createDownloadSignedUrl: vi.fn() }));
vi.mock('../util/services/dailyBriefService.js', () => ({
  refreshDailyBrief,
  ensureDailyBrief: vi.fn(),
  getDailyBrief: vi.fn(),
  getDailyBriefPreference: vi.fn(),
  updateDailyBriefPreference: vi.fn(),
}));
import { refreshWorkbenchDailyBrief } from './workbenchHandle.js';

describe('每日简报失败诊断', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      { reason: 'TEXT_TOO_LONG', field: 'insights[0].text', actualLength: 240, maxLength: 220 },
      'TEXT_TOO_LONG',
      'insights[0].text',
    ],
    [
      { reason: 'PRIVATE_REASON', field: 'private-resource-title', actualLength: 'private-value' },
      'UNCLASSIFIED',
      'unknown',
    ],
  ])('只记录白名单元信息，不输出草稿、标题或完整错误', async (metadata, reason, field) => {
    const error = Object.assign(new Error('private model text'), {
      code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID',
      status: 502,
      details: {
        ...metadata,
        invalidText: 'private draft',
        invalidDraft: { headline: 'secret title' },
        numericLiterals: ['private-number'],
        fieldIssues: [{ field: 'headline', numericLiterals: ['secret-number'] }],
      },
    });
    refreshDailyBrief.mockRejectedValueOnce(error);
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    try {
      await refreshWorkbenchDailyBrief({ user: { id: 'test-owner', role: 'user' } }, res);
      expect(logger).toHaveBeenCalledWith(expect.any(String), error.code, reason, field, expect.any(String));
      expect(JSON.stringify(logger.mock.calls)).not.toMatch(/private|secret/iu);
      expect(JSON.stringify(res.send.mock.calls)).not.toMatch(/private|secret/iu);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(query).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });
});
