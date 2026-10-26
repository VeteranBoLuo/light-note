// One clock for all visible contribution frames, including chat lists. Stopped
// instances unsubscribe, so neither offscreen nor reduced-motion frames consume frames.
const listeners = new Set<(delta: number) => void>();
let request = 0;
let previous = 0;
function tick(now: number) {
  request = 0;
  if (!previous || now - previous >= 1000 / 30) {
    const delta = previous ? Math.min((now - previous) / 1000, 0.08) : 0;
    previous = now;
    for (const listener of listeners) listener(delta);
  }
  if (listeners.size) request = requestAnimationFrame(tick);
}
export function subscribeContributionMotion(listener: (delta: number) => void) {
  listeners.add(listener);
  if (!request) {
    previous = 0;
    request = requestAnimationFrame(tick);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      cancelAnimationFrame(request);
      request = 0;
      previous = 0;
    }
  };
}
