import { generateNoteDraft } from '../../noteDraft.js';

export async function runNoteDraftTurn(input = {}) {
  const draft = await generateNoteDraft(input);
  return {
    runner: 'note_draft',
    state: 'ready_for_confirmation',
    draft,
    toolCalls: [],
  };
}
