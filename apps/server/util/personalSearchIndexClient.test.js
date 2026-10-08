import { afterEach, expect, it } from 'vitest';
import { buildIsolatedIndex, createIndexClient } from './personalSearchIndexClient.js';
import { buildBundle, searchCandidates } from './personalSearchIndexCore.js';
import { chunkResource } from './personalKnowledgeText.js';

const clients = [];
function client() {
  const value = createIndexClient();
  clients.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((value) => value.close()));
});
function documents(count = 100) {
  return Array.from({ length: count }, (_, i) =>
    chunkResource({
      resourceType: i % 2 ? 'bookmark' : 'note',
      resourceId: String(i),
      version: 'v1',
      title: `alpha ${i}`,
      content: `alpha common background ${i} 霜叶协议 ` + 'repeat section. '.repeat(80),
      contentType: 'markdown',
      tagNames: i % 3 ? ['alpha'] : ['霜叶协议'],
    }),
  ).flat();
}

it('keeps ranking/scores and scoped candidate selection identical in the worker', async () => {
  const docs = documents();
  const local = buildBundle(docs);
  const remote = await buildIsolatedIndex(docs, client());
  expect(remote.estimatedMemoryBytes).toBe(local.estimatedMemoryBytes);
  const options = { combineWith: 'OR', boost: { title: 5, tags: 3.5 } };
  expect(await remote.index.search('alpha 霜叶协议', options)).toEqual(local.index.search('alpha 霜叶协议', options));
  for (const scope of [
    { types: null, resourceIds: null },
    { types: new Set(['note']), resourceIds: null },
    { types: null, resourceIds: new Set(['bookmark:3', 'note:4']) },
    { types: null, resourceIds: new Set() },
  ]) {
    const hits = await remote.index.searchCandidates('alpha 霜叶协议', scope, 20);
    expect(hits).toEqual(searchCandidates(local.index, 'alpha 霜叶协议', scope, 20));
    expect(hits.length).toBeLessThanOrEqual(60);
  }
});

it('rebuilds an evicted in-flight bundle transiently and keeps subsequent queries valid', async () => {
  const docs = documents(2);
  const service = client();
  const remote = await buildIsolatedIndex(docs, service);
  const expected = buildBundle(docs).index.search('alpha');
  remote.index.dispose();
  expect(await remote.index.search('alpha')).toEqual(expected);
  expect(await remote.index.search('alpha')).toEqual(expected);
});

it('restores an existing cached bundle after worker restart and retains the restored index', async () => {
  const docs = documents(3);
  const service = client();
  const messages = [];
  const wrapped = {
    request: (message) => {
      messages.push(message);
      return service.request(message);
    },
    drop: (key) => service.drop(key),
  };
  const remote = await buildIsolatedIndex(docs, wrapped);
  await service.close();
  expect(await remote.index.search('alpha')).toEqual(buildBundle(docs).index.search('alpha'));
  const count = messages.filter((message) => message.documents).length;
  await remote.index.search('alpha');
  expect(messages.filter((message) => message.documents)).toHaveLength(count);
});

it('cleans a failed partial build so the next account can build successfully', async () => {
  const service = client();
  await expect(buildIsolatedIndex([{ content: 'missing required id' }], service)).rejects.toMatchObject({
    code: 'AI_PERSONAL_SEARCH_INDEX_FAILED',
  });
  const restored = await buildIsolatedIndex(documents(2), service);
  expect((await restored.index.search('alpha')).length).toBeGreaterThan(0);
});

it('transfers bounded batches and allows warm searches between cold build batches', async () => {
  const service = client();
  const warmDocs = documents(2);
  const warm = await buildIsolatedIndex(warmDocs, service);
  const sizes = [];
  const wrapped = {
    request(message) {
      if (message.documents) sizes.push(message.documents.length);
      return service.request(message);
    },
    drop: (key) => service.drop(key),
  };
  const cold = buildIsolatedIndex(documents(400), wrapped);
  const expected = buildBundle(warmDocs).index.search('alpha');
  const results = await Promise.all(Array.from({ length: 10 }, () => warm.index.search('alpha')));
  for (const result of results) expect(result).toEqual(expected);
  expect((await (await cold).index.search('alpha')).length).toBeGreaterThan(0);
  expect(sizes.length).toBeGreaterThan(1);
  expect(Math.max(...sizes)).toBe(50);
});

it('serializes concurrent restart recovery with a cold upload without retransmitting full document arrays', async () => {
  const service = client();
  const messages = [];
  const wrapped = {
    get generation() {
      return service.generation;
    },
    request(message) {
      messages.push(message);
      return service.request(message);
    },
    drop: (key) => service.drop(key),
  };
  const oneDocs = documents(120);
  const twoDocs = documents(110);
  const one = await buildIsolatedIndex(oneDocs, wrapped);
  const two = await buildIsolatedIndex(twoDocs, wrapped);
  await service.close();
  messages.length = 0;
  const cold = buildIsolatedIndex(documents(130), wrapped);
  const hits = await Promise.all([
    ...Array.from({ length: 4 }, () => one.index.search('alpha')),
    ...Array.from({ length: 2 }, () => two.index.search('alpha')),
  ]);
  await cold;
  for (let i = 0; i < hits.length; i += 1) {
    expect(hits[i]).toEqual(buildBundle(i < 4 ? oneDocs : twoDocs).index.search('alpha'));
  }
  expect(messages.filter((message) => message.op === 'begin')).toHaveLength(3);
  const payloads = messages.filter((message) => message.documents);
  expect(payloads.every((message) => message.op === 'append' && message.documents.length <= 50)).toBe(true);
});

it('finishes an in-flight recovery after eviction without retaining its replacement', async () => {
  const service = client();
  let disposeOnAppend = false;
  let begins = 0;
  let remote;
  const wrapped = {
    request(message) {
      if (message.op === 'begin') begins += 1;
      if (message.op === 'append' && disposeOnAppend) {
        disposeOnAppend = false;
        remote.index.dispose();
      }
      return service.request(message);
    },
    drop: (key) => service.drop(key),
  };
  const docs = documents(80);
  remote = await buildIsolatedIndex(docs, wrapped);
  await service.close();
  disposeOnAppend = true;
  expect(await remote.index.search('alpha')).toEqual(buildBundle(docs).index.search('alpha'));
  const previous = begins;
  expect(await remote.index.search('alpha')).toEqual(buildBundle(docs).index.search('alpha'));
  expect(begins).toBe(previous + 1);
});
