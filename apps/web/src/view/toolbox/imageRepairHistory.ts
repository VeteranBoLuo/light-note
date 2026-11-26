import type { RepairSelection } from './imageRepairSelection';

export type RepairOutput = { blob: Blob; url: string };
export type RepairEdit = { selections: readonly RepairSelection[]; output?: RepairOutput };
export type RepairHistory = { edits: readonly RepairEdit[]; index: number };

const MAX_UNDO_STEPS = 32;
// Limit the extra encoded repair images kept for undo. The current result is always available.
const MAX_HISTORY_IMAGE_BYTES = 48 * 1024 * 1024;

export function emptyRepairHistory(): RepairHistory {
  return { edits: [{ selections: [] }], index: 0 };
}

export function recordRepairEdit(history: RepairHistory, edit: RepairEdit): RepairHistory {
  const start = Math.max(0, history.index - MAX_UNDO_STEPS + 1);
  const retained = history.edits.slice(start, history.index + 1);
  const seen = new Set([edit.output]);
  let bytes = 0;
  for (let index = retained.length - 1; index >= 0; index -= 1) {
    const output = retained[index].output;
    if (!output || seen.has(output)) continue;
    bytes += output.blob.size;
    if (bytes > MAX_HISTORY_IMAGE_BYTES) {
      retained.splice(0, index + 1);
      break;
    }
    seen.add(output);
  }
  return { edits: [...retained, edit], index: retained.length };
}

export function discardRepairOutputs(previous: RepairHistory, next: RepairHistory) {
  const retained = new Set(next.edits.map((edit) => edit.output?.url));
  for (const url of new Set(previous.edits.map((edit) => edit.output?.url))) {
    if (url && !retained.has(url)) URL.revokeObjectURL(url);
  }
}
