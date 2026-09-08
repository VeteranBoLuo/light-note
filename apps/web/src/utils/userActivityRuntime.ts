/** No reactive state or layout reads in input handlers. One runtime per app, one pending report. */
export const ACTIVITY_GRACE_MS = 5 * 60_000;
const MIN_REPORT_MS = 60_000;
const beijingDay = (time: number) => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
export type ActivitySignal = 'interaction' | 'reading';
export interface ActivityRuntimeOptions {
  report: (signal: ActivitySignal, signalAbort: AbortSignal) => Promise<boolean>;
  doc?: Document;
  win?: Window;
  now?: () => number;
  random?: () => number;
}

export function createUserActivityRuntime(options: ActivityRuntimeOptions) {
  const doc = options.doc || document;
  const win = options.win || window;
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  let owner = '';
  let generation = 0;
  let lastInput = -Infinity;
  let lastReport = -Infinity;
  let nextAttempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;
  let disposed = false;
  let channel: BroadcastChannel | undefined;
  const foreground = () => doc.visibilityState === 'visible' && (typeof doc.hasFocus !== 'function' || doc.hasFocus());
  const qualified = () => !disposed && Boolean(owner) && foreground() && now() - lastInput < ACTIVITY_GRACE_MS;
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const interval = () => MIN_REPORT_MS + Math.floor(random() * 10_000);
  const earliestReport = () =>
    Number.isFinite(lastReport) && beijingDay(lastReport) === beijingDay(now()) ? lastReport + MIN_REPORT_MS : 0;

  function schedule() {
    if (timer !== undefined || controller || !qualified()) return;
    const delay = Math.max(0, nextAttempt - now(), earliestReport() - now());
    if (now() + delay - lastInput >= ACTIVITY_GRACE_MS) return;
    timer = setTimeout(() => {
      timer = undefined;
      void send();
    }, delay);
  }
  async function send() {
    if (!qualified() || controller) return;
    const sequence = generation;
    const actor = owner;
    const abort = new AbortController();
    controller = abort;
    nextAttempt = now() + interval();
    const attempt = async () => {
      if (sequence !== generation || !qualified() || now() < earliestReport()) return;
      const submittedAt = now();
      const accepted = await options.report(submittedAt - lastInput < 1000 ? 'interaction' : 'reading', abort.signal);
      if (accepted && sequence === generation && !abort.signal.aborted) {
        // Receipt time, not request start, keeps client cadence outside the server's coalescing interval.
        lastReport = now();
        nextAttempt = lastReport + interval();
        channel?.postMessage({ owner: actor, reportedAt: lastReport });
      }
    };
    try {
      let locks: LockManager | undefined;
      try {
        locks = win.navigator.locks;
      } catch {
        /* Restricted contexts may deny the API getter. */
      }
      if (locks?.request) {
        let entered = false;
        try {
          await locks.request(`ln-activity:${actor}`, { ifAvailable: true }, async (lock) => {
            if (lock) {
              entered = true;
              await attempt();
            }
          });
        } catch (error) {
          if (entered) throw error;
          // Unsupported/denied Web Locks falls back to page throttling, never duplicates a started report.
          await attempt();
        }
      } else await attempt();
    } catch {
      /* Analytics failure must not interrupt the product or cause a retry loop. */
    } finally {
      if (controller === abort) controller = null;
      schedule();
    }
  }
  function suspend() {
    generation++;
    lastInput = -Infinity;
    clearTimer();
    controller?.abort();
  }
  const onInput = (event: Event) => {
    if (!event.isTrusted || !owner || !foreground() || disposed) return;
    // Ignore modifier-only keys and OS auto-repeat: a held key must not keep a page alive forever.
    if (
      event.type === 'keydown' &&
      ((event as KeyboardEvent).repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes((event as KeyboardEvent).key))
    )
      return;
    lastInput = now();
    schedule();
  };
  const onVisibility = () => {
    if (!foreground()) suspend();
  };
  const inputEvents = ['keydown', 'wheel', ...('PointerEvent' in win ? ['pointerdown'] : ['mousedown', 'touchstart'])];
  for (const type of inputEvents) doc.addEventListener(type, onInput, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('blur', suspend);
  win.addEventListener('pagehide', suspend);
  try {
    const Channel = (win as unknown as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
    if (Channel) {
      channel = new Channel('ln-user-activity-v1');
      channel.onmessage = ({ data }) => {
        const time = data?.reportedAt;
        if (
          data?.owner !== owner ||
          !Number.isFinite(time) ||
          time > now() ||
          now() - time > 70_000 ||
          time <= lastReport
        )
          return;
        lastReport = time;
        // A successful report from another tab suppresses traffic but never grants reading eligibility.
        clearTimer();
        schedule();
      };
    }
  } catch {
    /* WebView/private-mode fallback: server coalescing still bounds writes. */
  }
  return {
    setOwner(value: string) {
      if (owner === value) return;
      suspend();
      owner = value;
      lastReport = -Infinity;
      nextAttempt = 0;
    },
    dispose() {
      disposed = true;
      suspend();
      channel?.close();
      for (const type of inputEvents) doc.removeEventListener(type, onInput, true);
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('blur', suspend);
      win.removeEventListener('pagehide', suspend);
    },
  };
}
