import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { createPersonalSearchBuildGate } from './personalSearchBuildGate.js';

function failure(code) {
  return Object.assign(new Error('Private search index worker unavailable'), { code, status: 503 });
}

export function createIndexClient() {
  let worker = null;
  let active = null;
  let nextId = 0;
  let generation = 0;
  const queue = [];
  function settle(job, error, value) {
    clearTimeout(job.timer);
    if (error) job.reject(error);
    else job.resolve(value);
  }
  function failWorker(instance, code) {
    if (worker !== instance) return;
    worker = null;
    generation += 1;
    if (active) {
      settle(active, failure(code));
      active = null;
    }
    for (const job of queue.splice(0)) settle(job, failure(code));
    void instance.terminate();
  }
  function start() {
    if (worker) return worker;
    const instance = new Worker(new URL('./personalSearchIndexWorker.js', import.meta.url), {
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 384 },
    });
    worker = instance;
    instance.on('message', ({ id, error, value }) => {
      if (worker !== instance || !active || active.id !== id) return;
      const job = active;
      active = null;
      settle(job, error ? failure(error) : null, value);
      pump();
    });
    instance.on('error', () => failWorker(instance, 'AI_PERSONAL_SEARCH_INDEX_EXITED'));
    instance.on('exit', () => failWorker(instance, 'AI_PERSONAL_SEARCH_INDEX_EXITED'));
    return instance;
  }
  function pump() {
    if (active) return;
    const job = queue.shift();
    if (!job) {
      worker?.unref();
      return;
    }
    active = job;
    try {
      start().ref();
      worker.postMessage({ ...job.message, id: job.id });
    } catch {
      active = null;
      settle(job, failure('AI_PERSONAL_SEARCH_INDEX_FAILED'));
      pump();
    }
  }
  return {
    get generation() {
      return generation;
    },
    request(message) {
      if (queue.length >= 32) return Promise.reject(failure('AI_PERSONAL_SEARCH_BUSY'));
      return new Promise((resolve, reject) => {
        const job = { id: ++nextId, message, resolve, reject, timer: null };
        job.timer = setTimeout(() => {
          if (active === job) failWorker(worker, 'AI_PERSONAL_SEARCH_INDEX_TIMEOUT');
          else {
            const index = queue.indexOf(job);
            if (index >= 0) queue.splice(index, 1);
            settle(job, failure('AI_PERSONAL_SEARCH_INDEX_TIMEOUT'));
          }
        }, 30_000);
        queue.push(job);
        pump();
      });
    },
    drop(key) {
      try {
        worker?.postMessage({ op: 'drop', key });
      } catch {
        /* A closed worker has no retained index. */
      }
    },
    async close() {
      const instance = worker;
      if (!instance) return;
      failWorker(instance, 'AI_PERSONAL_SEARCH_INDEX_CLOSED');
      await instance.terminate();
    },
  };
}

export const indexClient = createIndexClient();

const uploadGates = new WeakMap();
async function withUpload(client, work) {
  if (!uploadGates.has(client)) uploadGates.set(client, createPersonalSearchBuildGate());
  const generation = client.generation;
  const release = await uploadGates.get(client)();
  try {
    if (client.generation !== generation) throw failure('AI_PERSONAL_SEARCH_INDEX_EXITED');
    return await work();
  } finally {
    release();
  }
}

async function upload(client, key, documents, finish = {}) {
  try {
    await client.request({ op: 'begin', key });
    for (let offset = 0; offset < documents.length; offset += 50) {
      await client.request({ op: 'append', key, documents: documents.slice(offset, offset + 50) });
    }
    return await client.request({ op: 'finish', key, ...finish });
  } catch (error) {
    client.drop(key);
    throw error;
  }
}

export async function buildIsolatedIndex(documents, client = indexClient) {
  let key = randomUUID();
  const { estimatedMemoryBytes } = await withUpload(client, () => upload(client, key, documents));
  let disposed = false;
  async function query(message) {
    const response = disposed ? { missing: true } : await client.request({ ...message, key });
    if (!response.missing) return response.results;
    return withUpload(client, async () => {
      // Another request may have restored this handle while we waited. Avoid
      // duplicate recovery, and serialize recovery with ordinary cold uploads.
      if (!disposed) {
        const current = await client.request({ ...message, key });
        if (!current.missing) return current.results;
      }
      const replacement = randomUUID();
      const restored = await upload(client, replacement, documents, {
        finishQuery: message,
        retainIndex: !disposed,
      });
      if (disposed) client.drop(replacement);
      else {
        client.drop(key);
        key = replacement;
      }
      return restored.results;
    });
  }
  return {
    estimatedMemoryBytes,
    index: {
      search: (queryText, options) => query({ op: 'search', query: queryText, options }),
      searchCandidates: (queryText, scope, take) => query({ op: 'candidates', query: queryText, scope, take }),
      dispose() {
        disposed = true;
        client.drop(key);
      },
    },
  };
}
