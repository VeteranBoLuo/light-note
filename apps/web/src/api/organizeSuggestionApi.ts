import { apiBaseGet, apiBasePost } from '@/http/request';
import type { OrganizeAiSuggestionTag } from './organizeApi';
export type ResourceType = 'bookmark' | 'note' | 'file';
export type CheckKind = 'tags' | 'title' | 'empty' | 'duplicate';
export interface RunOptions {
  tagMode?: 'untagged' | 'append';
  resourceTypes: ResourceType[];
  checks: CheckKind[];
  scope: 'recent' | 'all' | 'selected' | 'untagged';
  items: Array<{ type: ResourceType; id: string }>;
}
export interface RunSummary {
  observations?: Array<{ reason: string; count: number }>;
  total: number;
  types: Partial<Record<ResourceType, number>>;
  aiTotal: number | null;
  ruleTotal: number | null;
  skipped: number;
  files: { parsed: number | null; metadata: number | null };
  estimatedTokensLower: number | null;
  estimatedTokensUpper: number | null;
  aiEnabled: boolean;
}
export interface SuggestionMember {
  size?: number;
  fileType?: string;
  url?: string;
  id: string;
  type: ResourceType;
  title: string;
  folder?: string;
  modifiedAt?: string;
  excerpt?: string;
  protected?: boolean;
}
export interface WorkspaceSuggestion {
  id: string;
  kind: CheckKind;
  status: string;
  reason: string;
  before: string | OrganizeAiSuggestionTag[] | null;
  after: string | OrganizeAiSuggestionTag[] | null;
  applied?: unknown;
  action?: string;
  members?: SuggestionMember[];
}
export interface WorkspaceItem {
  id: string;
  resource: SuggestionMember & {
    tags: OrganizeAiSuggestionTag[];
    source: { folder: string; url?: string };
    guards: Record<string, number>;
    evidenceLevel: string;
    unsupported?: boolean;
  };
  aiStatus: string;
  ruleStatus?: string;
  errorCode?: string;
  suggestions: WorkspaceSuggestion[];
}
export interface SuggestionRun {
  runVersion?: number;
  rulePhase?: string;
  ruleRetrying?: boolean;
  skipped?: number;
  pauseReason?: string;
  checked?: number;
  inFlight?: number;
  queued?: number;
  canPause?: boolean;
  canResume?: boolean;
  canEnd?: boolean;
  id: string;
  status: string;
  createdAt?: string;
  options: RunOptions;
  summary: RunSummary;
  progress?: Array<{ resourceType: ResourceType; aiStatus: string; total: number }>;
  counts?: Array<{ status: string; total: number }>;
  items?: WorkspaceItem[];
  nextCursor?: string | null;
}
const root = '/api/organize/suggestions';
const opts = { silent: true, feedback: false };
export const previewRun = (options: RunOptions, requestId: string) =>
  apiBasePost(`${root}/previews`, { ...options, requestId }, opts);
export const startRun = (id: string, replaceRunId?: string) =>
  apiBasePost(`${root}/runs/${encodeURIComponent(id)}/start`, { requestId: id, replaceRunId }, opts);
export const listRuns = () => apiBaseGet(`${root}/runs`, undefined, opts);
export const getRun = (id: string, params: { after?: string; resourceType?: string; kind?: string } = {}) =>
  apiBaseGet(`${root}/runs/${encodeURIComponent(id)}`, params, opts);
export const cancelRun = (id: string) => apiBasePost(`${root}/runs/${encodeURIComponent(id)}/cancel`, {}, opts);
export const actOnRunSuggestion = (
  runId: string,
  id: string,
  action: 'apply' | 'ignore',
  value: unknown,
  requestId: string,
) =>
  apiBasePost(
    `${root}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(id)}/actions`,
    { action, value, requestId },
    opts,
  );

export const pauseRun = (id: string) => apiBasePost(`${root}/runs/${encodeURIComponent(id)}/pause`, {}, opts);
export const resumeRun = (id: string) => apiBasePost(`${root}/runs/${encodeURIComponent(id)}/resume`, {}, opts);
