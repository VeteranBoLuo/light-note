export type ReuseResourceType = 'bookmark' | 'note' | 'file';
type Target = { resourceType: ReuseResourceType; resourceId: string };
const types = new Set(['bookmark', 'note', 'file']);

export function createResourceReuseRuntime(options: {
  report: (target: Target, signal: AbortSignal) => Promise<boolean>;
  doc?: Document;
  win?: Window;
  now?: () => number;
}) {
  const doc = options.doc || document;
  const win = options.win || window;
  const now = options.now || Date.now;
  let owner = '';
  let generation = 0;
  let suspension = 0;
  let lastInput = -Infinity;
  let nextAttempt = 0;
  let disposed = false;
  const completed = new Set<ReuseResourceType>();
  const attempts = new Map<string, number>();
  const pending = new Map<string, AbortController>();
  const foreground = () => doc.visibilityState === 'visible' && doc.hasFocus();
  function send(resourceType: ReuseResourceType, value: unknown) {
    const resourceId = String(value ?? '');
    if (
      disposed ||
      !owner ||
      !foreground() ||
      !types.has(resourceType) ||
      !/^[a-zA-Z0-9:_-]{1,255}$/.test(resourceId) ||
      completed.has(resourceType)
    )
      return;
    const key = `${resourceType}:${resourceId}`;
    const day = new Date(now() + 8 * 3_600_000).toISOString().slice(0, 10);
    const attemptKey = `${day}:${key}`;
    if (pending.has(key) || now() < nextAttempt || now() - (attempts.get(attemptKey) ?? -Infinity) < 60_000) return;
    // Bounded memory and traffic; no persistent content identifiers or offline replay queue.
    if (attempts.size >= 200) attempts.delete(attempts.keys().next().value!);
    attempts.set(attemptKey, now());
    nextAttempt = now() + 2000;
    const actorGeneration = generation;
    const controller = new AbortController();
    pending.set(key, controller);
    void Promise.resolve()
      .then(() => {
        if (actorGeneration !== generation || controller.signal.aborted) return false;
        return options.report({ resourceType, resourceId }, controller.signal);
      })
      .then((accepted) => {
        if (accepted && actorGeneration === generation) completed.add(resourceType);
      })
      .catch(() => {
        // No toast and no automatic retry. The next deliberate action may retry later.
      })
      .finally(() => {
        if (pending.get(key) === controller) pending.delete(key);
      });
  }
  function suspend() {
    lastInput = -Infinity;
    suspension++;
  }
  function onInput(event: Event) {
    if (!event.isTrusted || !owner || disposed || !foreground()) return;
    if (
      event.type === 'keydown' &&
      ((event as KeyboardEvent).repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes((event as KeyboardEvent).key))
    )
      return;
    lastInput = now();
    // Direct URL/refresh does not count by itself. An explicit action within loaded content does.
    if (!['click', 'keydown', 'wheel'].includes(event.type)) return;
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-reuse-resource-id]') : null;
    if (target) send(target.dataset.reuseResourceType as ReuseResourceType, target.dataset.reuseResourceId);
  }
  const events = ['click', 'keydown', 'wheel', 'pointerdown', 'mousedown', 'touchstart'];
  for (const type of events) doc.addEventListener(type, onInput, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', suspend);
  win.addEventListener('blur', suspend);
  return {
    setOwner(value: string) {
      if (owner === value) return;
      owner = value;
      generation++;
      suspend();
      nextAttempt = 0;
      completed.clear();
      attempts.clear();
      for (const request of pending.values()) request.abort();
      pending.clear();
    },
    captureOpen() {
      const actorGeneration = generation;
      const capturedSuspension = suspension;
      const capturedAt = now();
      const eligible = Boolean(owner) && foreground() && capturedAt - lastInput < 1500;
      return (type: ReuseResourceType, id: unknown) => {
        if (
          eligible &&
          actorGeneration === generation &&
          capturedSuspension === suspension &&
          now() - capturedAt < 30_000
        )
          send(type, id);
      };
    },
    dispose() {
      disposed = true;
      this.setOwner('');
      for (const type of events) doc.removeEventListener(type, onInput, true);
      doc.removeEventListener('visibilitychange', suspend);
      win.removeEventListener('blur', suspend);
    },
  };
}

let active: ReturnType<typeof createResourceReuseRuntime> | null = null;
export function bindResourceReuseRuntime(runtime: typeof active) {
  active = runtime;
}
export function captureResourceOpen() {
  return active?.captureOpen() || (() => {});
}
