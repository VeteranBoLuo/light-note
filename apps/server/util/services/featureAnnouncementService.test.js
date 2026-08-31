import { describe, expect, it, vi } from 'vitest';
import {
  FeatureAnnouncementError,
  markFeatureAnnouncementSeen,
  preserveFeatureAnnouncementReads,
} from './featureAnnouncementService.js';

describe('featureAnnouncementService', () => {
  it('以账号偏好 JSON 原子记录当前公告版本，重复调用保持幂等', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };

    const result = await markFeatureAnnouncementSeen({
      userId: 'user-1',
      announcementId: 'knowledge-workshop',
      version: 'knowledge-workshop-v1',
      now: new Date('2026-09-01T00:00:00.000Z'),
      db,
    });

    expect(result).toMatchObject({ active: true, persisted: true, version: 'knowledge-workshop-v1' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('JSON_SET'), [
      '$.featureAnnouncements."knowledge-workshop"',
      'knowledge-workshop-v1',
      'user-1',
    ]);
  });

  it('公告失效后不再产生账号写入', async () => {
    const db = { query: vi.fn() };

    const result = await markFeatureAnnouncementSeen({
      userId: 'user-1',
      announcementId: 'knowledge-workshop',
      version: 'knowledge-workshop-v1',
      now: new Date('2026-09-14T16:00:00.000Z'),
      db,
    });

    expect(result).toMatchObject({ active: false, persisted: false });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('拒绝未知公告和过期客户端版本', async () => {
    const db = { query: vi.fn() };

    await expect(
      markFeatureAnnouncementSeen({ userId: 'user-1', announcementId: 'unknown', version: 'v1', db }),
    ).rejects.toMatchObject({ code: 'FEATURE_ANNOUNCEMENT_UNKNOWN', status: 400 });
    await expect(
      markFeatureAnnouncementSeen({
        userId: 'user-1',
        announcementId: 'knowledge-workshop',
        version: 'old-version',
        db,
      }),
    ).rejects.toBeInstanceOf(FeatureAnnouncementError);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('普通偏好整对象保存保留服务端已读版本，并忽略客户端伪造值', () => {
    const merged = JSON.parse(
      preserveFeatureAnnouncementReads(JSON.stringify({ theme: 'night', featureAnnouncements: { forged: 'v99' } }), {
        theme: 'day',
        featureAnnouncements: { 'knowledge-workshop': 'knowledge-workshop-v1' },
      }),
    );

    expect(merged).toEqual({
      theme: 'night',
      featureAnnouncements: { 'knowledge-workshop': 'knowledge-workshop-v1' },
    });
  });
});
