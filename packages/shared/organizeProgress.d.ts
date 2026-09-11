export interface OrganizeLaneProgress {
  total: number;
  completed: number;
  partial: number;
  failed: number;
  cancelled: number;
  skipped: number;
  running: number;
  waiting: number;
  queued: number;
  settled: boolean;
}
export interface OrganizeOverview {
  inspection: {
    total: number;
    checked: number;
    skipped: number;
    settled: boolean;
  };
  direct: OrganizeLaneProgress;
  ai: OrganizeLaneProgress;
  review: {
    pending: number;
    manualObjects: number;
    retryFiles: number;
    outcomes?: OrganizeOutcomeCounts;
  };
}
export const ORGANIZE_TERMINAL_STATES: readonly string[];
export function summarizeOrganizeLane(
  rows: Array<{ itemId: string | null; status: string }>,
  settled?: boolean,
): OrganizeLaneProgress;
export function organizeOverviewStatus(
  overview: OrganizeOverview,
  status: string,
): string;

export type OrganizeOutcomeCounts = Record<
  | "review"
  | "manual"
  | "processing"
  | "unfinished"
  | "reviewed"
  | "unchanged"
  | "skipped"
  | "unavailable",
  number
>;
export function summarizeOrganizeOutcomes(
  rows: Array<Record<string, unknown>>,
  runStatus: string,
  runVersion?: number,
): OrganizeOutcomeCounts;

export function organizeObjectOutcome(
  row: Record<string, unknown>,
  runStatus: string,
  runVersion?: number,
): keyof OrganizeOutcomeCounts;
export function organizeOutcomeGroup(
  outcome: keyof OrganizeOutcomeCounts,
): string;
