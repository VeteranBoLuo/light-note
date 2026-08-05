import { beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import {
  globalRefreshing,
  registerGlobalRefreshSource,
  resetGlobalRefreshSourcesForTest,
} from './useGlobalRefreshBar';

beforeEach(() => {
  resetGlobalRefreshSourcesForTest();
});

describe('顶栏统一刷新提示条', () => {
  it('注册的来源变 true 时亮起，变 false 时熄灭', async () => {
    const scope = effectScope();
    const source = ref(false);
    scope.run(() => registerGlobalRefreshSource(source));

    expect(globalRefreshing.value).toBe(false);

    source.value = true;
    await nextTick();
    expect(globalRefreshing.value).toBe(true);

    source.value = false;
    await nextTick();
    expect(globalRefreshing.value).toBe(false);

    scope.stop();
  });

  it('多个来源同时活跃时，只熄灭其中一个不会关掉提示条', async () => {
    const scope = effectScope();
    const foreground = ref(true);
    const softRefresh = ref(true);
    scope.run(() => {
      registerGlobalRefreshSource(foreground);
      registerGlobalRefreshSource(softRefresh);
    });
    await nextTick();
    expect(globalRefreshing.value).toBe(true);

    foreground.value = false;
    await nextTick();
    expect(globalRefreshing.value).toBe(true);

    softRefresh.value = false;
    await nextTick();
    expect(globalRefreshing.value).toBe(false);

    scope.stop();
  });

  it('作用域销毁时自动注销，刷新途中离开页面不会把提示条永久留亮', async () => {
    const scope = effectScope();
    const source = ref(true);
    scope.run(() => registerGlobalRefreshSource(source));
    await nextTick();
    expect(globalRefreshing.value).toBe(true);

    scope.stop();
    expect(globalRefreshing.value).toBe(false);
  });

  it('页面切换时新页面先注册、旧页面后注销，提示条状态仍然正确', async () => {
    const oldScope = effectScope();
    const oldSource = ref(true);
    oldScope.run(() => registerGlobalRefreshSource(oldSource));
    await nextTick();

    // Vue 的挂载顺序:新组件 setup 先跑,旧组件卸载在后。
    // 若用布尔值而非计数,旧页面的注销会把新页面刚点亮的条错误关掉。
    const newScope = effectScope();
    const newSource = ref(true);
    newScope.run(() => registerGlobalRefreshSource(newSource));
    await nextTick();

    oldScope.stop();
    expect(globalRefreshing.value).toBe(true);

    newScope.stop();
    expect(globalRefreshing.value).toBe(false);
  });

  it('支持 getter 形式的来源，可用于排除下拉刷新引起的那部分', async () => {
    const scope = effectScope();
    const refreshing = ref(false);
    const pullRefreshing = ref(false);
    scope.run(() => registerGlobalRefreshSource(() => refreshing.value && !pullRefreshing.value));

    // 下拉刷新引起的软刷新:胶囊指示器已经在表达了,提示条不应该跟着亮。
    refreshing.value = true;
    pullRefreshing.value = true;
    await nextTick();
    expect(globalRefreshing.value).toBe(false);

    // 切标签引起的软刷新:没有手势反馈,提示条要亮。
    pullRefreshing.value = false;
    await nextTick();
    expect(globalRefreshing.value).toBe(true);

    scope.stop();
  });

  it('重复注销不会把计数压到负数', async () => {
    const scope = effectScope();
    const source = ref(true);
    scope.run(() => registerGlobalRefreshSource(source));
    await nextTick();

    source.value = false;
    await nextTick();
    scope.stop();

    expect(globalRefreshing.value).toBe(false);

    const probeScope = effectScope();
    const probe = ref(true);
    probeScope.run(() => registerGlobalRefreshSource(probe));
    await nextTick();
    expect(globalRefreshing.value).toBe(true);
    probeScope.stop();
  });
});
