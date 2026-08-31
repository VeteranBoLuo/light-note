import { describe, expect, it, vi } from 'vitest';
import type { Router } from 'vue-router';
import { restoreToolboxScrollSnapshot, returnFromToolboxPage, saveToolboxScrollSnapshot } from './toolboxNavigation';

function createRouterStub(historyBack: unknown) {
  const back = vi.fn();
  const replace = vi.fn().mockResolvedValue(undefined);
  const resolve = vi.fn((target: string) => {
    const path = target.split(/[?#]/u, 1)[0];
    const name =
      path === '/toolbox' ? 'toolboxHome' : path.startsWith('/toolbox/task/') ? 'toolboxTask' : 'toolboxWorkbench';
    return {
      name,
      meta: path.startsWith('/toolbox') ? { mobileShell: 'toolbox' } : {},
    };
  });
  const router = {
    back,
    replace,
    resolve,
    options: { history: { state: { back: historyBack } } },
  } as unknown as Router;
  return { router, back, replace, resolve };
}

describe('returnFromToolboxPage', () => {
  it('工作台有工具箱首页历史时使用真实返回', () => {
    const { router, back, replace } = createRouterStub('/toolbox');

    expect(returnFromToolboxPage(router, 'workbench')).toBe('back');
    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it('任务页可返回发起它的工作台并保留工作区 query', () => {
    const { router, back, replace } = createRouterStub('/toolbox/research_brief?workspace=workspace-1');

    expect(returnFromToolboxPage(router, 'task')).toBe('back');
    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it('直接深链或非工具箱历史使用 replace 回首页', () => {
    for (const historyBack of [null, '/workbenches', 'https://example.com/toolbox']) {
      const { router, back, replace } = createRouterStub(historyBack);

      expect(returnFromToolboxPage(router, 'workbench')).toBe('replace-home');
      expect(back).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith({ name: 'toolboxHome' });
    }
  });

  it('任务页不会返回另一个任务页', () => {
    const { router, back, replace } = createRouterStub('/toolbox/task/job-before');

    expect(returnFromToolboxPage(router, 'task')).toBe('replace-home');
    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith({ name: 'toolboxHome' });
  });
});

describe('toolbox scroll snapshots', () => {
  it('把当前容器位置合并到历史条目并在返回时恢复', () => {
    const replaceState = vi.fn();
    const history = { state: { existing: 'kept' }, replaceState };
    const source = {
      scrollTop: 640,
      scrollLeft: 12,
      scrollHeight: 1600,
      clientHeight: 700,
      scrollWidth: 1000,
      clientWidth: 600,
    };

    const snapshot = saveToolboxScrollSnapshot({
      routeFullPath: '/toolbox',
      identityKey: 'user:8',
      element: source,
      history,
      now: 1_000,
    });

    expect(snapshot).toMatchObject({ top: 640, left: 12, routeFullPath: '/toolbox', identityKey: 'user:8' });
    expect(replaceState).toHaveBeenCalledWith(
      expect.objectContaining({ existing: 'kept', __lightnoteToolboxScroll: snapshot }),
      '',
    );

    const target = {
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 1200,
      clientHeight: 700,
      scrollWidth: 800,
      clientWidth: 700,
    };
    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        element: target,
        historyState: replaceState.mock.calls[0][0],
        now: 2_000,
      }),
    ).toBe(true);
    expect(target.scrollTop).toBe(500);
    expect(target.scrollLeft).toBe(12);
  });

  it('在有效期边界仍可恢复，并把纵横滚动位置限制在当前容器范围内', () => {
    const state = {
      __lightnoteToolboxScroll: {
        schemaVersion: 1,
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        top: Number.POSITIVE_INFINITY,
        left: 900,
        updatedAt: 1_000,
      },
    };
    const element = {
      scrollTop: 99,
      scrollLeft: 99,
      scrollHeight: 1200,
      clientHeight: 700,
      scrollWidth: 900,
      clientWidth: 700,
    };

    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        element,
        historyState: state,
        now: 1_000 + 6 * 60 * 60 * 1000,
      }),
    ).toBe(true);
    expect(element.scrollTop).toBe(0);
    expect(element.scrollLeft).toBe(200);
  });

  it('保存时把负数和非有限滚动值归零', () => {
    const replaceState = vi.fn();
    const history = { state: null, replaceState };
    const element = {
      scrollTop: -20,
      scrollLeft: Number.POSITIVE_INFINITY,
      scrollHeight: 1000,
      clientHeight: 500,
    };

    expect(
      saveToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        element,
        history,
        now: 1_000,
      }),
    ).toMatchObject({ top: 0, left: 0 });
  });

  it('拒绝恢复其他页面、其他账号或过期的快照', () => {
    const snapshot = {
      schemaVersion: 1,
      routeFullPath: '/toolbox',
      identityKey: 'user:8',
      top: 200,
      left: 0,
      updatedAt: 1_000,
    };
    const element = { scrollTop: 0, scrollLeft: 0, scrollHeight: 1000, clientHeight: 500 };
    const state = { __lightnoteToolboxScroll: snapshot };

    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox/research_brief',
        identityKey: 'user:8',
        element,
        historyState: state,
        now: 2_000,
      }),
    ).toBe(false);
    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:9',
        element,
        historyState: state,
        now: 2_000,
      }),
    ).toBe(false);
    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        element,
        historyState: state,
        now: 7 * 60 * 60 * 1000,
      }),
    ).toBe(false);
    expect(element.scrollTop).toBe(0);
  });

  it('拒绝版本不兼容和明显来自未来的快照', () => {
    const element = { scrollTop: 0, scrollLeft: 0, scrollHeight: 1000, clientHeight: 500 };
    const base = {
      routeFullPath: '/toolbox',
      identityKey: 'user:8',
      top: 200,
      left: 0,
      updatedAt: 62_000,
    };

    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        element,
        historyState: { __lightnoteToolboxScroll: { ...base, schemaVersion: 2 } },
        now: 1_000,
      }),
    ).toBe(false);
    expect(
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: 'user:8',
        element,
        historyState: { __lightnoteToolboxScroll: { ...base, schemaVersion: 1 } },
        now: 1_000,
      }),
    ).toBe(false);
  });
});
