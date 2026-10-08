import { scrypt } from 'node:crypto';

// Keep capacity for other libuv work (filesystem/DNS) in the default four-thread pool.
const CONCURRENCY = 2;
const MAX_WAITING = 128;
const waiting = [];
let active = 0;

export function deriveScrypt(password, salt, keyLength) {
  return new Promise((resolve, reject) => {
    if (active >= CONCURRENCY && waiting.length >= MAX_WAITING) {
      reject(Object.assign(new Error('Password computation is busy'), { code: 'SCRYPT_BUSY' }));
      return;
    }
    const run = () => {
      active += 1;
      const finish = (error, key) => {
        active -= 1;
        if (error) reject(error);
        else resolve(key);
        waiting.shift()?.();
      };
      try {
        scrypt(password, salt, keyLength, finish);
      } catch (error) {
        finish(error);
      }
    };
    if (active < CONCURRENCY) run();
    else waiting.push(run);
  });
}
