export type AiArtifactStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AiBookmarkHealthSuspectItem {
  id: string;
  name: string;
  url: string;
  note?: string;
  hasSnapshot: boolean;
  checkedAt?: string;
}

export interface AiBookmarkHealthJobData {
  jobType: 'bookmark_health';
  jobId: string;
  total: number;
  checked: number;
  alive: number;
  suspect: number;
  unknown: number;
  startedAt?: string;
  completedAt?: string;
  lastCheckedAt?: string;
  pollAfterMs: number;
  suspects: AiBookmarkHealthSuspectItem[];
}

export interface AiJobArtifact {
  id: string;
  kind: 'job';
  schemaVersion: 1;
  status: AiArtifactStatus;
  titleKey: string;
  generatedAt: string;
  revision: number;
  data: AiBookmarkHealthJobData;
}

export type AiArtifact = AiJobArtifact;

const ARTIFACT_STATUSES = new Set<AiArtifactStatus>(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

function safeText(value: unknown, maxLength: number) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function safeCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function isAiArtifact(value: unknown): value is AiArtifact {
  if (!value || typeof value !== 'object') return false;
  const artifact = value as Partial<AiArtifact>;
  return (
    artifact.kind === 'job' &&
    artifact.schemaVersion === 1 &&
    typeof artifact.id === 'string' &&
    Boolean(artifact.id) &&
    artifact.data?.jobType === 'bookmark_health'
  );
}

export function normalizeAiArtifacts(value: unknown): AiArtifact[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, AiArtifact>();
  for (const item of value) {
    if (!isAiArtifact(item)) continue;
    const rawData = item.data as Partial<AiBookmarkHealthJobData>;
    const jobId = safeText(rawData.jobId, 128) || 'latest';
    const id = `bookmark-health:${jobId}`;
    const status = ARTIFACT_STATUSES.has(item.status) ? item.status : 'queued';
    const suspects = (Array.isArray(rawData.suspects) ? rawData.suspects : []).slice(0, 20).map((suspect) => ({
      id: safeText(suspect?.id, 128),
      name: safeText(suspect?.name, 255),
      url: safeText(suspect?.url, 2048),
      note: safeText(suspect?.note, 64) || undefined,
      hasSnapshot: Boolean(suspect?.hasSnapshot),
      checkedAt: safeText(suspect?.checkedAt, 80) || undefined,
    }));
    const artifact: AiArtifact = {
      id,
      kind: 'job',
      schemaVersion: 1,
      status,
      titleKey: 'ai.artifact.bookmarkHealth.title',
      generatedAt: safeText(item.generatedAt, 80) || new Date().toISOString(),
      revision: Math.max(1, safeCount(item.revision)),
      data: {
        jobType: 'bookmark_health',
        jobId,
        total: safeCount(rawData.total),
        checked: safeCount(rawData.checked),
        alive: safeCount(rawData.alive),
        suspect: safeCount(rawData.suspect),
        unknown: safeCount(rawData.unknown),
        startedAt: safeText(rawData.startedAt, 80) || undefined,
        completedAt: safeText(rawData.completedAt, 80) || undefined,
        lastCheckedAt: safeText(rawData.lastCheckedAt, 80) || undefined,
        pollAfterMs: Math.min(10_000, Math.max(1_500, safeCount(rawData.pollAfterMs) || 2_500)),
        suspects,
      },
    };
    byId.set(id, artifact);
  }
  return [...byId.values()].slice(0, 8);
}
