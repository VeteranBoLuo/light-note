export type AiOperationsStatus = 'success' | 'partial' | 'failed' | 'quota_blocked' | 'aborted' | 'running';

export interface AiOperationsActor {
  id: string;
  alias: string | null;
  role: string | null;
}

export interface AiOperationsExecution {
  id: string;
  requestId: string;
  actionId: string;
  module: string;
  labelKey: string;
  unit: string;
  createdAt: number;
  updatedAt: number;
  status: AiOperationsStatus | string;
  modelCalled: boolean;
  providerCallCount: number;
  providerTokens: number;
  chargedTokens: number;
  platformCoveredTokens: number;
  usageComplete: boolean;
  quotaSettlementStatus: string;
  durationMs: number;
  actor: AiOperationsActor;
  subject: AiOperationsActor;
  billingPolicy: string;
  surface: string;
  skillVersion: number | null;
  billingRuleVersion: number | null;
  validationRuleVersion: number | null;
  providers: string[];
  models: string[];
  estimatedCost: number;
  failedProviderCalls: number;
  missingUsageCalls: number;
  platformCalls: number;
  errorCategory: string | null;
  errorCode: string | null;
  staleRunning: boolean;
  usageAttention: boolean;
  settlementAttention: boolean;
}

export interface AiOperationsSummary {
  executions: number;
  actors: number;
  modelActions: number;
  providerCalls: number;
  providerTokens: number;
  chargedTokens: number;
  platformCoveredTokens: number;
  estimatedCost: number;
  delivered: number;
  succeeded: number;
  partial: number;
  failed: number;
  quotaBlocked: number;
  aborted: number;
  running: number;
  deliveryRate: number;
  technicalErrorRate: number;
  averageDurationMs: number;
  durationP95: number;
  anomalySignals: number;
  staleRunning: number;
  usageMissing: number;
  settlementAttention: number;
}

export interface AiOperationsDay {
  date: string;
  executions: number;
  modelActions: number;
  providerTokens: number;
  chargedTokens: number;
  delivered: number;
  failures: number;
}

export interface AiOperationsModule {
  module: string;
  executions: number;
  modelActions: number;
  providerTokens: number;
  chargedTokens: number;
  failures: number;
}

export interface AiOperationsProvider {
  provider: string | null;
  model: string | null;
  calls: number;
  tokens: number;
  estimatedCost: number;
  failedCalls: number;
  missingUsageCalls: number;
  platformCalls: number;
}

export interface AiOperationsOverview {
  timezone: string;
  generatedAt: number;
  summary: AiOperationsSummary;
  daily: AiOperationsDay[];
  modules: AiOperationsModule[];
  providers: AiOperationsProvider[];
}

export type AiOperationsChipTone = 'success' | 'danger' | 'pending' | 'neutral';

export function aiOperationsStatusTone(status: string): AiOperationsChipTone {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (['partial', 'quota_blocked', 'running'].includes(status)) return 'pending';
  return 'neutral';
}

export function aiOperationsStatusKey(status: string) {
  return ['success', 'partial', 'failed', 'quota_blocked', 'aborted', 'running'].includes(status) ? status : 'failed';
}

export function actorDisplay(actor: AiOperationsActor | null | undefined, fallback: string) {
  return String(actor?.alias || actor?.id || '').trim() || fallback;
}

export function actorsDiffer(execution: Pick<AiOperationsExecution, 'actor' | 'subject'>) {
  const actorId = String(execution.actor?.id || '').trim();
  const subjectId = String(execution.subject?.id || '').trim();
  return Boolean(subjectId && actorId !== subjectId);
}

export function providerModelDisplay(execution: Pick<AiOperationsExecution, 'providers' | 'models'>, fallback: string) {
  const provider = execution.providers?.filter(Boolean).join(' / ');
  const model = execution.models?.filter(Boolean).join(' / ');
  return [provider, model].filter(Boolean).join(' · ') || fallback;
}

export function chartHeight(value: unknown, maximum: unknown, minimum = 3) {
  const amount = Math.max(0, Number(value || 0));
  const max = Math.max(0, Number(maximum || 0));
  if (!max || !amount) return 0;
  return Math.min(100, Math.max(minimum, Math.round((amount / max) * 1000) / 10));
}
