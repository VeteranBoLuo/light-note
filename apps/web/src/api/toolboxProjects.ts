import {
  PRODUCTION_PROJECT_CONFLICT_CODES,
  createEmptyProductionProjectContent,
  normalizeProductionProjectContent,
  toProductionProjectDto,
  toProductionProjectRevisionDto,
  type ProductionDocumentContentV1,
  type ProductionProjectContent,
  type ProductionProjectCreateRequest,
  type ProductionProjectDto,
  type ProductionProjectRevisionDto,
  type ProductionProjectRevisionRequest,
  type ProductionProjectStatus,
  type ProductionProjectType,
  type ProductionProjectUpdateRequest,
  type ProductionWorkbookContentV1,
} from '@lightnote/shared/production-project-protocol';
import { apiBaseGet, apiBasePatch, apiBasePost } from '@/http/request';

export type ToolboxProjectSummary = ProductionProjectDto;
export type ToolboxDocumentContent = ProductionDocumentContentV1;
export type ToolboxWorkbookContent = ProductionWorkbookContentV1;

export interface ToolboxProjectResource {
  id: string | number;
  type: string;
  resourceId: string;
  resourceVersion: string;
  title: string;
  role: string;
  createdAt: string | null;
}

export interface ToolboxProjectDetail {
  project: ProductionProjectDto;
  revision: ProductionProjectRevisionDto;
  resources: ToolboxProjectResource[];
}

export interface ToolboxCursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type ToolboxProjectRevisionSummary = Pick<
  ProductionProjectRevisionDto,
  'id' | 'projectId' | 'projectType' | 'revision' | 'changeKind' | 'label' | 'sourceRevisionId' | 'createdAt'
> & { contentHash?: string };

export type ToolboxProjectApiError = Error & {
  code?: string;
  status?: number | string;
  data?: Record<string, unknown>;
};

type ApiResponse<T> = { status?: number | string; msg?: string; data?: T & { code?: string } };
type RawProjectDetail = { project: unknown; revision: unknown; resources?: ToolboxProjectResource[] };

function projectApiFailure<T>(response: ApiResponse<T>, fallback: string): ToolboxProjectApiError {
  const error = new Error(response?.msg || fallback) as ToolboxProjectApiError;
  error.code = response?.data?.code;
  error.status = response?.status;
  error.data = response?.data as Record<string, unknown> | undefined;
  return error;
}

function assertProjectResponse<T>(response: ApiResponse<T>, fallback: string): T {
  if (![200, 201].includes(Number(response.status))) throw projectApiFailure(response, fallback);
  return response.data as T;
}

function normalizeProjectDetail(raw: RawProjectDetail): ToolboxProjectDetail {
  const project = toProductionProjectDto(raw.project);
  const revision = toProductionProjectRevisionDto(raw.revision, project.projectType);
  return { project, revision, resources: Array.isArray(raw.resources) ? raw.resources : [] };
}

function normalizeRevisionSummary(raw: Record<string, unknown>, projectId: string): ToolboxProjectRevisionSummary {
  return {
    id: String(raw.id || ''),
    projectId,
    projectType: String(raw.projectType || 'document') as ProductionProjectType,
    revision: Number(raw.revision || 0),
    changeKind: String(raw.changeKind || 'autosave') as ToolboxProjectRevisionSummary['changeKind'],
    label: raw.label == null ? null : String(raw.label),
    sourceRevisionId: raw.sourceRevisionId == null ? null : String(raw.sourceRevisionId),
    createdAt: raw.createdAt == null ? null : String(raw.createdAt),
    contentHash: raw.contentHash == null ? undefined : String(raw.contentHash),
  };
}

export function createEmptyToolboxDocumentContent(): ToolboxDocumentContent {
  return createEmptyProductionProjectContent('document') as ToolboxDocumentContent;
}

export function createToolboxDocumentContent(value: string): ToolboxDocumentContent {
  const empty = createEmptyToolboxDocumentContent();
  return normalizeProductionProjectContent(
    { ...empty, body: { format: 'markdown', value } },
    'document',
  ) as ToolboxDocumentContent;
}

export function createEmptyToolboxWorkbookContent(): ToolboxWorkbookContent {
  return createEmptyProductionProjectContent('workbook') as ToolboxWorkbookContent;
}

export function normalizeToolboxWorkbookContent(value: unknown): ToolboxWorkbookContent {
  return normalizeProductionProjectContent(value, 'workbook') as ToolboxWorkbookContent;
}

export function createToolboxProjectClientRequestId(prefix: string) {
  const suffix =
    globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`.replace(/[^A-Za-z0-9:_-]/gu, '-').slice(0, 128);
}

/**
 * 同一版本工具成果采用稳定的项目创建键；刷新或重复点击会回到同一作品，
 * 不会悄悄产生多份重复文档。
 */
export function createToolboxArtifactProjectRequestId(
  artifactId: string,
  artifactVersion: number,
  projectType: ProductionProjectType = 'document',
) {
  const normalizedId = String(artifactId || '')
    .replace(/[^A-Za-z0-9_-]/gu, '')
    .slice(0, 64);
  const normalizedVersion = Math.max(1, Math.trunc(Number(artifactVersion) || 1));
  return `artifact:${projectType}:${normalizedId || 'unknown'}:v${normalizedVersion}`.slice(0, 128);
}

export function isToolboxProjectConflict(error: unknown): error is ToolboxProjectApiError {
  const candidate = error as ToolboxProjectApiError | undefined;
  return (
    Number(candidate?.status) === 409 ||
    candidate?.code === PRODUCTION_PROJECT_CONFLICT_CODES.VERSION ||
    candidate?.code === PRODUCTION_PROJECT_CONFLICT_CODES.REVISION ||
    candidate?.code === 'TOOLBOX_PROJECT_VERSION_CONFLICT' ||
    candidate?.code === 'TOOLBOX_PROJECT_REVISION_CONFLICT'
  );
}

export async function fetchToolboxProjects(params: {
  projectType: ProductionProjectType;
  status?: ProductionProjectStatus;
  limit?: number;
}): Promise<ToolboxProjectSummary[]> {
  return (await fetchToolboxProjectsPage(params)).items;
}

export async function fetchToolboxProjectsPage(params: {
  projectType: ProductionProjectType;
  status?: ProductionProjectStatus;
  limit?: number;
  cursor?: string | null;
}): Promise<ToolboxCursorPage<ToolboxProjectSummary>> {
  const response = await apiBaseGet(
    '/api/toolbox/projects',
    { type: params.projectType, status: params.status, limit: params.limit, cursor: params.cursor || undefined },
    { silent: true },
  );
  const page = assertProjectResponse<{ items: unknown[]; nextCursor?: unknown }>(response, 'TOOLBOX_PROJECTS_FAILED');
  return {
    items: page.items.map((item) => toProductionProjectDto(item)),
    nextCursor: typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : null,
  };
}

export async function createToolboxProject(input: ProductionProjectCreateRequest): Promise<ToolboxProjectDetail> {
  const response = await apiBasePost('/api/toolbox/projects', input, { silent: true });
  return normalizeProjectDetail(assertProjectResponse<RawProjectDetail>(response, 'TOOLBOX_PROJECT_CREATE_FAILED'));
}

export async function fetchToolboxProject(projectId: string): Promise<ToolboxProjectDetail> {
  const response = await apiBaseGet(`/api/toolbox/projects/${encodeURIComponent(projectId)}`, undefined, {
    silent: true,
  });
  return normalizeProjectDetail(assertProjectResponse<RawProjectDetail>(response, 'TOOLBOX_PROJECT_FAILED'));
}

export async function updateToolboxProject(
  projectId: string,
  input: ProductionProjectUpdateRequest,
): Promise<ToolboxProjectSummary> {
  const response = await apiBasePatch(`/api/toolbox/projects/${encodeURIComponent(projectId)}`, input, {
    silent: true,
  });
  return toProductionProjectDto(assertProjectResponse<unknown>(response, 'TOOLBOX_PROJECT_UPDATE_FAILED'));
}

export async function openToolboxProject(projectId: string): Promise<ToolboxProjectSummary> {
  const response = await apiBasePost(
    `/api/toolbox/projects/${encodeURIComponent(projectId)}/open`,
    {},
    { silent: true },
  );
  return toProductionProjectDto(assertProjectResponse<unknown>(response, 'TOOLBOX_PROJECT_OPEN_FAILED'));
}

export async function saveToolboxProjectRevision(
  projectId: string,
  input: ProductionProjectRevisionRequest,
): Promise<ToolboxProjectDetail> {
  const response = await apiBasePost(`/api/toolbox/projects/${encodeURIComponent(projectId)}/revisions`, input, {
    silent: true,
  });
  return normalizeProjectDetail(assertProjectResponse<RawProjectDetail>(response, 'TOOLBOX_PROJECT_SAVE_FAILED'));
}

export async function fetchToolboxProjectRevisions(projectId: string): Promise<ToolboxProjectRevisionSummary[]> {
  return (await fetchToolboxProjectRevisionsPage(projectId)).items;
}

export async function fetchToolboxProjectRevisionsPage(
  projectId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<ToolboxCursorPage<ToolboxProjectRevisionSummary>> {
  const response = await apiBaseGet(
    `/api/toolbox/projects/${encodeURIComponent(projectId)}/revisions`,
    { limit: options.limit, cursor: options.cursor || undefined },
    { silent: true },
  );
  const page = assertProjectResponse<{ items: Record<string, unknown>[]; nextCursor?: unknown }>(
    response,
    'TOOLBOX_PROJECT_REVISIONS_FAILED',
  );
  return {
    items: page.items.map((item) => normalizeRevisionSummary(item, projectId)),
    nextCursor: typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : null,
  };
}

export async function restoreToolboxProjectRevision(
  projectId: string,
  revision: number,
  input: { clientRequestId: string; expectedVersion: number; expectedRevision: number; sourceRevisionId: string },
): Promise<ToolboxProjectDetail> {
  const response = await apiBasePost(
    `/api/toolbox/projects/${encodeURIComponent(projectId)}/revisions/${revision}/restore`,
    input,
    { silent: true },
  );
  return normalizeProjectDetail(assertProjectResponse<RawProjectDetail>(response, 'TOOLBOX_PROJECT_RESTORE_FAILED'));
}

export type { ProductionProjectContent, ProductionProjectType };
