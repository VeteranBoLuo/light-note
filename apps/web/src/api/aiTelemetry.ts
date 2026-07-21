import { apiBasePost } from '@/http/request.ts';

export type AiProductEventName =
  | 'ai_entry_impression'
  | 'ai_entry_opened'
  | 'ai_material_added'
  | 'ai_material_removed'
  | 'ai_scope_changed'
  | 'ai_prompt_submitted'
  | 'ai_first_activity'
  | 'ai_first_token'
  | 'ai_completed'
  | 'ai_stopped'
  | 'ai_source_opened'
  | 'ai_source_feedback'
  | 'ai_result_saved'
  | 'ai_result_applied'
  | 'ai_change_previewed'
  | 'ai_change_edited'
  | 'ai_change_confirmed'
  | 'ai_change_succeeded'
  | 'ai_change_undone'
  | 'ai_feedback_submitted'
  | 'ai_closed_while_generating'
  | 'ai_draft_restored'
  | 'ai_error_retried'
  | 'ai_error_recovered'
  | 'ai_memory_candidate_reviewed'
  | 'ai_memory_state_changed';

export type AiProductEventDimensions = Partial<{
  surface:
    | 'edge'
    | 'shortcut'
    | 'note_detail'
    | 'note_library'
    | 'search'
    | 'bookmark_manage'
    | 'cloud_space'
    | 'tag_detail'
    | 'workspace'
    | 'conversation'
    | 'memory';
  device: 'desktop' | 'tablet' | 'mobile' | 'unknown';
  mode: 'ask' | 'organize';
  intent: 'ask' | 'find' | 'summarize' | 'compare' | 'organize' | 'extract_todos' | 'find_related' | 'unknown';
  materialType: 'note' | 'bookmark' | 'file' | 'tag' | 'attachment' | 'mixed' | 'unknown';
  scopeMode: 'selected' | 'collection' | 'all_notes' | 'all_resources' | 'unknown';
  lengthBucket: '0' | '1_50' | '51_200' | '201_500' | '501_plus';
  durationBucket: 'under_1s' | '1_3s' | '3_10s' | '10_30s' | '30_120s' | '120s_plus';
  issueType: 'unsupported' | 'outdated' | 'missing' | 'wrong_target' | 'other' | 'none';
  outcome: 'success' | 'failed' | 'stopped' | 'cancelled' | 'conflict' | 'expired' | 'recovered';
  stage: 'idle' | 'planning' | 'retrieving' | 'reading' | 'answering' | 'saving' | 'completed' | 'failed';
  actionType:
    | 'save_new'
    | 'append'
    | 'merge'
    | 'apply'
    | 'undo'
    | 'confirm'
    | 'retry'
    | 'open'
    | 'accept'
    | 'pause'
    | 'resume'
    | 'edit'
    | 'delete';
  scopeType: 'global' | 'conversation' | 'resource' | 'temporary';
  memoryType: 'preference' | 'stable_fact' | 'project' | 'temporary_state' | 'unknown';
  memoryState: 'candidate' | 'active' | 'paused' | 'expired' | 'deleted';
  conversationId: string;
  requestId: string;
  messageId: string;
  sourceId: string;
  evidenceRef: string;
  changeSetId: string;
  taskId: string;
  memoryId: string;
  entryId: string;
  errorCode: string;
  materialCount: number;
  sourceCount: number;
  failureCount: number;
  selectedCount: number;
  itemCount: number;
  retryable: boolean;
  restored: boolean;
  temporarySession: boolean;
  externalWeb: boolean;
}>;

export function aiLengthBucket(length: number): AiProductEventDimensions['lengthBucket'] {
  if (length <= 0) return '0';
  if (length <= 50) return '1_50';
  if (length <= 200) return '51_200';
  if (length <= 500) return '201_500';
  return '501_plus';
}

export function aiDurationBucket(durationMs: number): AiProductEventDimensions['durationBucket'] {
  if (durationMs < 1_000) return 'under_1s';
  if (durationMs < 3_000) return '1_3s';
  if (durationMs < 10_000) return '3_10s';
  if (durationMs < 30_000) return '10_30s';
  if (durationMs < 120_000) return '30_120s';
  return '120s_plus';
}

export function recordAiProductEvent(event: AiProductEventName, dimensions: AiProductEventDimensions = {}) {
  const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : undefined;
  return apiBasePost('/api/common/recordAiEvent', { id, event, dimensions }, { silent: true }).catch(() => undefined);
}
