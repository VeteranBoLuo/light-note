/** Follow settling layouts without leaving an animation loop running on idle pages. */
export function createAnchorPositionTracker(options: {
  getAnchor: () => HTMLElement | null;
  isActive: () => boolean;
  update: () => void;
}) {
  let frame: number | null = null;
  let lastPosition = '';
  let stableFrames = 0;
  const stableFrameLimit = 8;

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastPosition = '';
    stableFrames = 0;
  }

  function track() {
    frame = null;
    if (!options.isActive()) return;
    const rect = options.getAnchor()?.getBoundingClientRect();
    if (!rect) return;
    const position = [rect.left, rect.top, rect.right, rect.bottom].map(value => value.toFixed(2)).join(':');
    if (position !== lastPosition) {
      lastPosition = position;
      stableFrames = 0;
      options.update();
    } else {
      stableFrames += 1;
    }
    if (options.isActive() && stableFrames < stableFrameLimit) frame = requestAnimationFrame(track);
  }

  function start() {
    stop();
    if (options.isActive()) frame = requestAnimationFrame(track);
  }

  return { start, stop };
}
