const ALLOWED_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

function count(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function text(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function normalizeSuspects(value) {
  return (Array.isArray(value) ? value : []).slice(0, 20).map((item) => ({
    id: text(item?.id, 128),
    name: text(item?.name, 255) || '未命名书签',
    url: text(item?.url, 2048),
    note: text(item?.note, 64),
    hasSnapshot: Boolean(item?.hasSnapshot),
    checkedAt: item?.checkedAt ? text(item.checkedAt, 80) : undefined,
  }));
}

export function createBookmarkHealthArtifact(summary = {}) {
  const running = summary.running === true;
  const total = count(summary.total);
  const checked = Math.min(total || count(summary.checked), count(summary.checked));
  const jobId = text(summary.runId, 128) || 'latest';
  const declaredStatus = text(summary.runStatus, 24);
  const status = ALLOWED_STATUSES.has(declaredStatus)
    ? declaredStatus
    : running
      ? 'running'
      : checked >= total
        ? 'succeeded'
        : 'queued';
  return {
    id: `bookmark-health:${jobId}`,
    kind: 'job',
    schemaVersion: 1,
    status,
    titleKey: 'ai.artifact.bookmarkHealth.title',
    generatedAt: new Date().toISOString(),
    revision: Math.max(1, count(summary.revision) || checked + 1),
    data: {
      jobType: 'bookmark_health',
      jobId,
      total,
      checked,
      alive: count(summary.alive),
      suspect: count(summary.suspectCount ?? summary.suspect?.length),
      unknown: count(summary.unknown),
      startedAt: summary.startedAt ? text(summary.startedAt, 80) : undefined,
      completedAt: summary.completedAt ? text(summary.completedAt, 80) : undefined,
      lastCheckedAt: summary.lastCheckedAt ? text(summary.lastCheckedAt, 80) : undefined,
      pollAfterMs: Math.min(10_000, Math.max(1_500, count(summary.pollAfterMs) || 2_500)),
      suspects: normalizeSuspects(summary.suspect),
    },
  };
}

export function normalizeAgentArtifacts(value) {
  const output = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || item.kind !== 'job' || item.schemaVersion !== 1 || item.data?.jobType !== 'bookmark_health') {
      continue;
    }
    const normalized = createBookmarkHealthArtifact({
      ...item.data,
      runId: item.data.jobId,
      running: item.status === 'running',
      revision: item.revision,
      suspect: item.data.suspects,
      suspectCount: item.data.suspect,
    });
    if (!ALLOWED_STATUSES.has(item.status)) continue;
    normalized.status = item.status;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    output.push(normalized);
    if (output.length >= 8) break;
  }
  return output;
}
