import { expect, it, vi } from 'vitest';
import { createRetryableModuleLoader, isLocallyHandledModuleLoadError } from './retryableModuleLoader';

it('handles only its own preload failure and clears local recovery after failure', async () => {
  const error = Error(`Failed to fetch dynamically imported module: ${location.origin}/assets/Feature-test.js`);
  const reload = vi.fn();
  const globalRecovery = (event: Event) => {
    if (!isLocallyHandledModuleLoadError((event as Event & { payload?: unknown }).payload)) reload();
  };
  window.addEventListener('vite:preloadError', globalRecovery);
  const makeEvent = () => Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: error });
  let event!: Event;
  const load = createRetryableModuleLoader(async () => {
    event = makeEvent();
    window.dispatchEvent(event);
    throw error;
  }, [/^\/assets\/Feature-[\w-]+\.js$/]);
  try {
    await expect(load()).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    window.dispatchEvent(makeEvent());
    expect(reload).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('vite:preloadError', globalRecovery);
  }
});

it.each(['https://untrusted.invalid/assets/Feature-test.js', `${location.origin}/assets/Unrelated-test.js`])(
  'does not import or intercept an unrelated URL: %s',
  async (address) => {
    const error = Error(`Failed to fetch dynamically imported module: ${address}`);
    const reload = vi.fn();
    const globalRecovery = (event: Event) => {
      if (!isLocallyHandledModuleLoadError((event as Event & { payload?: unknown }).payload)) reload();
    };
    window.addEventListener('vite:preloadError', globalRecovery);
    const importer = vi
      .fn()
      .mockImplementationOnce(async () => {
        window.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: error }));
        throw error;
      })
      .mockResolvedValue({ value: 'ok' });
    const load = createRetryableModuleLoader(importer, [/^\/assets\/Feature-[\w-]+\.js$/]);
    try {
      await expect(load()).rejects.toBe(error);
      expect(reload).toHaveBeenCalledOnce();
      expect(await load()).toEqual({ value: 'ok' });
      expect(importer).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('vite:preloadError', globalRecovery);
    }
  },
);
