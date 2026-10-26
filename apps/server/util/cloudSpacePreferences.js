function parse(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

export function readCloudSpacePreference(value) {
  return { includeDescendants: parse(value).cloudIncludeDescendants === true };
}

export function mergeCloudSpacePreference(value, includeDescendants) {
  return JSON.stringify({ ...parse(value), cloudIncludeDescendants: includeDescendants });
}

// Full-object saves from older clients must never overwrite this independently saved preference.
export function preserveCloudSpacePreference(incoming, persisted) {
  const next = parse(incoming);
  const saved = parse(persisted);
  if (Object.hasOwn(saved, 'cloudIncludeDescendants')) next.cloudIncludeDescendants = saved.cloudIncludeDescendants;
  else delete next.cloudIncludeDescendants;
  delete next.cloud_include_descendants;
  return JSON.stringify(next);
}
