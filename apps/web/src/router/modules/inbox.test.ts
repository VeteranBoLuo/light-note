import { afterEach, describe, expect, it } from 'vitest';
import inboxRouter from './inbox';

const beforeEnter = inboxRouter.beforeEnter as (to: { query: Record<string, unknown> }) => unknown;
const originalWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

afterEach(() => setViewportWidth(originalWidth));

describe('inbox 路由兼容', () => {
  it('待办和待办详情继续停留在 /inbox', () => {
    expect(beforeEnter({ query: { tab: 'todo' } })).toBe(true);
    expect(beforeEnter({ query: { todoId: 'todo-1' } })).toBe(true);
  });

  it.each([
    ['all', undefined],
    ['bookmark', 'bookmark'],
    ['note', 'note'],
    ['file', 'file'],
  ])('旧资源页签 %s 规范化到整理中心待整理', (tab, resourceType) => {
    expect(beforeEnter({ query: { tab } })).toEqual({
      path: '/organize',
      query: {
        issue: 'pending',
        ...(resourceType ? { resourceType } : {}),
      },
      replace: true,
    });
  });

  it('桌面端裸 /inbox 沿用历史资源语义并进入整理中心', () => {
    setViewportWidth(1280);
    expect(beforeEnter({ query: {} })).toEqual({
      path: '/organize',
      query: { issue: 'pending' },
      replace: true,
    });
  });

  it('移动端裸 /inbox 保留底部待办入口语义', () => {
    setViewportWidth(390);
    expect(beforeEnter({ query: {} })).toBe(true);
  });
});
