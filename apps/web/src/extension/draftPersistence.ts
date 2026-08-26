export function createExtensionDraftPersistence<T>(write: (value: T) => Promise<void>, clear: () => Promise<void>) {
  let tail: Promise<void> = Promise.resolve();
  let discarded = false;

  function save(value: T): Promise<void> {
    if (discarded) return tail;
    tail = tail
      .catch(() => undefined)
      .then(async () => {
        if (!discarded) await write(value);
      });
    return tail;
  }

  async function discard(): Promise<void> {
    discarded = true;
    await tail.catch(() => undefined);
    await clear();
  }

  return Object.freeze({ save, discard });
}

export function belongsToExtensionDraftSession(storedSessionId: unknown, currentSessionId: string): boolean {
  return typeof storedSessionId === 'string' && storedSessionId === currentSessionId;
}
