import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, onMounted } from 'vue';
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router';
import { getMainRouteViewKey } from './routeViewKey';

describe('getMainRouteViewKey', () => {
  it('切换笔记详情 ID 时生成不同 key，确保详情内容重新加载', () => {
    const first = getMainRouteViewKey({ name: 'noteDetail', params: { id: 'note-a' } });
    const second = getMainRouteViewKey({ name: 'noteDetail', params: { id: 'note-b' } });

    expect(first).toBe('note-detail:note-a');
    expect(second).toBe('note-detail:note-b');
    expect(first).not.toBe(second);
  });

  it('同一笔记保持稳定 key', () => {
    expect(getMainRouteViewKey({ name: 'noteDetail', params: { id: 'note-a' } })).toBe(
      getMainRouteViewKey({ name: 'noteDetail', params: { id: 'note-a' } }),
    );
  });

  it('其他页面保持统一 key，查询参数变化不会误重建主内容', () => {
    expect(getMainRouteViewKey({ name: 'cloudSpace', params: { id: 'a' } })).toBe('main-route-view');
    expect(getMainRouteViewKey({ name: 'cloudSpace', params: { id: 'b' } })).toBe('main-route-view');
  });

  it('Vue Router 复用同一路由时会按笔记 ID 重建详情组件', async () => {
    let mountedCount = 0;
    const NoteDetailStub = defineComponent({
      setup() {
        const route = useRoute();
        onMounted(() => {
          mountedCount += 1;
        });
        return () => h('div', String(route.params.id || ''));
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/noteLibrary/:id', name: 'noteDetail', component: NoteDetailStub }],
    });
    const AppStub = defineComponent({
      setup() {
        const route = useRoute();
        return () => h(RouterView, { key: getMainRouteViewKey(route) });
      },
    });

    await router.push('/noteLibrary/note-a');
    await router.isReady();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(AppStub);
    app.use(router);
    app.mount(host);
    try {
      await nextTick();
      expect(host.textContent).toBe('note-a');
      expect(mountedCount).toBe(1);

      await router.push('/noteLibrary/note-b');
      await nextTick();
      expect(host.textContent).toBe('note-b');
      expect(mountedCount).toBe(2);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
