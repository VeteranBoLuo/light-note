// Acquire before cold reads or index transfers allocate additional bodies or
// connections. Each gate admits one lifecycle and bounds its waiting callers.
const MAX_WAITING = 32;
const MAX_WAIT_MS = 30_000;

function busyError() {
  return Object.assign(new Error('Private search index is busy; retry shortly'), {
    code: 'AI_PERSONAL_SEARCH_BUSY',
    status: 503,
  });
}

export function createPersonalSearchBuildGate() {
  let active = false;
  const waiting = [];
  function grant(resolve) {
    active = true;
    let released = false;
    resolve(() => {
      if (released) return;
      released = true;
      const next = waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        grant(next.resolve);
      } else active = false;
    });
  }

  return function acquire() {
    return new Promise((resolve, reject) => {
      if (!active) return grant(resolve);
      if (waiting.length >= MAX_WAITING) return reject(busyError());
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        reject(busyError());
      }, MAX_WAIT_MS);
      entry.timer.unref();
      waiting.push(entry);
    });
  };
}

export const acquirePersonalSearchBuild = createPersonalSearchBuildGate();
