import type { AiSkillResourceRef, AiSkillRequest } from '@lightnote/shared/ai-skill-protocol';
export interface EntitlementJourney {
  userId: string;
  flowId: string;
  source: string;
  asset: 'ai' | 'storage';
  returnPath: string;
  recoveryKey?: string;
  prompt?: string;
  createdAt: number;
  returning?: boolean;
  task?: {
    title?: string;
    showGrounding?: boolean;
    promptKey?: string;
    skillId: string;
    surface: string;
    input: Record<string, unknown>;
    resourceRefs: AiSkillResourceRef[];
    scopeSelector?: AiSkillRequest['scope']['selector'];
  };
}
const KEY = 'light-note:entitlement-journey:v1';
export function clearEntitlementJourney() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Storage can be disabled. */
  }
}
export function readEntitlementJourney(userId: string): EntitlementJourney | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(KEY) || 'null';
    if (raw.length > 250000) {
      clearEntitlementJourney();
      return null;
    }
    const value = JSON.parse(raw);
    if (!value) return null;
    if (
      !userId ||
      value.userId !== userId ||
      !Number.isFinite(value.createdAt) ||
      Date.now() - value.createdAt > 86400000 ||
      value.createdAt > Date.now() ||
      typeof value.returnPath !== 'string' ||
      !/^\/(?![\/\\])/.test(value.returnPath) ||
      /[\x00-\x1f\\]/.test(value.returnPath) ||
      !/^[a-f0-9-]{36}$/.test(value.flowId)
    ) {
      clearEntitlementJourney();
      return null;
    }
    if (
      value.task &&
      (typeof value.task.skillId !== 'string' ||
        typeof value.task.surface !== 'string' ||
        !value.task.input ||
        typeof value.task.input !== 'object' ||
        !Array.isArray(value.task.resourceRefs))
    ) {
      clearEntitlementJourney();
      return null;
    }
    return value;
  } catch {
    clearEntitlementJourney();
    return null;
  }
}
export function saveEntitlementJourney(input: Omit<EntitlementJourney, 'flowId' | 'createdAt'>): EntitlementJourney {
  const value = { ...input, flowId: crypto.randomUUID(), createdAt: Date.now() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Navigation remains usable. */
  }
  return value;
}

export function prepareEntitlementReturn(userId: string) {
  const value = readEntitlementJourney(userId);
  if (!value) return null;
  value.returning = true;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Same-page state can still return. */
  }
  return value;
}
export function finishEntitlementReturn(userId: string) {
  const value = readEntitlementJourney(userId);
  if (!value) return;
  value.returning = false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* No automatic execution. */
  }
}
