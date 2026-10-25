import { createManor, executeManorCommand, projectManor, MANOR_VERSION, type ManorContext, type ManorSnapshot } from '@lightnote/shared/manor';

/** Root's disposable process-local session. It has no API, persistence or asset-ledger writer. */
export function createManorTestSession(formal: ManorSnapshot, clock = () => Date.now(), random = Math.random) {
  const source = structuredClone(formal), started = clock();
  const anchor = Number(source.state.clockOrigin) + source.state.now * 3_600_000;
  const context = (points: number): ManorContext & { random: () => number } => ({
    now: new Date(anchor + clock() - started), points, random,
    calendar: { dayKey: String(source.state.dayKey), weekKey: String(source.state.weekKey), utcOffsetMinutes: Number(source.state.calendarOffsetMinutes), timezone: source.state.calendarTimezone ? String(source.state.calendarTimezone) : undefined },
    dailyDone: source.quests.length === 3 ? source.quests.map(q => q.done) : [false,false,false],
    supplyEligibility: structuredClone(source.state.supplyEligibility || {}) as Record<string, boolean>,
  });
  let state = createManor(context(source.state.wallet)), revision = 0;
  const snapshot = (result?: unknown): ManorSnapshot => ({ version: MANOR_VERSION, revision, state: projectManor(state,context(state.wallet)), quests: structuredClone(source.quests), result });
  return {
    snapshot,
    execute(action: string, args: unknown[]) {
      const next = executeManorCommand(state, {action,args}, context(state.wallet));
      state = next.state; revision++;
      return snapshot(next.result);
    },
  };
}
