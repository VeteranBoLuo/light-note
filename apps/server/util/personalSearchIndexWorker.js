import { parentPort } from 'node:worker_threads';
import { createBundle, searchCandidates, INDEX_CACHE_POLICY } from './personalSearchIndexCore.js';

const MAX_BYTES = INDEX_CACHE_POLICY.estimatedBytes;
const TTL = INDEX_CACHE_POLICY.ttlMs;
const entries = new Map();
const builds = new Map();
let expiryTimer;
function expire() {
  clearTimeout(expiryTimer);
  const now = Date.now();
  for (const [key, build] of builds) if (now - build.startedAt >= 30_000) builds.delete(key);
  for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key);
  const deadlines = [
    ...[...entries.values()].map((entry) => entry.expiresAt),
    ...[...builds.values()].map((build) => build.startedAt + 30_000),
  ];
  if (deadlines.length) {
    expiryTimer = setTimeout(expire, Math.max(1, Math.min(...deadlines) - now));
    expiryTimer.unref();
  }
}
function retain(key, bundle) {
  const ephemeral = bundle.estimatedMemoryBytes > MAX_BYTES;
  // Retain at most one oversized, one-shot index while its initial query arrives.
  for (const [id, entry] of entries) if (entry.ephemeral) entries.delete(id);
  entries.delete(key);
  entries.set(key, { bundle, ephemeral, expiresAt: Date.now() + (ephemeral ? 10_000 : TTL) });
  let total = [...entries.values()].reduce(
    (sum, entry) => sum + (entry.ephemeral ? 0 : entry.bundle.estimatedMemoryBytes),
    0,
  );
  for (const [id, entry] of entries) {
    if (total <= MAX_BYTES && entries.size <= INDEX_CACHE_POLICY.maxUsers) break;
    if (entry.ephemeral) continue;
    total -= entry.bundle.estimatedMemoryBytes;
    entries.delete(id);
  }
  expire();
}
function runQuery(bundle, { op, query, scope, take, options }) {
  return op === 'candidates' ? searchCandidates(bundle.index, query, scope, take) : bundle.index.search(query, options);
}
parentPort.on('message', ({ id, op, key, documents, query, options, scope, take, retainIndex, finishQuery }) => {
  if (op === 'drop') {
    builds.delete(key);
    entries.delete(key);
    expire();
    return;
  }
  try {
    expire();
    if (op === 'begin') {
      // Production cold admission permits one build. Expired interrupted uploads
      // cannot retain private documents indefinitely if a caller disappears.
      for (const [id, build] of builds) if (Date.now() - build.startedAt > 30_000) builds.delete(id);
      if (builds.size) throw new Error('build in progress');
      builds.set(key, { bundle: createBundle([]), startedAt: Date.now() });
      expire();
      parentPort.postMessage({ id, value: {} });
      return;
    }
    if (op === 'append' || op === 'finish') {
      const build = builds.get(key);
      if (!build) throw new Error('build missing');
      if (op === 'append') {
        for (const document of documents) build.bundle.accountDocument(document);
        build.bundle.index.addAll(documents);
        build.bundle.documents.push(...documents);
        parentPort.postMessage({ id, value: {} });
      } else {
        builds.delete(key);
        build.bundle.finishBuild();
        const results = finishQuery ? runQuery(build.bundle, finishQuery) : undefined;
        if (retainIndex !== false) retain(key, build.bundle);
        // An oversized recovery already served its one query in this message.
        if (finishQuery && entries.get(key)?.ephemeral) entries.delete(key);
        expire();
        parentPort.postMessage({ id, value: { estimatedMemoryBytes: build.bundle.estimatedMemoryBytes, results } });
      }
      return;
    }
    const entry = entries.get(key);
    if (!entry) {
      parentPort.postMessage({ id, value: { missing: true } });
      return;
    }
    const results = runQuery(entry.bundle, { op, query, scope, take, options });
    if (entry) {
      entries.delete(key);
      if (!entry.ephemeral) entries.set(key, entry);
    }
    // Disposed in-flight handles rebuild transiently; live handles can restore
    // their cache after worker restart. API authority/generation checks still apply.
    parentPort.postMessage({ id, value: { results } });
    expire();
  } catch {
    parentPort.postMessage({ id, error: 'AI_PERSONAL_SEARCH_INDEX_FAILED' });
  }
});
