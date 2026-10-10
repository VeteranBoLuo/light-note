export type BoardLane = "inbox" | "knowledge" | "action";
export type BoardCommand = {
  type:
    | "create"
    | "edit"
    | "status"
    | "convert"
    | "repeat"
    | "reorder"
    | "undo"
    | "details"
    | "createTodo";
  itemId?: string;
  lane?: BoardLane;
  status?: "open" | "in_progress" | "done" | "archived";
  title?: string;
  content?: string;
  dueOn?: string | null;
  ids?: string[];
  targetIndex?: number;
  undoId?: string;
  todoId?: string | null;
  /** Atomically create a concrete todo with a newly created/derived action. */
  createLinkedTodo?: boolean;
  details?: {
    evidence: {
      type: "note" | "bookmark" | "file";
      resourceId: string;
      explanation: string;
      refresh?: boolean;
    }[];
    conclusionStatus: "tentative" | "confirmed" | "review" | null;
    conclusionNoteId: string | null;
  };
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
