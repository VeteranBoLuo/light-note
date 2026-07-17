import type { AiAgentInteraction, AiAgentInteractionResponse } from '@/types/aiAgent';

export interface AiInteractionSelectionState {
  selectedIds: string[];
  customValue: string;
}

export function createInteractionSelection(): AiInteractionSelectionState {
  return { selectedIds: [], customValue: '' };
}

function selectableOptionIds(interaction: AiAgentInteraction) {
  return new Set(interaction.options.filter((option) => !option.disabled).map((option) => option.id));
}

export function toggleInteractionOption(
  interaction: AiAgentInteraction,
  state: AiInteractionSelectionState,
  optionId: string,
): AiInteractionSelectionState {
  if (!selectableOptionIds(interaction).has(optionId)) return state;
  if (interaction.type !== 'multi_choice') {
    return { selectedIds: [optionId], customValue: '' };
  }
  const selected = new Set(state.selectedIds);
  if (selected.has(optionId)) selected.delete(optionId);
  else if (selected.size < interaction.maxSelections) selected.add(optionId);
  return { ...state, selectedIds: [...selected] };
}

export function updateInteractionCustomValue(
  interaction: AiAgentInteraction,
  state: AiInteractionSelectionState,
  value: string,
): AiInteractionSelectionState {
  if (!interaction.allowCustom) return state;
  return {
    selectedIds: interaction.type === 'multi_choice' ? state.selectedIds : [],
    customValue: value,
  };
}

export function interactionSelectionCount(state: AiInteractionSelectionState) {
  return state.selectedIds.length + (state.customValue.trim() ? 1 : 0);
}

export function canSubmitInteraction(interaction: AiAgentInteraction, state: AiInteractionSelectionState) {
  const count = interactionSelectionCount(state);
  return count >= interaction.minSelections && count <= interaction.maxSelections;
}

export function freezeInteractionResponse(
  state: AiInteractionSelectionState,
  cancelled = false,
): Readonly<AiAgentInteractionResponse> {
  return Object.freeze({
    selectedIds: Object.freeze([...state.selectedIds]) as unknown as string[],
    customValue: state.customValue.trim(),
    cancelled,
  });
}

export function isRetryableInteractionError(error: any) {
  const status = Number(error?.status || error?.response?.status || 0);
  const retryable = error?.retryable ?? error?.response?.data?.data?.retryable;
  return retryable === true || status === 409 || status >= 500 || status === 0;
}
