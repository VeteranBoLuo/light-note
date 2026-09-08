export function preferences(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
export function preserveWorkshopPreference(incoming, persisted) {
  const next = { ...preferences(incoming) };
  const saved = preferences(persisted);
  if (saved.workshopIntroDismissed === true) next.workshopIntroDismissed = true;
  else delete next.workshopIntroDismissed;
  return JSON.stringify(next);
}
