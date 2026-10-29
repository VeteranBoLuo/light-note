export const MANOR_VERSION: 'knowledge-manor-v3';
export const MANOR_COMMANDS: readonly string[];
export interface ManorState {
  version: string;
  now: number;
  wallet: number;
  adopted: boolean;
  guide: string | null;
  water: number;
  xp: number;
  emptyCastStreak: number;
  seeds: Record<string, number>;
  plots: Array<{ next?: number; [key: string]: unknown }>;
  [key: string]: unknown;
}
export interface ManorSnapshot {
  version: string;
  revision: number;
  state: ManorState;
  quests: Array<{ key: string; done: boolean; [key: string]: unknown }>;
  result?: unknown;
  replayed?: boolean;
  runtime?: { mode: 'open' | 'maintenance'; message: string; revision: number };
}
export interface ManorCommand {
  requestId: string;
  revision: number;
  version: string;
  action: string;
  args: unknown[];
}
export class ManorError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export const MANOR_SPECIES: Readonly<Record<string, Record<string, unknown>>>;
export interface ManorContext {
  now: Date | string | number;
  points: number;
  calendar: { dayKey: string; weekKey: string; utcOffsetMinutes: number; timezone?: string };
  dailyDone?: boolean[];
  supplyEligibility?: Record<string, boolean>;
  random?: () => number;
}
export function createManor(context: ManorContext): ManorState;
export function projectManor(saved: ManorState, context: ManorContext): ManorState;
export function executeManorCommand(saved: ManorState, command: { action: string; args: unknown[] }, context: ManorContext & { random: () => number }): { state: ManorState; result: unknown; pointsDelta: number };
export const manorModel: typeof import('./manorModel.js').default;
