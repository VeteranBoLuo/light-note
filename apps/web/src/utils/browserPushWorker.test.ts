import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
const source = readFileSync(resolve(process.cwd(), 'public/light-note-sw.js'), 'utf8');
const data = {
  version: 1,
  notificationId: '00000000-0000-4000-8000-000000000001',
  subscriptionId: 's1',
  generation: 'g1',
  userId: 'u1',
  title: '待办提醒',
  body: '做事',
};
function harness() {
  const listeners: Record<string, Function> = {};
  const state = new Map<string, any>();
  state.set('binding', { id: 's1', generation: 'g1', userId: 'u1' });
  const showNotification = vi.fn(),
    openWindow = vi.fn(),
    close = vi.fn();
  const client = {
    url: 'https://light.test/workbenches',
    focused: true,
    focus: vi.fn(),
    navigate: vi.fn(),
    postMessage: vi.fn((_data, ports) => ports?.[0]?.postMessage('handled')),
  };
  const clients: any[] = [client];
  const indexedDB = {
    open: () => {
      const opening: any = {};
      queueMicrotask(() => {
        opening.result = {
          close() {},
          transaction: () => {
            const tx: any = {
              objectStore: () => ({
                get(key: string) {
                  const request = { result: state.get(key) };
                  queueMicrotask(() => tx.oncomplete?.());
                  return request;
                },
                put(value: any, key: string) {
                  state.set(key, structuredClone(value));
                  queueMicrotask(() => tx.oncomplete?.());
                  return {};
                },
              }),
            };
            return tx;
          },
        };
        opening.onsuccess();
      });
      return opening;
    },
  };
  runInNewContext(source, {
    self: {
      location: { origin: 'https://light.test' },
      addEventListener: (name, fn) => (listeners[name] = fn),
      registration: { showNotification, getNotifications: async () => [] },
      clients: { matchAll: async () => clients, openWindow },
    },
    indexedDB,
    URL,
    setTimeout,
    clearTimeout,
    MessageChannel,
    console,
  });
  async function push(payload = data) {
    let work;
    listeners.push({ data: { json: () => payload }, waitUntil: (p) => (work = p) });
    await work;
  }
  async function click() {
    let work;
    listeners.notificationclick({ notification: { data, close }, waitUntil: (p) => (work = p) });
    await work;
  }
  return { push, click, state, showNotification, client, clients, openWindow, close };
}
describe('browser push worker', () => {
  it('always displays while focused and deduplicates repeated deliveries persistently', async () => {
    const h = harness();
    await h.push();
    await h.push();
    expect(h.showNotification).toHaveBeenCalledOnce();
    expect(h.showNotification.mock.calls[0][1]).toMatchObject({ body: '做事', renotify: false });
    expect(h.showNotification.mock.calls[0][1]).not.toHaveProperty('actions');
  });
  it('drops stale account or re-enabled subscription generations', async () => {
    const h = harness();
    await h.push({ ...data, userId: 'u2' });
    await h.push({ ...data, generation: 'g2' });
    expect(h.showNotification).not.toHaveBeenCalled();
  });
  it('click reuses a window and requests inbox location without business actions', async () => {
    const h = harness();
    await h.click();
    expect(h.client.focus).toHaveBeenCalledOnce();
    expect(h.client.postMessage.mock.calls[0][0]).toMatchObject({
      type: 'push.open',
      notificationId: data.notificationId,
    });
    expect(h.client.navigate).not.toHaveBeenCalled();
    expect(h.openWindow).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledOnce();
  });
  it('cold click opens the inbox with account and notification identity', async () => {
    const h = harness();
    h.clients.length = 0;
    await h.click();
    expect(h.openWindow).toHaveBeenCalledWith(`/notifications?notificationId=${data.notificationId}&pushOwner=u1`);
  });
  it('click after logout does not open another account notification', async () => {
    const h = harness();
    h.state.set('binding', null);
    await h.click();
    expect(h.client.focus).not.toHaveBeenCalled();
    expect(h.openWindow).not.toHaveBeenCalled();
  });
});
