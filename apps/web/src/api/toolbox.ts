import type { ToolboxToolDefinition } from '@lightnote/shared/toolbox-protocol';
import { apiBaseGet, apiBasePatch, apiBasePost } from '@/http/request';
import type { ResourcePickerItem } from '@/composables/useResourcePickerSearch';

export type ToolboxResourceRef = Pick<ResourcePickerItem, 'type' | 'id'> & { version?: string };
export type ToolboxInput = {
  resourceRefs?: ToolboxResourceRef[];
  sourceIds?: string[];
  options?: {
    title?: string;
    question?: string;
    intent?: string;
    detailLevel?: 'concise' | 'balanced' | 'detailed';
    targetLength?: number;
  };
};

export type ToolboxCatalogItem = ToolboxToolDefinition & {
  price: { kind: 'free' | 'quote'; currency: 'points' | null; min: number; max: number };
};

export type ToolboxCatalog = {
  protocolVersion: number;
  pricingVersion: string;
  chargeRule: 'single_medium_per_execution';
  tools: ToolboxCatalogItem[];
};

export type ToolboxWorkspaceKind = 'research' | 'learning' | 'writing';
export type ToolboxWorkspaceStatus = 'active' | 'paused' | 'completed' | 'archived';
export type ToolboxWorkspaceLane = 'inbox' | 'knowledge' | 'action';
export type ToolboxWorkspaceItemStatus = 'open' | 'in_progress' | 'done' | 'archived';

export type ToolboxWorkspaceResource = {
  id: number;
  type: 'note' | 'bookmark' | 'file';
  resourceId: string;
  version: string;
  title: string;
  createdAt: string;
};

export type ToolboxWorkspaceItem = {
  id: string;
  lane: ToolboxWorkspaceLane;
  title: string;
  content: string;
  status: ToolboxWorkspaceItemStatus;
  position: number;
  dueOn: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ToolboxWorkspaceSession = {
  id: string;
  summary: string;
  nextStep: string;
  durationMinutes: number;
  createdAt: string;
};

export type ToolboxWorkspaceSummary = {
  id: string;
  kind: ToolboxWorkspaceKind;
  title: string;
  description: string;
  goal: string;
  status: ToolboxWorkspaceStatus;
  targetDate: string | null;
  nextStep: string;
  resourceCount: number;
  openItemCount: number;
  completedItemCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ToolboxWorkspace = ToolboxWorkspaceSummary & {
  streakDays: number;
  resources: ToolboxWorkspaceResource[];
  items: ToolboxWorkspaceItem[];
  sessions: ToolboxWorkspaceSession[];
};

export type ToolboxHomeWorkspaceSummary = Pick<
  ToolboxWorkspaceSummary,
  | 'id'
  | 'kind'
  | 'title'
  | 'status'
  | 'nextStep'
  | 'resourceCount'
  | 'openItemCount'
  | 'completedItemCount'
  | 'lastOpenedAt'
  | 'updatedAt'
>;

export type ToolboxKnowledgeIssue = {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  noteId: string;
  title: string;
  path: string;
  reason: string;
};

export type ToolboxKnowledgeOverview = {
  scannedAt: string;
  policy: { staleAfterDays: number; deepNoteDepth: number };
  summary: {
    total: number;
    roots: number;
    maxDepth: number;
    tagged: number;
    linked: number;
    empty: number;
    stale: number;
    invalidParents: number;
    duplicateGroups: number;
    duplicateNotes: number;
    healthScore: number;
  };
  issueCounts: Record<string, number>;
  issues: ToolboxKnowledgeIssue[];
  issueTotal: number;
  recommendations: Array<{ code: string; count: number; priority: 'high' | 'medium' | 'low' }>;
};

export type ToolboxQuote = {
  id: string;
  toolId: string;
  pricingVersion: string;
  billingMedium: 'points' | 'ai_quota';
  quotedPoints: number;
  status: 'active' | 'consumed' | 'expired';
  expiresAt: string;
  inputSummary: { itemCount: number; resourceCount: number; uploadCount: number };
};

export type ToolboxJob = {
  id: string;
  toolId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'partial_succeeded' | 'failed' | 'cancelled' | 'expired';
  stage: string;
  billing: {
    medium: 'points' | 'ai_quota';
    status: string;
    quotedPoints: number;
    actualPoints: number;
    refundedPoints: number;
  };
  save: {
    status: 'unsaved' | 'saving' | 'saved' | 'save_failed';
    targetType?: 'note';
    targetId?: string;
    targetAvailability?: 'none' | 'available' | 'trashed' | 'missing';
  };
  error: { code: string; message: string } | null;
  artifact: { id: string; type: string; title: string; contentType: string; version: number } | null;
  artifactState: 'none' | 'ready' | 'expired';
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ToolboxHomeOverview = {
  schemaVersion: number;
  workspaces: {
    continue: ToolboxHomeWorkspaceSummary[];
    recent: ToolboxHomeWorkspaceSummary[];
  };
  tasks: {
    active: ToolboxJob[];
    ready: ToolboxJob[];
    recent: ToolboxJob[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 首页读模型会同时被 HTTP 页面与本地开发热更新读取，不能用类型断言掩盖服务端版本漂移。
 * 旧的作品项目响应缺少 workspaces；这里明确拒绝旧协议，让页面进入可重试错误态，而不是
 * 把已删除项目兼容回来，或在 computed 中抛错后永久停在“加载中”。
 */
export function parseToolboxHomeOverview(value: unknown): ToolboxHomeOverview {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.workspaces) || !isRecord(value.tasks)) {
    throw new Error('TOOLBOX_HOME_INVALID_RESPONSE');
  }
  if (
    !Array.isArray(value.workspaces.continue) ||
    !Array.isArray(value.workspaces.recent) ||
    !Array.isArray(value.tasks.active) ||
    !Array.isArray(value.tasks.ready) ||
    !Array.isArray(value.tasks.recent)
  ) {
    throw new Error('TOOLBOX_HOME_INVALID_RESPONSE');
  }
  return value as ToolboxHomeOverview;
}

export type ToolboxArtifact = {
  id: string;
  jobId: string;
  toolId: string;
  type: string;
  version: number;
  title: string;
  content: string;
  contentType: 'markdown';
  sources: Array<Record<string, unknown>>;
  coverage: Record<string, any>;
  meta: Record<string, any>;
  save: {
    status: 'unsaved' | 'saving' | 'saved' | 'save_failed';
    targetType?: 'note';
    targetId?: string;
    targetAvailability?: 'none' | 'available' | 'trashed' | 'missing';
  };
  createdAt: string;
  expiresAt: string;
};

function apiFailure(response: { status?: number | string; msg?: string; data?: any }, fallback: string) {
  const error = new Error(response?.msg || fallback) as Error & { code?: string; status?: number | string; data?: any };
  error.code = response?.data?.code;
  error.status = response?.status;
  error.data = response?.data;
  return error;
}

export async function fetchToolboxCatalog(): Promise<ToolboxCatalog> {
  const response = await apiBaseGet('/api/toolbox/catalog', undefined, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_CATALOG_FAILED');
  return response.data as ToolboxCatalog;
}

export async function fetchToolboxHome(): Promise<ToolboxHomeOverview> {
  const response = await apiBaseGet('/api/toolbox/home', undefined, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_HOME_FAILED');
  return parseToolboxHomeOverview(response.data);
}

export async function fetchToolboxKnowledgeOverview(): Promise<ToolboxKnowledgeOverview> {
  const response = await apiBaseGet('/api/toolbox/knowledge-overview', undefined, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_KNOWLEDGE_OVERVIEW_FAILED');
  return response.data as ToolboxKnowledgeOverview;
}

export async function fetchToolboxWorkspaces(
  kind: ToolboxWorkspaceKind,
  status?: ToolboxWorkspaceStatus,
): Promise<ToolboxWorkspaceSummary[]> {
  const response = await apiBaseGet(
    '/api/toolbox/workspaces',
    { kind, ...(status ? { status } : {}) },
    { silent: true },
  );
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACES_FAILED');
  return Array.isArray(response.data?.items) ? response.data.items : [];
}

export async function createToolboxWorkspace(input: {
  kind: ToolboxWorkspaceKind;
  title: string;
  description?: string;
  goal?: string;
  targetDate?: string | null;
  nextStep?: string;
}): Promise<ToolboxWorkspace> {
  const response = await apiBasePost('/api/toolbox/workspaces', input, { silent: true });
  if (![200, 201].includes(Number(response.status))) throw apiFailure(response, 'TOOLBOX_WORKSPACE_CREATE_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function fetchToolboxWorkspace(workspaceId: string): Promise<ToolboxWorkspace> {
  const response = await apiBaseGet(`/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}`, undefined, {
    silent: true,
  });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACE_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function markToolboxWorkspaceOpened(workspaceId: string): Promise<ToolboxHomeWorkspaceSummary> {
  const response = await apiBasePost(`/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}/open`, undefined, {
    silent: true,
  });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACE_OPEN_FAILED');
  return response.data as ToolboxHomeWorkspaceSummary;
}

export async function updateToolboxWorkspace(
  workspaceId: string,
  input: Partial<
    Pick<ToolboxWorkspaceSummary, 'title' | 'description' | 'goal' | 'targetDate' | 'nextStep' | 'status'>
  >,
): Promise<ToolboxWorkspace> {
  const response = await apiBasePatch(`/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}`, input, {
    silent: true,
  });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACE_UPDATE_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function addToolboxWorkspaceResources(
  workspaceId: string,
  resourceRefs: Array<{ type: 'note' | 'bookmark' | 'file'; id: string; title?: string }>,
): Promise<ToolboxWorkspace> {
  const response = await apiBasePost(
    `/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}/resources`,
    { resourceRefs },
    { silent: true },
  );
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACE_RESOURCES_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function removeToolboxWorkspaceResource(
  workspaceId: string,
  resource: { type: 'note' | 'bookmark' | 'file'; id: string },
): Promise<ToolboxWorkspace> {
  const response = await apiBasePost(
    `/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}/resources/remove`,
    { resource },
    { silent: true },
  );
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACE_RESOURCE_REMOVE_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function createToolboxWorkspaceItem(
  workspaceId: string,
  input: { lane: ToolboxWorkspaceLane; title: string; content?: string; dueOn?: string | null },
): Promise<ToolboxWorkspace> {
  const response = await apiBasePost(`/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}/items`, input, {
    silent: true,
  });
  if (![200, 201].includes(Number(response.status))) throw apiFailure(response, 'TOOLBOX_WORKSPACE_ITEM_CREATE_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function updateToolboxWorkspaceItem(
  workspaceId: string,
  itemId: string,
  input: Partial<Pick<ToolboxWorkspaceItem, 'title' | 'content' | 'lane' | 'status' | 'position' | 'dueOn'>>,
): Promise<ToolboxWorkspace> {
  const response = await apiBasePatch(
    `/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}`,
    input,
    { silent: true },
  );
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_WORKSPACE_ITEM_UPDATE_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function createToolboxWorkspaceSession(
  workspaceId: string,
  input: { summary?: string; nextStep?: string; durationMinutes?: number },
): Promise<ToolboxWorkspace> {
  const response = await apiBasePost(`/api/toolbox/workspaces/${encodeURIComponent(workspaceId)}/sessions`, input, {
    silent: true,
  });
  if (![200, 201].includes(Number(response.status))) throw apiFailure(response, 'TOOLBOX_WORKSPACE_SESSION_FAILED');
  return response.data as ToolboxWorkspace;
}

export async function createToolboxQuote(input: {
  toolId: string;
  input: ToolboxInput;
  billingMedium: 'points' | 'ai_quota';
  clientRequestId: string;
}): Promise<ToolboxQuote> {
  const response = await apiBasePost('/api/toolbox/quotes', input, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_QUOTE_FAILED');
  return response.data as ToolboxQuote;
}

export async function createToolboxJob(input: { quoteId: string; clientRequestId: string }): Promise<ToolboxJob> {
  const response = await apiBasePost('/api/toolbox/jobs', input, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_JOB_CREATE_FAILED');
  return response.data as ToolboxJob;
}

export async function fetchToolboxJobs(limit = 20): Promise<ToolboxJob[]> {
  const response = await apiBaseGet('/api/toolbox/tasks', { limit }, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_TASKS_FAILED');
  return Array.isArray(response.data?.items) ? response.data.items : [];
}

export async function fetchToolboxJob(jobId: string): Promise<ToolboxJob> {
  const response = await apiBaseGet(`/api/toolbox/jobs/${encodeURIComponent(jobId)}`, undefined, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_JOB_FAILED');
  return response.data as ToolboxJob;
}

export async function cancelToolboxJob(jobId: string): Promise<ToolboxJob> {
  const response = await apiBasePost(`/api/toolbox/jobs/${encodeURIComponent(jobId)}/cancel`, {}, { silent: true });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_CANCEL_FAILED');
  return response.data as ToolboxJob;
}

export async function fetchToolboxArtifact(artifactId: string): Promise<ToolboxArtifact> {
  const response = await apiBaseGet(`/api/toolbox/artifacts/${encodeURIComponent(artifactId)}`, undefined, {
    silent: true,
  });
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_ARTIFACT_FAILED');
  return response.data as ToolboxArtifact;
}

export async function saveToolboxArtifact(
  artifactId: string,
  clientRequestId: string,
  action: 'save' | 'recreate_missing_target' = 'save',
) {
  const response = await apiBasePost(
    `/api/toolbox/artifacts/${encodeURIComponent(artifactId)}/save`,
    { clientRequestId, action },
    { silent: true },
  );
  if (response.status !== 200) throw apiFailure(response, 'TOOLBOX_SAVE_FAILED');
  return response.data as {
    status: 'saved';
    targetType: 'note';
    targetId: string;
    targetAvailability: 'available';
    idempotent: boolean;
  };
}

export async function uploadToolboxDocument(file: File, toolId = 'ocr_to_text'): Promise<string> {
  const fileType = inferToolboxDocumentMime(file);
  const prepared = await apiBasePost(
    '/api/toolbox/uploads',
    { toolId, fileName: file.name, fileType, fileSize: file.size },
    { silent: true },
  );
  const upload = prepared.data;
  if (prepared.status !== 200 || !upload?.uploadUrl || !upload?.attachment?.id) {
    throw apiFailure(prepared, 'TOOLBOX_UPLOAD_PREPARE_FAILED');
  }
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: upload.headers || { 'Content-Type': fileType },
    body: file,
  });
  if (!response.ok) throw new Error(`${file.name}: TOOLBOX_UPLOAD_FAILED`);
  return String(upload.attachment.id);
}

export function createToolboxClientRequestId(prefix: 'quote' | 'job' | 'save' = 'job') {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `${prefix}:${id}`;
}

/** 同一版本成果始终复用同一保存请求键，跨刷新和重复点击都不会产生第二次保存效果。 */
export function createToolboxArtifactSaveRequestId(artifactId: string, version: number) {
  const normalizedId = String(artifactId || '')
    .replace(/[^A-Za-z0-9_-]/gu, '')
    .slice(0, 48);
  const normalizedVersion = Math.max(1, Math.trunc(Number(version) || 1));
  return `save:${normalizedId}:v${normalizedVersion}`.slice(0, 64);
}

export function inferToolboxDocumentMime(file: Pick<File, 'name' | 'type'>) {
  const explicit = String(file.type || '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  const extension = String(file.name || '')
    .toLowerCase()
    .split('.')
    .pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'application/octet-stream';
}
