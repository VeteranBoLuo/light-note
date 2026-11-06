export type AiBillingMode = 'daily_and_permanent' | 'permanent_only';
export const AI_QUOTA_POLICY_CHANGED = 'lightnote:ai-quota-policy-changed';
let knownMode: AiBillingMode | null = null;
export function observeAiBillingMode(value: unknown) {
  if (value !== 'daily_and_permanent' && value !== 'permanent_only') return;
  const changed = knownMode !== null && knownMode !== value;
  knownMode = value;
  if (changed && typeof window !== 'undefined') window.dispatchEvent(new Event(AI_QUOTA_POLICY_CHANGED));
}
