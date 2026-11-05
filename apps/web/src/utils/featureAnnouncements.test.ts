import { beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_ANNOUNCEMENTS } from '@lightnote/shared';
import {
  featureAnnouncementSeenVersion,
  featureAnnouncementStorageKey,
  hasLocalFeatureAnnouncementSeen,
  markLocalFeatureAnnouncementSeen,
  shouldShowFeatureAnnouncement,
  withFeatureAnnouncementSeen,
} from './featureAnnouncements';

const ANNOUNCEMENT_ID = FEATURE_ANNOUNCEMENTS.ANNUAL_REPORT_2026.id;

describe('功能上新提示', () => {
  beforeEach(() => localStorage.clear());

  it('游客按公告版本和本地身份隔离已读状态', () => {
    markLocalFeatureAnnouncementSeen(ANNOUNCEMENT_ID, 'visitor-a');

    expect(hasLocalFeatureAnnouncementSeen(ANNOUNCEMENT_ID, 'visitor-a')).toBe(true);
    expect(hasLocalFeatureAnnouncementSeen(ANNOUNCEMENT_ID, 'visitor-b')).toBe(false);
    expect(featureAnnouncementStorageKey(ANNOUNCEMENT_ID, 'visitor-a')).toContain('annual-report-2026-v1');
  });

  it('登录账号只认服务端偏好中的当前已读版本', () => {
    const preferences = withFeatureAnnouncementSeen({ theme: 'day' }, ANNOUNCEMENT_ID);

    expect(featureAnnouncementSeenVersion(preferences, ANNOUNCEMENT_ID)).toBe('annual-report-2026-v1');
    expect(
      shouldShowFeatureAnnouncement({
        announcementId: ANNOUNCEMENT_ID,
        guest: false,
        preferences,
        now: new Date('2026-12-20T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('登录账号在当前设备已读后，即使服务端回写暂时失败，刷新也不恢复提示', () => {
    markLocalFeatureAnnouncementSeen(ANNOUNCEMENT_ID, 'device-a');

    expect(
      shouldShowFeatureAnnouncement({
        announcementId: ANNOUNCEMENT_ID,
        guest: false,
        preferences: {},
        localOwnerKey: 'device-a',
        now: new Date('2026-12-20T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('超过绝对失效时间后，新老用户都不再看到提示', () => {
    expect(
      shouldShowFeatureAnnouncement({
        announcementId: ANNOUNCEMENT_ID,
        guest: false,
        preferences: {},
        now: new Date('2027-01-31T16:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      shouldShowFeatureAnnouncement({
        announcementId: ANNOUNCEMENT_ID,
        guest: true,
        now: new Date('2027-01-31T16:00:00.000Z'),
      }),
    ).toBe(false);
  });
});
