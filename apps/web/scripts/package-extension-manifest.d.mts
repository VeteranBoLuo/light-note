export function createStoreManifest<T extends Record<string, unknown>>(
  sourceManifest: T,
): Omit<T, 'key'>;

export function serializeStoreManifest(sourceManifest: Record<string, unknown>): string;
