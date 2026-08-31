import { beforeEach, describe, expect, it } from 'vitest';
import {
  featureAnnouncementSeenVersion,
  featureAnnouncementStorageKey,
  hasLocalFeatureAnnouncementSeen,
  KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
  markLocalFeatureAnnouncementSeen,
  shouldShowFeatureAnnouncement,
  withFeatureAnnouncementSeen,
} from './featureAnnouncements';

describe('功能上新提示', () => {
  beforeEach(() => localStorage.clear());

  it('游客按公告版本和本地身份隔离已读状态', () => {
    markLocalFeatureAnnouncementSeen(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'visitor-a');

    expect(hasLocalFeatureAnnouncementSeen(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'visitor-a')).toBe(true);
    expect(hasLocalFeatureAnnouncementSeen(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'visitor-b')).toBe(false);
    expect(featureAnnouncementStorageKey(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'visitor-a')).toContain(
      'knowledge-workshop-v1',
    );
  });

  it('登录账号只认服务端偏好中的当前已读版本', () => {
    const preferences = withFeatureAnnouncementSeen({ theme: 'day' }, KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID);

    expect(featureAnnouncementSeenVersion(preferences, KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID)).toBe(
      'knowledge-workshop-v1',
    );
    expect(
      shouldShowFeatureAnnouncement({
        announcementId: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
        guest: false,
        preferences,
        now: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('登录账号在当前设备已读后，即使服务端回写暂时失败，刷新也不恢复提示', () => {
    markLocalFeatureAnnouncementSeen(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, 'device-a');

    expect(
      shouldShowFeatureAnnouncement({
        announcementId: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
        guest: false,
        preferences: {},
        localOwnerKey: 'device-a',
        now: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('超过绝对失效时间后，新老用户都不再看到提示', () => {
    expect(
      shouldShowFeatureAnnouncement({
        announcementId: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
        guest: false,
        preferences: {},
        now: new Date('2026-09-14T16:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      shouldShowFeatureAnnouncement({
        announcementId: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
        guest: true,
        now: new Date('2026-09-14T16:00:00.000Z'),
      }),
    ).toBe(false);
  });
});
