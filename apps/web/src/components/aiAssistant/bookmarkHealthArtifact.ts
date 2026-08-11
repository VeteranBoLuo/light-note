import type { AiArtifact, AiArtifactStatus, AiBookmarkHealthSuspectItem } from '@/types/aiArtifact';

function count(value: unknown) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : 0;
}

export function createBookmarkHealthArtifactFromSummary(summary: any): AiArtifact {
  const total = count(summary?.total);
  const checked = count(summary?.checked);
  const runStatus = String(summary?.runStatus || '');
  const status: AiArtifactStatus = summary?.running
    ? 'running'
    : runStatus === 'failed'
      ? 'failed'
      : checked >= total
        ? 'succeeded'
        : 'queued';
  const jobId = String(summary?.runId || 'latest');
  const suspects: AiBookmarkHealthSuspectItem[] = (Array.isArray(summary?.suspect) ? summary.suspect : [])
    .slice(0, 20)
    .map((item: any) => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      url: String(item?.url || ''),
      note: String(item?.note || ''),
      hasSnapshot: Boolean(item?.hasSnapshot),
      checkedAt: item?.checkedAt ? String(item.checkedAt) : undefined,
    }));
  return {
    id: `bookmark-health:${jobId}`,
    kind: 'job',
    schemaVersion: 1,
    status,
    titleKey: 'ai.artifact.bookmarkHealth.title',
    generatedAt: new Date().toISOString(),
    revision: Math.max(1, checked + 1),
    data: {
      jobType: 'bookmark_health',
      jobId,
      total,
      checked,
      alive: count(summary?.alive),
      suspect: count(summary?.suspectCount ?? suspects.length),
      unknown: count(summary?.unknown),
      startedAt: summary?.startedAt ? String(summary.startedAt) : undefined,
      completedAt: summary?.completedAt ? String(summary.completedAt) : undefined,
      lastCheckedAt: summary?.lastCheckedAt ? String(summary.lastCheckedAt) : undefined,
      pollAfterMs: Math.min(10_000, Math.max(1_500, count(summary?.pollAfterMs) || 2_500)),
      suspects,
    },
  };
}
