export declare const HOST_AGENT_PROTOCOL_VERSION: 1;
export declare const HOST_AGENT_API_PREFIX: "/v1";
export declare const HOST_AGENT_ENDPOINTS: {
  readonly health: "/v1/health";
  readonly dashboard: "/v1/dashboard";
  readonly jobs: "/v1/jobs";
  readonly logsPrefix: "/v1/logs";
};

export type HostAgentServiceId =
  | "lightnote-api"
  | "lightnote-document-worker"
  | "lightnote-bookmark-icon-worker"
  | "lightnote-resource-governance-worker"
  | "nginx"
  | "mysql"
  | "redis";
export type RestartableHostAgentServiceId =
  | "lightnote-document-worker"
  | "lightnote-bookmark-icon-worker"
  | "lightnote-resource-governance-worker";
export type HostAgentAction = "nginx.reload" | "service.restart";
export type HostAgentServiceState =
  "running" | "stopped" | "degraded" | "unknown";
export type HostAgentJobState = "succeeded" | "failed" | "unknown";

export declare const HOST_AGENT_SERVICE_IDS: readonly HostAgentServiceId[];
export declare const HOST_AGENT_RESTARTABLE_SERVICE_IDS: readonly RestartableHostAgentServiceId[];
export declare const HOST_AGENT_ACTIONS: {
  readonly NGINX_RELOAD: "nginx.reload";
  readonly SERVICE_RESTART: "service.restart";
};
export declare const HOST_AGENT_SERVICE_STATES: readonly HostAgentServiceState[];
export declare const HOST_AGENT_JOB_STATES: readonly HostAgentJobState[];

export declare class HostAgentProtocolError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export interface HostAgentJobRequest {
  jobId: string;
  action: HostAgentAction;
  targetId: HostAgentServiceId;
}

export interface HostAgentMetricPoint {
  sampledAt: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  load1: number | null;
  networkRxBytesPerSecond: number | null;
  networkTxBytesPerSecond: number | null;
}

export interface HostAgentServiceSnapshot {
  id: HostAgentServiceId;
  state: HostAgentServiceState;
  detail: string;
  pid: number | null;
  uptimeSeconds: number | null;
  actions: HostAgentAction[];
}

export interface HostAgentCollectionError {
  source: string;
  code: string;
}

export interface HostAgentIdentity {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
}

export interface HostAgentMetrics {
  sampledAt: string;
  cpu: { percent: number | null; cores: number; loadAverage: number[] };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percent: number | null;
  };
  disk: {
    mountPoint: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percent: number | null;
  } | null;
  network: {
    rxBytes: number;
    txBytes: number;
    rxBytesPerSecond: number | null;
    txBytesPerSecond: number | null;
  } | null;
  uptimeSeconds: number;
  collectionErrors: HostAgentCollectionError[];
}

export interface HostAgentCapabilities {
  nginxReload: boolean;
  workerRestart: boolean;
}

export interface HostAgentDashboard {
  protocolVersion: 1;
  agentVersion: string;
  startedAt: string;
  sampledAt: string;
  host: HostAgentIdentity;
  metrics: HostAgentMetrics;
  history: HostAgentMetricPoint[];
  services: HostAgentServiceSnapshot[];
  capabilities: HostAgentCapabilities;
  collectionErrors: HostAgentCollectionError[];
}

export declare function isHostAgentServiceId(
  value: unknown,
): value is HostAgentServiceId;
export declare function isRestartableHostAgentServiceId(
  value: unknown,
): value is RestartableHostAgentServiceId;
export declare function normalizeHostAgentLogLimit(
  value: unknown,
  fallback?: number,
): number;
export declare function assertHostAgentProtocolVersion(value: unknown): 1;
export declare function validateHostAgentJobRequest(
  input: unknown,
): Readonly<HostAgentJobRequest>;
export declare function hostAgentLogsPath(
  serviceId: HostAgentServiceId,
  limit?: number,
): string;
