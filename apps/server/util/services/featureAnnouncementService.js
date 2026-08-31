import { getFeatureAnnouncement, isFeatureAnnouncementActive } from '@lightnote/shared';
import pool from '../../db/index.js';

export class FeatureAnnouncementError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'FeatureAnnouncementError';
    this.code = code;
    this.status = status;
  }
}

function parsePreferences(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function announcementReads(preferences) {
  const reads = parsePreferences(preferences).featureAnnouncements;
  return reads && typeof reads === 'object' && !Array.isArray(reads) ? reads : {};
}

export function preserveFeatureAnnouncementReads(incomingPreferences, persistedPreferences) {
  const next = parsePreferences(incomingPreferences);
  const persistedReads = announcementReads(persistedPreferences);

  // 已读版本只允许由专用幂等接口推进。普通偏好保存不得清空，也不得伪造该服务端事实。
  if (Object.keys(persistedReads).length) {
    next.featureAnnouncements = { ...persistedReads };
  } else {
    delete next.featureAnnouncements;
  }
  delete next.feature_announcements;
  return JSON.stringify(next);
}

export async function markFeatureAnnouncementSeen({ userId, announcementId, version, now = Date.now(), db = pool }) {
  if (!String(userId || '').trim()) {
    throw new FeatureAnnouncementError('FEATURE_ANNOUNCEMENT_USER_REQUIRED', 401);
  }
  const announcement = getFeatureAnnouncement(announcementId);
  if (!announcement) throw new FeatureAnnouncementError('FEATURE_ANNOUNCEMENT_UNKNOWN', 400);
  if (String(version || '') !== announcement.version) {
    throw new FeatureAnnouncementError('FEATURE_ANNOUNCEMENT_VERSION_STALE', 409);
  }

  if (!isFeatureAnnouncementActive(announcement, now)) {
    return {
      announcementId: announcement.id,
      version: announcement.version,
      active: false,
      persisted: false,
    };
  }

  const jsonPath = `$.featureAnnouncements."${announcement.id}"`;
  const [result] = await db.query(
    `UPDATE user
        SET preferences = JSON_SET(COALESCE(preferences, JSON_OBJECT()), ?, ?)
      WHERE id = ? AND del_flag = 0`,
    [jsonPath, announcement.version, userId],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    throw new FeatureAnnouncementError('FEATURE_ANNOUNCEMENT_USER_NOT_FOUND', 404);
  }

  return {
    announcementId: announcement.id,
    version: announcement.version,
    active: true,
    persisted: true,
  };
}
