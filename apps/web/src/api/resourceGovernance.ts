import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import type {
  GovernanceAudit,
  GovernanceCapabilities,
  GovernanceFinding,
  GovernanceJob,
  GovernanceScan,
  GovernanceSummary,
} from '@/types/resourceGovernance.ts';

export interface GovernancePagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const createGovernanceScan = (scopes?: string[]) =>
  apiBasePost('/api/resource-governance/scans', scopes?.length ? { scopes } : {}, { silent: true });

export const getGovernanceScan = (id: string) =>
  apiBaseGet(`/api/resource-governance/scans/${encodeURIComponent(id)}`, undefined, { silent: true });

export const queryGovernanceFindings = (params: {
  page: number;
  pageSize: number;
  keyword?: string;
  riskLevel?: string;
  resourceType?: string;
  state?: string;
}) =>
  apiBasePost('/api/resource-governance/findings/query', params, { silent: true }) as Promise<{
    status: number;
    msg: string;
    data: GovernancePagedResult<GovernanceFinding> & {
      summary: GovernanceSummary;
      latestScan: GovernanceScan | null;
      capabilities: GovernanceCapabilities;
    };
  }>;

export const getGovernanceFinding = (id: string) =>
  apiBaseGet(`/api/resource-governance/findings/${encodeURIComponent(id)}`, undefined, { silent: true });

export const ignoreGovernanceFinding = (id: string, reasonCode: string) =>
  apiBasePost('/api/resource-governance/findings/ignore', { id, reasonCode });

export const previewGovernanceCleanup = (findingIds: string[]) =>
  apiBasePost('/api/resource-governance/jobs/preview', { findingIds }, { silent: true });

export const createGovernanceCleanupJob = (previewToken: string, confirmationPhrase: string) =>
  apiBasePost('/api/resource-governance/jobs', { previewToken, confirmationPhrase }, { silent: true });

export const queryGovernanceJobs = (page = 1, pageSize = 20) =>
  apiBasePost('/api/resource-governance/jobs/query', { page, pageSize }, { silent: true }) as Promise<{
    status: number;
    msg: string;
    data: GovernancePagedResult<GovernanceJob>;
  }>;

export const retryGovernanceJob = (id: string) =>
  apiBasePost(`/api/resource-governance/jobs/${encodeURIComponent(id)}/retry`, {}, { silent: true });

export const cancelGovernanceJob = (id: string) =>
  apiBasePost(`/api/resource-governance/jobs/${encodeURIComponent(id)}/cancel`, {}, { silent: true });

export const queryGovernanceAudits = (page = 1, pageSize = 20) =>
  apiBasePost('/api/resource-governance/audits/query', { page, pageSize }, { silent: true }) as Promise<{
    status: number;
    msg: string;
    data: GovernancePagedResult<GovernanceAudit>;
  }>;
