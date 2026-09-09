import { describe, it, expect } from 'vitest';
import { canEnsureTodoCalendarRange, todoCalendarOwnerKey, isCalendarPermissionError } from './todoCalendarAccess';
describe('calendar write access', () => {
  it('allows only ordinary writable identities', () => {
    const user = { id: 'u', role: 'user' };
    expect(canEnsureTodoCalendarRange(user)).toBe(true);
    for (const identity of [
      { ...user, role: 'visitor' },
      { ...user, visitorWorkspace: true },
      { ...user, adminContext: { mode: 'read_only', subjectUserId: 'v' } },
      { ...user, adminContext: { mode: 'content_manage', subjectUserId: 'v' } },
      {},
    ])
      expect(canEnsureTodoCalendarRange(identity)).toBe(false);
  });
  it('changes request ownership on subject and mode changes, and avoids duplicate permission toasts', () => {
    expect(todoCalendarOwnerKey({ id: 'u', role: 'user' })).not.toBe(
      todoCalendarOwnerKey({ id: 'u', role: 'user', adminContext: { subjectUserId: 'v' } }),
    );
    expect(isCalendarPermissionError({ code: 'ADMIN_CONTEXT_ROUTE_FORBIDDEN' })).toBe(true);
    expect(isCalendarPermissionError(new Error('network'))).toBe(false);
  });
});
