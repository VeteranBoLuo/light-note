import { describe, it, expect } from 'vitest';
import { normalizeNotificationSourceScope, notificationSourceQuery } from './notificationSourceScope.js';

describe('notification source scopes', () => {
  it('limits identifiers and accepts only registered source kinds', () => {
    expect(normalizeNotificationSourceScope({ kind: 'arbitrary_sql', ids: ['x'] })).toBeNull();
    expect(normalizeNotificationSourceScope({ kind: 'chat', ids: ['x', 'x'] })).toEqual({ kind: 'chat', ids: ['x'] });
    expect(normalizeNotificationSourceScope({ kind: 'chat', ids: ['x'], userIds: [] })).toBeNull();
    expect(normalizeNotificationSourceScope({ kind: 'chat', ids: Array(1001).fill('x') })).toBeNull();
    expect(normalizeNotificationSourceScope({ kind: 'chat', ids: [null] })).toBeNull();
  });

  it('never queries absent or unrelated online accounts and always binds input as values', () => {
    expect(notificationSourceQuery({ kind: 'todo', ids: ['t'], userIds: ['owner'] }, ['unrelated'])).toBeNull();
    expect(notificationSourceQuery({ kind: 'chat', ids: ['m'] }, [])).toBeNull();
    const id = "x' OR 1=1 --";
    const query = notificationSourceQuery({ kind: 'batch', ids: [id] }, ['online']);
    expect(query.sql).not.toContain(id);
    expect(query.params).toEqual(['online', id, id]);
  });
});
