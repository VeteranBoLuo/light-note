import { apiBaseGet, apiBasePost, type ApiResponse } from '@/http/request';
import type {
  HostAgentAction,
  HostAgentDashboard,
  HostAgentJobState,
  HostAgentSecuritySnapshot,
  HostAgentServiceId,
  HostAgentServicesSnapshot,
  HostAgentStorageSnapshot,
} from '@lightnote/shared/host-agent-protocol';

export type InfraAgentStatus = 'online' | 'offline' | 'incompatible';

export interface InfraDashboardPayload {
  agentStatus: InfraAgentStatus;
  code: string;
  dashboard: HostAgentDashboard | null;
}

export interface InfraLogsPayload {
  serviceId: HostAgentServiceId;
  lines: string[];
  truncated: boolean;
  exitCode: number | null;
  capturedAt: string;
}

export interface InfraActionPayload {
  action: HostAgentAction;
  targetId: HostAgentServiceId;
  idempotencyKey: string;
  reason: string;
  confirmed: true;
  confirmText?: string;
}

export interface InfraActionResultPayload {
  receipt?: {
    state?: HostAgentJobState;
    jobId?: string;
    exitCode?: number | null;
    summary?: string;
  };
  replayed?: boolean;
  retrySafe?: boolean;
  requiresManualVerification?: boolean;
  code?: string;
}

export type InfraDiagnosticState = 'pass' | 'warning' | 'fail' | 'unknown';
export type InfraDiagnosticDomain = 'overview' | 'services' | 'storage' | 'security';
export interface InfraDiagnosticCheck {
  id: string;
  domain: InfraDiagnosticDomain;
  state: InfraDiagnosticState;
  severity: 'high' | 'medium' | 'low';
  evidence: Record<string, unknown>;
  target: {
    module: InfraDiagnosticDomain;
    serviceId?: HostAgentServiceId;
    findingId?: string;
  };
}
export interface InfraDiagnosticsPayload {
  capturedAt: string | null;
  status: 'healthy' | 'attention' | 'critical';
  summary: { failed: number; warning: number; passed: number; unknown: number };
  checks: InfraDiagnosticCheck[];
  sources: Array<{
    domain: InfraDiagnosticDomain;
    state: 'available' | 'unavailable';
    capturedAt: string | null;
    collectionErrorCount: number;
    code?: string;
  }>;
}

export type InfraSecurityFindingState = 'pass' | 'fail' | 'unknown';
export interface InfraSecurityFinding {
  id: string;
  state: InfraSecurityFindingState;
  severity: 'high' | 'medium' | 'low';
  evidence: Record<string, unknown>;
}
export interface InfraSecurityPayload extends HostAgentSecuritySnapshot {
  findings: InfraSecurityFinding[];
  summary: { failed: number; passed: number; unknown: number };
}

export class InfraApiError extends Error {
  code: string;
  status: number;
  data: unknown;

  constructor(response: ApiResponse) {
    super(String(response.msg || '服务器管理请求失败'));
    this.name = 'InfraApiError';
    this.code = String(response.data?.code || `INFRA_HTTP_${response.status}`);
    this.status = Number(response.status || 500);
    this.data = response.data;
  }
}

function requireSuccess<T extends ApiResponse>(response: T): T {
  if (response.status !== 200) throw new InfraApiError(response);
  return response;
}

export async function getInfraDashboard(): Promise<ApiResponse & { data: InfraDashboardPayload }> {
  const response = (await apiBaseGet('/api/infra/dashboard', undefined, { silent: true })) as ApiResponse & {
    data: InfraDashboardPayload;
  };
  return requireSuccess(response);
}

async function getSnapshot<T>(path: string): Promise<ApiResponse & { data: T }> {
  const response = (await apiBaseGet(path, undefined, { silent: true })) as ApiResponse & { data: T };
  return requireSuccess(response);
}

export function getInfraServices(): Promise<ApiResponse & { data: HostAgentServicesSnapshot }> {
  return getSnapshot('/api/infra/services');
}

export function getInfraStorage(): Promise<ApiResponse & { data: HostAgentStorageSnapshot }> {
  return getSnapshot('/api/infra/storage');
}

export function getInfraSecurity(): Promise<ApiResponse & { data: InfraSecurityPayload }> {
  return getSnapshot('/api/infra/security');
}

export function getInfraDiagnostics(): Promise<ApiResponse & { data: InfraDiagnosticsPayload }> {
  return getSnapshot('/api/infra/diagnostics');
}

export async function getInfraLogs(
  serviceId: HostAgentServiceId,
  limit = 160,
): Promise<ApiResponse & { data: InfraLogsPayload }> {
  const response = (await apiBaseGet(
    `/api/infra/logs/${encodeURIComponent(serviceId)}`,
    { limit },
    { silent: true },
  )) as ApiResponse & { data: InfraLogsPayload };
  return requireSuccess(response);
}

export async function executeInfraAction(
  payload: InfraActionPayload,
): Promise<ApiResponse & { data: InfraActionResultPayload }> {
  const response = (await apiBasePost('/api/infra/actions', payload, { silent: true })) as ApiResponse & {
    data: InfraActionResultPayload;
  };
  return requireSuccess(response);
}
