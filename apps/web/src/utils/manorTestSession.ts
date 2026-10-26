import { createManor, executeManorCommand, projectManor, MANOR_VERSION, type ManorContext, type ManorSnapshot } from '@lightnote/shared/manor';

/** Root's disposable test save. It never calls the API or the formal asset ledger. */
export function createManorTestSession(formal: ManorSnapshot, clock = () => Date.now(), random = Math.random, restored?: { snapshot: ManorSnapshot; savedAt: number }) {
  if (restored) formal = restored.snapshot;
  const source = structuredClone(formal), started = clock();
  const anchor = Number(source.state.clockOrigin) + source.state.now * 3_600_000 + (restored ? Math.max(0, started - restored.savedAt) : 0);
  const context = (points: number): ManorContext & { random: () => number } => ({
    now: new Date(anchor + clock() - started), points, random,
    calendar: { dayKey: String(source.state.dayKey), weekKey: String(source.state.weekKey), utcOffsetMinutes: Number(source.state.calendarOffsetMinutes), timezone: source.state.calendarTimezone ? String(source.state.calendarTimezone) : undefined },
    dailyDone: source.quests.length === 3 ? source.quests.map(q => q.done) : [false,false,false],
    supplyEligibility: structuredClone(source.state.supplyEligibility || {}) as Record<string, boolean>,
  });
  let state = restored ? source.state : createManor(context(source.state.wallet)), revision = restored ? source.revision : 0;
  const snapshot = (result?: unknown): ManorSnapshot => ({ version: MANOR_VERSION, revision, state: projectManor(state,context(state.wallet)), quests: structuredClone(source.quests), result });
  return {
    snapshot,
    checkpoint: () => ({ snapshot: snapshot(), savedAt: clock() }),
    execute(action: string, args: unknown[]) {
      const next = executeManorCommand(state, {action,args}, context(state.wallet));
      state = next.state; revision++;
      return snapshot(next.result);
    },
  };
}

const testKey = (owner: string) => `lightnote-manor-test-v1:${owner}`;
type TestSession = ReturnType<typeof createManorTestSession>;
// sessionStorage keeps refreshes in this tab on the test save. No formal snapshot
// is stored here, and a different account cannot resume another account's test.
export function saveManorTestSession(owner: string, session: TestSession | null, storage?: Storage) {
  try {
    const tabStore = storage || window.sessionStorage;
    if (session) tabStore.setItem(testKey(owner), JSON.stringify({ owner, version: MANOR_VERSION, ...session.checkpoint() }));
    else tabStore.removeItem(testKey(owner));
  } catch { /* A blocked/full tab store must never affect a formal command. */ }
}
export function readManorTestSession(owner: string, clock = () => Date.now(), random = Math.random, storage?: Storage): TestSession | null {
  try {
    const raw = (storage || window.sessionStorage).getItem(testKey(owner));
    if (!raw) return null;
    const saved = JSON.parse(raw), value = saved.snapshot as ManorSnapshot;
    if (saved.owner !== owner || saved.version !== MANOR_VERSION || value?.version !== MANOR_VERSION
      || !Number.isFinite(saved.savedAt) || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !Number.isFinite(value.state?.now) || !Array.isArray(value.state.plots) || value.state.plots.length !== 8
      || !Array.isArray(value.quests) || value.quests.some(q => typeof q.key !== 'string' || typeof q.done !== 'boolean')) throw new Error('Invalid test save');
    const session = createManorTestSession(value, clock, random, saved);
    session.snapshot(); // Validate the shared model projection before using it.
    return session;
  } catch {
    saveManorTestSession(owner, null, storage);
    return null;
  }
}
