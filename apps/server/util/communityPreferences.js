/** Private account navigation preference; never part of public community profiles. */
export function parseCommunityAccountPreferences(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readCommunityPreference(value) {
  const stored = parseCommunityAccountPreferences(value).communityNavigation;
  return {
    defaultView: stored?.defaultView === 'feed' ? 'feed' : 'chat',
    revision: Number.isSafeInteger(stored?.revision) && stored.revision >= 0 ? stored.revision : 0,
  };
}

// Old clients save the entire preferences JSON. Only the dedicated versioned API may change this field.
export function preserveCommunityPreference(incoming, persisted) {
  const next = parseCommunityAccountPreferences(incoming);
  const saved = parseCommunityAccountPreferences(persisted);
  if (Object.hasOwn(saved, 'communityNavigation')) next.communityNavigation = saved.communityNavigation;
  else delete next.communityNavigation;
  delete next.community_navigation;
  return JSON.stringify(next);
}

// Navigation is exposed only after the feed capability has verified its schema.
export function communityCapabilities(feedEnabled = false) {
  return { protocolVersion: 1, availableViews: feedEnabled ? ['chat', 'feed'] : ['chat'], feedEnabled };
}
