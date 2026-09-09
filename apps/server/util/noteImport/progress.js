const stages = new Set(['reading', 'extracting_images', 'sanitizing', 'parsed', 'publishing_images', 'writing_note']);
export function normalizeImportProgress(value) {
  if (!value || !stages.has(value.stage)) return null;
  const count = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : 0);
  const total = (n) => (n == null ? null : count(n));
  return {
    stage: value.stage,
    currentFile: String(value.currentFile || '')
      .replaceAll('\\', '/')
      .split('/')
      .pop()
      .slice(0, 255),
    currentItemId: /^[a-f0-9-]{36}$/i.test(value.currentItemId || '') ? value.currentItemId : undefined,
    filesDone: count(value.filesDone),
    filesTotal: total(value.filesTotal),
    imagesDone: count(value.imagesDone),
    imagesTotal: total(value.imagesTotal),
    updatedAt: new Date().toISOString(),
  };
}
// Serial writes prevent a slow earlier update from overwriting a newer stage.
export function createProgressReporter(write, now = Date.now) {
  let lastAt = -Infinity,
    lastKey = '',
    pending,
    chain = Promise.resolve();
  const report = (input, force = false) => {
    const value = normalizeImportProgress(input);
    if (!value) return chain;
    pending = value;
    const key = `${value.stage}:${value.currentItemId}:${value.currentFile}`;
    if (!force && key === lastKey && now() - lastAt < 1000) return chain;
    lastAt = now();
    lastKey = key;
    pending = null;
    chain = chain.then(() => write(value));
    // IPC callers do not await writes; retain the failure for flush without unhandled rejections.
    chain.catch(() => {});
    return chain;
  };
  report.flush = () => (pending ? report(pending, true) : chain);
  return report;
}
