import { describe, expect, it, vi } from 'vitest';
import {
  createPointsCampaign,
  getPointsCampaignRuntime,
  normalizeCampaignAudience,
  pointsCampaignInternals,
  previewPointsCampaign,
} from './pointsCampaignService.js';

describe('C5 活动积分受众与预览', () => {
  it('安全上限缺失或非法时失败关闭', () => {
    expect(getPointsCampaignRuntime({ POINTS_CAMPAIGN_ENABLED: 'true' })).toMatchObject({
      enabled: true,
      ready: false,
    });
    expect(
      getPointsCampaignRuntime({
        POINTS_CAMPAIGN_ENABLED: 'true',
        POINTS_CAMPAIGN_MAX_RECIPIENTS: '500',
        POINTS_CAMPAIGN_MAX_POINTS_PER_USER: '1000',
        POINTS_CAMPAIGN_MAX_TOTAL_POINTS: '500000',
      }),
    ).toMatchObject({ enabled: true, ready: true, maxRecipients: 500, maxPointsPerUser: 1000 });
  });

  it('禁止隐式全量、范围反转和空受众', () => {
    expect(() => normalizeCampaignAudience({})).toThrowError(
      expect.objectContaining({ code: 'CAMPAIGN_AUDIENCE_CONFIRMATION_REQUIRED' }),
    );
    expect(() => normalizeCampaignAudience({ registeredFrom: '2026-08-15', registeredTo: '2026-08-01' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CAMPAIGN_AUDIENCE' }),
    );
    expect(normalizeCampaignAudience({ allRegisteredUsers: true })).toMatchObject({
      allRegisteredUsers: true,
      explicitUserIds: [],
    });
  });

  it('受众查询固定排除 Root、游客、注销与安全封禁账号，并限制结果量', () => {
    const audience = normalizeCampaignAudience({
      explicitUserIds: ['user-1', 'user-1', 'root'],
      minLevel: 3,
      maxPoints: 5000,
    });
    const query = pointsCampaignInternals.audienceQuery(audience, { limit: 101 });
    expect(audience.explicitUserIds).toEqual(['root', 'user-1']);
    expect(query.sql).toContain("COALESCE(u.role, 'user') = 'user'");
    expect(query.sql).toContain("u.id <> 'visitor'");
    expect(query.sql).toContain('u.del_flag = 0');
    expect(query.sql).toContain('security_account_bans');
    expect(query.sql).toContain('LIMIT 101');
    expect(query.params).toEqual(['root', 'user-1', 3, 5000]);
  });

  it('预览只返回脱敏样本并计算冻结前后的余额分位数', () => {
    const result = pointsCampaignInternals.campaignPreviewFromCandidates(
      { publicId: 'pc_test', pointsPerUser: 100 },
      [
        { userId: 'user-a', alias: '菠萝', level: 5, points: 100 },
        { userId: 'user-b', alias: '轻笺', level: 8, points: 300 },
      ],
      { maxRecipients: 10, maxPointsPerUser: 1000, maxTotalPoints: 10000 },
    );
    expect(result).toMatchObject({ recipientCount: 2, totalPoints: 200, includesRoot: false, exceedsLimits: false });
    expect(result.balanceDistribution).toEqual({
      before: { p50: 100, p90: 300, maximum: 300 },
      after: { p50: 200, p90: 400, maximum: 400 },
    });
    expect(result.sample[0]).not.toHaveProperty('userId');
    expect(result.sample[0]).toMatchObject({ alias: '菠***', level: 5, points: 100 });
  });

  it('预览只更新活动状态，不产生积分流水或余额写入', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 8,
            publicId: 'pc_preview',
            name: '预览活动',
            status: 'draft',
            pointsPerUser: 50,
            audienceJson: JSON.stringify(normalizeCampaignAudience({ allRegisteredUsers: true })),
            reasonCode: 'community_event',
            reason: '社区活动测试',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ userId: 'user-1', alias: '甲', level: 3, points: 100 }]])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const runtime = {
      enabled: true,
      ready: true,
      maxRecipients: 100,
      maxPointsPerUser: 1000,
      maxTotalPoints: 100000,
    };

    await expect(previewPointsCampaign('pc_preview', { db: { query }, runtime })).resolves.toMatchObject({
      status: 'previewed',
      recipientCount: 1,
      totalPoints: 50,
    });
    expect(query.mock.calls.some(([sql]) => /points_log|UPDATE\s+user_growth/iu.test(String(sql)))).toBe(false);
    expect(String(query.mock.calls.at(-1)[0])).toContain("SET status = 'previewed'");
  });

  it('创建草稿复用请求编号时只返回原活动，且拒绝同编号承载不同负载', async () => {
    let insertCount = 0;
    let storedHash = '';
    let storedPublicId = '';
    const query = vi.fn(async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('INSERT INTO points_campaigns')) {
        insertCount += 1;
        if (insertCount === 1) {
          storedPublicId = String(params[0]);
          storedHash = String(params.at(-1));
        }
        return [{ affectedRows: insertCount === 1 ? 1 : 0 }];
      }
      if (statement.includes('WHERE created_by = ? AND create_request_id = ?')) {
        return [[{ publicId: storedPublicId, payloadHash: storedHash }]];
      }
      if (statement.includes('FROM points_campaigns') && statement.includes('WHERE public_id = ?')) {
        return [
          [
            {
              id: 9,
              publicId: storedPublicId,
              name: '周年感谢礼',
              status: 'draft',
              pointsPerUser: 100,
              audienceJson: JSON.stringify(normalizeCampaignAudience({ allRegisteredUsers: true })),
              recipientCount: 0,
              deliveredCount: 0,
              failedCount: 0,
              totalPoints: 0,
              reasonCode: 'anniversary',
              reason: '周年活动感谢用户',
              createdBy: 'root',
            },
          ],
        ];
      }
      if (statement.includes('SELECT status, COUNT(*)')) return [[]];
      if (statement.includes('SELECT user_id AS userId')) return [[]];
      throw new Error(`unexpected query: ${statement}`);
    });
    const runtime = {
      enabled: true,
      ready: true,
      maxRecipients: 100,
      maxPointsPerUser: 1000,
      maxTotalPoints: 100000,
    };
    const input = {
      name: '周年感谢礼',
      pointsPerUser: 100,
      audience: { allRegisteredUsers: true },
      reasonCode: 'anniversary',
      reason: '周年活动感谢用户',
    };
    const options = { actorUserId: 'root', requestId: 'campaign-request-001', db: { query }, runtime };

    await expect(createPointsCampaign(input, options)).resolves.toMatchObject({
      campaign: { publicId: storedPublicId },
      idempotent: false,
    });
    await expect(createPointsCampaign(input, options)).resolves.toMatchObject({
      campaign: { publicId: storedPublicId },
      idempotent: true,
    });
    await expect(createPointsCampaign({ ...input, pointsPerUser: 101 }, options)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      status: 409,
    });
    expect(insertCount).toBe(3);
  });
});
