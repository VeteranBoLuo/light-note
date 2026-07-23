import type { AiToolActionReceipt, AiToolConfirmation } from '@/types/aiAgent';

export function resolveSucceededActionReceipt(
  value: unknown,
  confirmation: Pick<AiToolConfirmation, 'id' | 'toolName' | 'capabilityId'>,
): AiToolActionReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const receipt = value as Partial<AiToolActionReceipt>;
  const expectedCapabilityId = String(confirmation.capabilityId || '').trim();
  if (
    receipt.status !== 'succeeded' ||
    String(receipt.actionId || '') !== confirmation.id ||
    String(receipt.toolName || '') !== confirmation.toolName ||
    (expectedCapabilityId && String(receipt.capabilityId || '') !== expectedCapabilityId) ||
    !String(receipt.completedAt || '').trim()
  ) {
    return null;
  }
  return {
    actionId: confirmation.id,
    toolName: confirmation.toolName,
    capabilityId: String(receipt.capabilityId || '') || undefined,
    status: 'succeeded',
    summary: String(receipt.summary || ''),
    completedAt: String(receipt.completedAt),
  };
}
