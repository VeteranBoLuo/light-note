/** 把 HTTP 客户端断开统一转换为 AbortSignal，并提供幂等清理。 */
export function createRequestAbortContext(req, res) {
  const controller = new AbortController();
  let completed = false;
  const abortOnClose = () => {
    if (completed || controller.signal.aborted) return;
    const error = new Error('AI 客户端已断开');
    error.name = 'AbortError';
    error.code = 'AI_REQUEST_ABORTED';
    controller.abort(error);
  };
  req?.once?.('aborted', abortOnClose);
  res?.once?.('close', abortOnClose);
  return Object.freeze({
    signal: controller.signal,
    complete() {
      if (completed) return;
      completed = true;
      req?.removeListener?.('aborted', abortOnClose);
      res?.removeListener?.('close', abortOnClose);
    },
  });
}
