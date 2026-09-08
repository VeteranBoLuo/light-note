export type BoardLane = "inbox" | "knowledge" | "action";
export type BoardCommand = {
  type:
    "create" | "edit" | "status" | "convert" | "repeat" | "reorder" | "undo";
  itemId?: string;
  lane?: BoardLane;
  status?: "open" | "in_progress" | "done" | "archived";
  title?: string;
  content?: string;
  dueOn?: string | null;
  ids?: string[];
  targetIndex?: number;
  undoId?: string;
};
export const BOARD_LANES: BoardLane[];
export function boardConversion(
  from: BoardLane,
  to: BoardLane,
): "move" | "derive" | "result" | null;
export function applyBoardOperation<T>(
  items: T[],
  command: BoardCommand,
  context: { id: string; now: string },
): { items: T[]; focusItemId: string | null };
