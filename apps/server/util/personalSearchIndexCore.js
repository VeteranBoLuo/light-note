import MiniSearch from 'minisearch';
import { extractTokens } from './knowledgeText.js';

export const INDEX_CACHE_POLICY = Object.freeze({ ttlMs: 180_000, maxUsers: 20, estimatedBytes: 128 * 1024 * 1024 });

export function tokenize(value) {
  return extractTokens(value).filter((term) => term.length > 1 || /^[a-z0-9]+$/iu.test(term));
}

export function createBundle(documents, metadata = {}) {
  let estimatedMemoryBytes = 1024;
  let building = true;
  const index = new MiniSearch({
    fields: ['title', 'sectionTitle', 'tags', 'content'],
    storeFields: [
      'resourceType',
      'resourceId',
      'resourceVersion',
      'chunkIndex',
      'title',
      'sectionTitle',
      'tags',
      'content',
      'contentHash',
      'locator',
      'target',
      'coverage',
    ],
    tokenize: (value) => {
      const terms = tokenize(value);
      if (building) {
        // Tokens are deduplicated per field. Charge each posting for map/tree
        // overhead plus its UTF-16 term, even when terms are shared by documents.
        for (const term of terms) estimatedMemoryBytes += 192 + term.length * 2;
      }
      return terms;
    },
    processTerm: (term) => String(term || '').toLowerCase() || null,
  });
  return {
    index,
    documents,
    get estimatedMemoryBytes() {
      return estimatedMemoryBytes;
    },
    finishBuild() {
      building = false;
    },
    accountDocument(document) {
      // Charge both API and worker UTF-16 document copies, one chunk at a time.
      // Never serialize the complete index graph for accounting.
      estimatedMemoryBytes += 1024 + JSON.stringify(document).length * 4;
    },
    builtAt: Date.now(),
    localGeneration: Number(metadata.localGeneration || 0),
    persistentGeneration: metadata.persistentGeneration == null ? null : Number(metadata.persistentGeneration || 0),
  };
}

export function buildBundle(documents, metadata = {}) {
  const bundle = createBundle(documents, metadata);
  for (const document of documents) bundle.accountDocument(document);
  bundle.index.addAll(documents);
  bundle.finishBuild();
  return bundle;
}

export function searchOptions() {
  return {
    boost: { title: 5, tags: 3.5, sectionTitle: 2.5, content: 1 },
    combineWith: 'OR',
    prefix: (term) => /^[a-z0-9]{3,}$/iu.test(term),
    fuzzy: (term) => (/^[a-z0-9]{4,}$/iu.test(term) ? 0.2 : false),
    maxFuzzy: 1,
  };
}

export function searchCandidates(index, query, scope, take) {
  const results = index.search(query, searchOptions());
  const counts = new Map();
  const candidates = [];
  for (const result of results) {
    const key = `${result.resourceType}:${result.resourceId}`;
    if (scope.types && !scope.types.has(String(result.resourceType))) continue;
    if (scope.resourceIds && !scope.resourceIds.has(key)) continue;
    const count = counts.get(key) || 0;
    if (count >= 2) continue;
    counts.set(key, count + 1);
    candidates.push(result);
    if (candidates.length >= Math.min(60, take * 3)) break;
  }
  return candidates;
}
