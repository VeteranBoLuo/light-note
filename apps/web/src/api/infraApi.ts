import { apiBaseGet, apiBasePost, type ApiResponse } from '@/http/request';
import type {
  HostAgentAction,
  HostAgentDashboard,
  HostAgentJobState,
  HostAgentServiceId,
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
