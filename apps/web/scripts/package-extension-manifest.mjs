export function createStoreManifest(sourceManifest) {
  if (!sourceManifest || typeof sourceManifest !== 'object' || Array.isArray(sourceManifest)) {
    throw new TypeError('Extension manifest must be an object');
  }

  const { key: _developmentBuildKey, ...storeManifest } = sourceManifest;
  return storeManifest;
}

export function serializeStoreManifest(sourceManifest) {
  const storeManifest = createStoreManifest(sourceManifest);
  if (Object.hasOwn(storeManifest, 'key')) {
    throw new Error('Chrome Web Store manifest must not contain key');
  }
  return `${JSON.stringify(storeManifest, null, 2)}\n`;
}
