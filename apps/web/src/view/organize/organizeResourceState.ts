import {
  organizeObjectOutcome,
  organizeOutcomeGroup,
  organizeReviewDisposition,
} from '@lightnote/shared/organize-progress';
import type { SuggestionRun, WorkspaceItem } from '@/api/organizeSuggestionApi';

// Older responses have no outcome. Use the shared precedence and all checks,
// never the currently selected check, to preserve a resource's identity.
export function resourceOutcome(item: WorkspaceItem, run: SuggestionRun) {
  if (item.outcome) return item.outcome;
  const suggestions = item.suggestions;
  const has = (states: string[]) => suggestions.some((s) => states.includes(s.status));
  const archiveWaiting = suggestions.some(
    (s) => s.kind === 'archive' && ['pending', 'info'].includes(s.status) && !s.archivePreview,
  );
  return organizeObjectOutcome(
    {
      resource_available: 1,
      rule_status: item.ruleStatus,
      ai_status: item.aiStatus,
      pending: suggestions.some(
        (s) =>
          !(s.kind === 'archive' && !s.archivePreview) &&
          (s.status === 'pending' ||
            (s.status === 'info' && ['trash', 'duplicate_bookmarks'].includes(s.action || ''))),
      ),
      pending_work: archiveWaiting || has(['queued', 'running']),
      failed: has(['failed', 'conflict', 'cancelled']),
      expired: has(['expired']),
      manual: suggestions.some(
        (s) =>
          (['insufficient', 'no_suggestion'].includes(s.status) && ['tags', 'title', 'tag_icon'].includes(s.kind)) ||
          (s.status === 'info' &&
            !['trash', 'duplicate_bookmarks'].includes(s.action || '') &&
            !(s.kind === 'archive' && !s.archivePreview)),
      ),
      reviewed: has(['applied', 'ignored', 'closed']),
      unsupported: item.resource.unsupported,
      work_open: item.work?.some((w) => ['queued', 'waiting', 'running'].includes(w.status)),
      work_failed: item.work?.some(
        (w) => !w.resolved && ['failed', 'conflict', 'partial', 'cancelled'].includes(w.status),
      ),
    },
    run.status,
    run.runVersion || 1,
  );
}
export function resourceGroup(item: WorkspaceItem, run: SuggestionRun) {
  return organizeOutcomeGroup(resourceOutcome(item, run));
}
export function reviewDisposition(item: WorkspaceItem) {
  return organizeReviewDisposition(item.suggestions, item.ruleStatus === 'removed');
}
export function resourceWork(item: WorkspaceItem) {
  if (item.ruleStatus === 'removed') return [];
  const work: NonNullable<WorkspaceItem['work']> = item.work
    ? item.work.filter((w) => !w.resolved && !['completed', 'skipped'].includes(w.status))
    : item.suggestions
        .filter((s) => ['queued', 'running', 'failed', 'conflict', 'cancelled'].includes(s.status))
        .map((s) => ({
          kind: s.kind,
          lane: ['tags', 'title', 'tag_icon'].includes(s.kind) ? 'ai' : 'direct',
          status: s.status,
        }));
  if (
    !item.work &&
    !work.length &&
    ['queued', 'running', 'waiting_content', 'preparing_content', 'failed', 'conflict', 'cancelled'].includes(
      item.aiStatus,
    )
  )
    work.push({
      kind: 'analysis',
      lane: 'ai',
      status:
        item.aiStatus === 'waiting_content'
          ? 'waiting'
          : item.aiStatus === 'preparing_content'
            ? 'running'
            : item.aiStatus,
    });
  if (!work.length && ['pending', 'checked', 'loaded'].includes(item.ruleStatus || ''))
    work.push({ kind: 'prepare', lane: 'direct', status: 'queued' });
  if (!work.length && ['cancelled', 'failed', 'conflict'].includes(item.ruleStatus || ''))
    work.push({ kind: 'prepare', lane: 'direct', status: item.ruleStatus! });
  return work;
}
