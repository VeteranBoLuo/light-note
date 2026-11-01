import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { imageError } from './compress.js';

const CHUNK_BYTES = 4 * 1024 * 1024;

/** Copies exactly `size` bytes into a new private file and returns the content hash. */
export async function copySourceToFile(locator, size, readRange, file, { timeoutMs = 30_000 } = {}) {
  const sourceHash = createHash('sha256');
  const handle = await fs.open(file, 'wx', 0o600);
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    for (let start = 0; start < size; start += CHUNK_BYTES) {
      signal.throwIfAborted();
      const end = Math.min(size - 1, start + CHUNK_BYTES - 1);
      const chunk = await readRange(locator, start, end, { signal });
      signal.throwIfAborted();
      if (!Buffer.isBuffer(chunk) || chunk.length !== end - start + 1) throw imageError('IMAGE_SOURCE_CHANGED');
      sourceHash.update(chunk);
      await handle.writeFile(chunk);
    }
  } finally {
    await handle.close();
  }
  return sourceHash.digest('hex');
}
