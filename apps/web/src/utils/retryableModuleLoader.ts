const localRecovery = new Set<(error: unknown) => boolean>();

/** Let active optional features recover without the global page reload. */
export function isLocallyHandledModuleLoadError(error: unknown) {
  return [...localRecovery].some((handles) => handles(error));
}

/** Retry failed entry fetches without reloading the page or discarding drafts. */
export function createRetryableModuleLoader<T>(
  load: () => Promise<T>,
  entryPaths: readonly RegExp[],
  recover: (module: Record<string, any>) => T = (module) => module as T,
) {
  let pending: Promise<T> | undefined;
  let retryUrl: string | undefined;
  let attempt = 0;
  function entryAddress(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    const address =
      /(?:Failed to fetch dynamically imported module|error loading dynamically imported module):\s*(https?:\/\/\S+)/i.exec(
        message,
      )?.[1];
    if (!address || typeof location === 'undefined') return;
    try {
      const url = new URL(address);
      if (url.origin === location.origin && entryPaths.some((pattern) => pattern.test(url.pathname))) return url.href;
    } catch {
      /* Unrecognized errors retain the normal application recovery. */
    }
  }
  return () => {
    if (pending) return pending;
    const handles = (error: unknown) => Boolean(entryAddress(error));
    localRecovery.add(handles);
    pending = Promise.resolve()
      .then(() => {
        if (!retryUrl) return load();
        const url = new URL(retryUrl);
        url.searchParams.set('ln-module-retry', String(++attempt));
        return import(/* @vite-ignore */ url.href).then(recover);
      })
      .catch((error: unknown) => {
        // Only browser fetch errors for this loader's own, known same-origin
        // entry qualify. Never import arbitrary URLs or a failed dependency.
        retryUrl = entryAddress(error) || retryUrl;
        pending = undefined;
        throw error;
      })
      .finally(() => {
        localRecovery.delete(handles);
      });
    return pending;
  };
}
