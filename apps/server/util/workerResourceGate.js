/** FIFO admission before claiming a job: queued lanes hold neither leases nor DB connections. */
export function createWorkerResourceGate(limit) {
  let active = 0;
  const waiting = [];
  function drain() {
    while (active < limit && waiting.length) {
      const { work, stopped, resolve, reject } = waiting.shift();
      if (stopped()) {
        resolve(false);
        continue;
      }
      active += 1;
      Promise.resolve()
        .then(() => (stopped() ? false : work()))
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }
  return (work, stopped = () => false) =>
    new Promise((resolve, reject) => {
      waiting.push({ work, stopped, resolve, reject });
      drain();
    });
}
