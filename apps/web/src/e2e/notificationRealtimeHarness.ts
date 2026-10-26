import request from '@/http/request';
import { nextTick } from 'vue';
import { useUserStore } from '@/store';

// Entirely local: no actual notification, credential or backend is used.
const encoder = new TextEncoder();
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
const stats = { connections: 0, active: 0, unread: 0, lists: 0 };
const items: Record<string, unknown>[] = [];
let unread = 0;
let delayNextList = false;
let releaseList = () => {};
const fixtureFetch: typeof fetch = async (_input, init) => {
  stats.connections++;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streams.add(controller);
      stats.active = streams.size;
      controller.enqueue(encoder.encode('event: ready\ndata: {}\n\n'));
      init?.signal?.addEventListener(
        'abort',
        () => {
          streams.delete(controller);
          stats.active = streams.size;
          try {
            controller.close();
          } catch {}
        },
        { once: true },
      );
    },
    cancel() {
      /* No network resources. */
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
};
await import('./notificationCenterHarness');
// Install after the common fixture's own transport guards, then restart its foreground runtime.
window.fetch = fixtureFetch;
useUserStore().role = 'visitor';
await nextTick();
request.defaults.adapter = async (config) => {
  const path = String(config.url);
  let data: unknown = {};
  if (path.endsWith('/unreadCount')) {
    stats.unread++;
    data = { unreadTotal: unread, byType: { todo_reminder: unread } };
  } else if (path.endsWith('/list')) {
    stats.lists++;
    data = {
      items: items.map((item) => ({ ...item })),
      total: items.length,
      unreadTotal: unread,
      currentPage: 1,
      pageSize: 20,
    };
    if (delayNextList) {
      delayNextList = false;
      await new Promise<void>((resolve) => {
        releaseList = resolve;
      });
    }
  } else if (path.endsWith('/markAllRead')) {
    unread = 0;
    items.forEach((item) => {
      item.isRead = 1;
    });
  }
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
(window as any).__notificationRealtimeFixture = {
  stats,
  delayNextList() {
    delayNextList = true;
  },
  releaseList() {
    releaseList();
  },
  notify() {
    const id = `fixture-${items.length}`;
    items.unshift({
      id,
      type: 'todo_reminder',
      title: '待办提醒',
      content: `实时提醒 ${items.length + 1}`,
      isRead: 0,
      createTime: new Date().toISOString(),
      meta: { todoId: id },
      todoState: 'pending',
    });
    unread++;
    for (const controller of streams) controller.enqueue(encoder.encode('event: changed\ndata: {}\n\n'));
  },
  disconnect() {
    for (const controller of streams) controller.close();
    streams.clear();
    stats.active = 0;
  },
};
useUserStore().role = 'user';
