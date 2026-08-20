export interface TodoReminderProjectionInput {
  reminder?: {
    mode?: string;
    paused?: boolean;
    nextAt?: string | null;
    startAt?: string | null;
    version?: number;
    once?: {
      type?: string;
      fixedAt?: string | null;
      offsetMinutes?: number | null;
    } | null;
    trigger?: {
      type?: string;
      fixedTime?: string | null;
      offsetMinutes?: number | null;
    } | null;
  } | null;
  reminderAt?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  occurrenceDate?: string | Date | null;
}

export declare function resolveTodoNextReminderAt(
  item?: TodoReminderProjectionInput,
): string;
export declare function resolveTodoConfiguredReminderAt(
  item?: TodoReminderProjectionInput,
): string;
export declare function resolveTodoReminderAt(
  item?: TodoReminderProjectionInput,
): string;
