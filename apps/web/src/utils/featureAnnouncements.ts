import { FEATURE_ANNOUNCEMENTS, getFeatureAnnouncement, isFeatureAnnouncementActive } from '@lightnote/shared';

const FEATURE_ANNOUNCEMENT_STORAGE_PREFIX = 'light-note:feature-announcement';

export const KNOWLEDGE_WORKSHOP_ANNOUNCEMENT = FEATURE_ANNOUNCEMENTS.KNOWLEDGE_WORKSHOP;
export const KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID = KNOWLEDGE_WORKSHOP_ANNOUNCEMENT.id;

type AnnouncementPreferences = {
  featureAnnouncements?: Record<string, string>;
  [key: string]: unknown;
};

function normalizeOwnerKey(ownerKey: unknown) {
  const value = String(ownerKey || '').trim();
  return value || 'visitor';
}

export function featureAnnouncementStorageKey(announcementId: string, ownerKey: unknown) {
  const announcement = getFeatureAnnouncement(announcementId);
  const version = announcement?.version || 'unknown';
  return `${FEATURE_ANNOUNCEMENT_STORAGE_PREFIX}:${announcementId}:${version}:${normalizeOwnerKey(ownerKey)}`;
}

export function hasLocalFeatureAnnouncementSeen(announcementId: string, ownerKey: unknown = 'visitor') {
  const announcement = getFeatureAnnouncement(announcementId);
  if (!announcement || typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(featureAnnouncementStorageKey(announcementId, ownerKey)) === announcement.version
    );
  } catch {
    return false;
  }
}

export function markLocalFeatureAnnouncementSeen(announcementId: string, ownerKey: unknown = 'visitor') {
  const announcement = getFeatureAnnouncement(announcementId);
  if (!announcement || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(featureAnnouncementStorageKey(announcementId, ownerKey), announcement.version);
  } catch {
    // 隐私模式或存储配额异常不应阻断导航；下次进入时继续展示提示即可。
  }
}

export function featureAnnouncementSeenVersion(
  preferences: AnnouncementPreferences | null | undefined,
  announcementId: string,
) {
  const version = preferences?.featureAnnouncements?.[announcementId];
  return typeof version === 'string' ? version : '';
}

export function withFeatureAnnouncementSeen(
  preferences: AnnouncementPreferences | null | undefined,
  announcementId: string,
) {
  const announcement = getFeatureAnnouncement(announcementId);
  if (!announcement) return { ...(preferences || {}) };
  return {
    ...(preferences || {}),
    featureAnnouncements: {
      ...(preferences?.featureAnnouncements || {}),
      [announcement.id]: announcement.version,
    },
  };
}

export function shouldShowFeatureAnnouncement(options: {
  announcementId: string;
  guest: boolean;
  preferences?: AnnouncementPreferences | null;
  localOwnerKey?: unknown;
  guestOwnerKey?: unknown;
  now?: number | Date;
}) {
  const announcement = getFeatureAnnouncement(options.announcementId);
  if (!announcement || !isFeatureAnnouncementActive(announcement, options.now ?? Date.now())) return false;
  const localOwnerKey = options.localOwnerKey ?? options.guestOwnerKey ?? (options.guest ? 'visitor' : undefined);
  if (localOwnerKey && hasLocalFeatureAnnouncementSeen(announcement.id, localOwnerKey)) return false;
  if (options.guest) {
    return true;
  }
  return featureAnnouncementSeenVersion(options.preferences, announcement.id) !== announcement.version;
}

export function millisecondsUntilFeatureAnnouncementBoundary(announcementId: string, now: number | Date = Date.now()) {
  const announcement = getFeatureAnnouncement(announcementId);
  if (!announcement) return 0;
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  const publishedAt = Date.parse(announcement.publishedAt);
  const expiresAt = Date.parse(announcement.expiresAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(publishedAt) || !Number.isFinite(expiresAt)) return 0;
  if (timestamp < publishedAt) return publishedAt - timestamp;
  if (timestamp < expiresAt) return expiresAt - timestamp;
  return 0;
}
