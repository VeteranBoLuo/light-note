export interface AiTagSelectionState {
  selectedIds: string[];
  aiSelectedIds: string[];
  changed: boolean;
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}

export function replaceSessionAiTagSelection({
  currentIds,
  previousAiIds,
  incomingAiIds,
  cap,
}: {
  currentIds: string[];
  previousAiIds: string[];
  incomingAiIds: string[];
  cap: number;
}): AiTagSelectionState {
  const previous = new Set(uniqueIds(previousAiIds));
  const current = uniqueIds(currentIds);
  const preserved = current.filter((id) => !previous.has(id));
  const incoming = uniqueIds(incomingAiIds);
  const selectedIds = uniqueIds([...preserved, ...incoming]).slice(0, cap);
  const aiSelectedIds = incoming.filter((id) => selectedIds.includes(id) && !preserved.includes(id));
  const changed = selectedIds.length !== current.length || selectedIds.some((id, index) => id !== current[index]);
  return { selectedIds, aiSelectedIds, changed };
}

export function appendSessionAiTagSelection({
  currentIds,
  previousAiIds,
  incomingAiIds,
  cap,
}: {
  currentIds: string[];
  previousAiIds: string[];
  incomingAiIds: string[];
  cap: number;
}): AiTagSelectionState {
  const current = uniqueIds(currentIds);
  const incoming = uniqueIds(incomingAiIds);
  const selectedIds = uniqueIds([...current, ...incoming]).slice(0, cap);
  const added = incoming.filter((id) => selectedIds.includes(id) && !current.includes(id));
  const aiSelectedIds = uniqueIds([...previousAiIds, ...added]).filter((id) => selectedIds.includes(id));
  const changed = selectedIds.length !== current.length || selectedIds.some((id, index) => id !== current[index]);
  return { selectedIds, aiSelectedIds, changed };
}
