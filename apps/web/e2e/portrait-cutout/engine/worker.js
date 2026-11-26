let backend;
self.addEventListener('message', async ({ data }) => {
  const { id, bitmap, point } = data;
  try {
    backend ??= import('./segment.js');
    const { selectSubject } = await backend;
    const selection = await selectSubject(bitmap, point);
    self.postMessage({ id, selection }, [selection.alpha.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  } finally {
    bitmap.close();
  }
});
