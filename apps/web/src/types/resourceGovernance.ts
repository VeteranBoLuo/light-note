export type GovernanceRisk = 'safe' | 'review' | 'blocked';
export type GovernanceFindingState = 'open' | 'ignored' | 'queued' | 'resolved' | 'stale';
export type GovernanceActionKind = 'cleanup' | 'cleanup_invalid_owner';

export interface GovernanceFinding {
  id: string;
  scanId: string;
  issueCode: string;
  resourceType: string;
  targetId?: string | null;
  ownerId?: string | null;
  riskLevel: GovernanceRisk;
  state: GovernanceFindingState;
  estimatedBytes: number;
  evidenceJson: Record<string, unknown>;
  observationCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt?: string | null;
  resolutionCode?: string | null;
  actionKind?: GovernanceActionKind | null;
  actionEligible?: boolean;
}

export interface GovernanceSummary {
  total: number;
  safe: number;
  review: number;
  blocked: number;
  estimatedBytes: number;
}

export interface GovernanceScan {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  scopeJson?: { scopes?: string[] };
  summaryJson?: Record<string, unknown>;
  startedAt?: string | null;
  heartbeatAt?: string | null;
  finishedAt?: string | null;
  lastErrorCode?: string | null;
  createTime: string;
}

export interface GovernanceCapabilities {
  scanEnabled: boolean;
  cleanupEnabled: boolean;
  reviewCleanupEnabled: boolean;
}

export interface GovernanceJob {
  id: string;
  createdBy: string;
  riskLevel: GovernanceRisk;
  status: string;
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  estimatedBytes: number;
  releasedBytes: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastErrorCode?: string | null;
  createTime: string;
}

export interface GovernanceAudit {
  id: number;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: string;
  summaryJson?: Record<string, unknown>;
  createTime: string;
}
