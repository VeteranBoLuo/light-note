export interface AiConfirmationPreviewDetail {
  key: string;
  value: string;
}

export interface AiToolConfirmationPreview {
  title?: string;
  target?: string;
  impact?: string;
  details?: AiConfirmationPreviewDetail[];
}

export interface AiToolConfirmation {
  token: string;
  id: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  expiresIn: number;
  riskLevel?: 'low' | 'medium' | 'high';
  preview?: AiToolConfirmationPreview;
}

export interface AiToolConfirmationResolution {
  toolName: string;
  summary: string;
  sources: unknown[];
}

export type AiToolConfirmationSettlementStatus = 'confirmed' | 'cancelled' | 'editing' | 'failed' | 'expired';

export interface AiToolConfirmationSettlement {
  confirmationId: string;
  toolName: string;
  status: AiToolConfirmationSettlementStatus;
  summary: string;
}

export type AiAgentInteractionType = 'single_choice' | 'multi_choice' | 'confirmation';

export type AiAgentInteractionPurpose = 'choice' | 'choice_confirmation';

export interface AiAgentInteractionOption {
  id: string;
  label: string;
  description?: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number | boolean>;
  recommended?: boolean;
  disabled?: boolean;
}

export interface AiAgentInteraction {
  token: string;
  id: string;
  sessionId: string;
  code?: string;
  type: AiAgentInteractionType;
  purpose: AiAgentInteractionPurpose;
  title: string;
  description?: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number | boolean>;
  options: AiAgentInteractionOption[];
  minSelections: number;
  maxSelections: number;
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  expiresIn: number;
}

export interface AiAgentInteractionResponse {
  selectedIds: string[];
  customValue: string;
  cancelled: boolean;
}

export type AiAgentInteractionResolution =
  | { state: 'cancelled' }
  | { state: 'edit_required'; toolName: string; args: Record<string, unknown> }
  | { state: 'confirmation_required'; confirmation: AiToolConfirmation }
  | { state: 'resolved'; summary?: string };

export type AiAgentInteractionSettlementStatus =
  | 'advanced'
  | 'resolved'
  | 'cancelled'
  | 'editing'
  | 'failed'
  | 'expired';

export interface AiAgentInteractionSettlement {
  interactionId: string;
  status: AiAgentInteractionSettlementStatus;
  summary: string;
}
