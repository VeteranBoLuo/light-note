import request, { apiBaseGet, apiBasePost, apiBasePatch, apiBaseDelete, type ApiResponse } from '@/http/request';
import type { ExtractionPlan, ExtractionRecord, ExtractionFilter } from '@lightnote/shared/extraction';
import type { ToolboxResourceRef } from './toolbox';
export type ExtractionSource = {
  id: string;
  type: 'note' | 'bookmark' | 'file';
  resourceId: string;
  title: string;
  version: string;
  status: string;
  coverage: {
    complete?: boolean;
    scope?: string;
    reasons?: { code: string; message: string }[];
    processed?: { pages?: number; chars?: number; chunks?: number };
    total?: { pages?: number; chars?: number; chunks?: number };
  };
  windows: number;
  processed: number;
  errorCode: string | null;
  expiresAt: string;
};
export type ExtractionTable = {
  id: string;
  title: string;
  goal: string;
  status: string;
  phase: string;
  plan: ExtractionPlan | null;
  version: number;
  dataVersion: number;
  errorCode: string | null;
  inFlight: boolean;
  enabled: boolean;
  acceptPartial: boolean;
  usage: { calls: number; chargedTokens: number; unsettled: number };
  counts: { total: number; excluded: number; pending: number };
  sources: ExtractionSource[];
  budget: { suggestionCalls: number; remainingExtractionCalls: number };
  updatedAt: string;
};
export class ExtractionRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function unwrap<T>(promise: Promise<ApiResponse>): Promise<T> {
  const response = await promise;
  if (response.status !== 200)
    throw new ExtractionRequestError(response.data?.code || 'EXTRACTION_FAILED', response.msg, response.status);
  return response.data;
}
const root = '/api/toolbox/extractions';
export const listExtractions = () => unwrap<ExtractionTable[]>(apiBaseGet(root, undefined, {
  silent: true,
  // Preserve the feature's initialization code; the global 5xx handler replaces
  // it with HTTP_503. Authentication and other HTTP errors keep their usual path.
  validateStatus: (status) => (status >= 200 && status < 300) || status === 503,
}));
export const getExtraction = (id: string) =>
  unwrap<ExtractionTable>(apiBaseGet(`${root}/${id}`, undefined, { silent: true }));
export const createExtraction = (input: {
  requestId: string;
  title: string;
  goal: string;
  resourceRefs: ToolboxResourceRef[];
}) => unwrap<ExtractionTable>(apiBasePost(root, input, { silent: true }));
export const extractionAction = (id: string, input: Record<string, unknown>) =>
  unwrap<ExtractionTable>(apiBasePost(`${root}/${id}/actions`, input, { silent: true }));
export const getExtractionRecords = (id: string, filter: ExtractionFilter, page: number) =>
  unwrap<{ records: ExtractionRecord[]; total: number; dataVersion: number }>(
    apiBaseGet(`${root}/${id}/records`, { ...filter, page }, { silent: true }),
  );
export const reviewExtraction = (id: string, recordId: string, input: Record<string, unknown>) =>
  unwrap<ExtractionRecord>(apiBasePatch(`${root}/${id}/records/${recordId}`, input, { silent: true }));
export const deleteExtraction = (id: string, version: number) =>
  unwrap(apiBaseDelete(`${root}/${id}`, { version }, { silent: true }));
export async function exportExtraction(
  id: string,
  format: 'csv' | 'xlsx',
  scope: 'all' | 'filtered',
  filter: ExtractionFilter,
) {
  const response = await request({
    url: `${root}/${id}/export`,
    method: 'post',
    data: { format, scope, filter },
    responseType: 'blob',
  });
  if (String(response.headers['content-type']).includes('application/json')) throw new Error('EXPORT_FAILED');
  return response.data as Blob;
}

export const inspectExtractionSource = (id: string, sourceId: string) =>
  unwrap<{ type: string; id: string; title: string; available: boolean; changed: boolean }>(
    apiBaseGet(`${root}/${id}/sources/${sourceId}`, undefined, { silent: true }),
  );
export const extractionNoteSummary = (id: string, scope: string, filter: ExtractionFilter, locale: string) =>
  unwrap<{ title: string; content: string; dataVersion: number; snapshotId: string }>(
    apiBasePost(`${root}/${id}/note-summary`, { scope, filter, locale }, { silent: true }),
  );

export const getNextPendingCell = (
  id: string,
  filter: ExtractionFilter,
  recordId: string,
  fieldId: string,
  direction: number,
) =>
  unwrap<{ record: ExtractionRecord; fieldId: string } | null>(
    apiBaseGet(`${root}/${id}/next-pending`, { ...filter, recordId, fieldId, direction }, { silent: true }),
  );
