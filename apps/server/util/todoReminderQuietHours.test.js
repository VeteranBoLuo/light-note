import { describe, it, expect, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: { query: vi.fn(), getConnection: vi.fn() } }));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));
import pool from '../db/index.js';
import { createNotification } from './notification.js';
import { sendTrackedEmail } from './emailDelivery.js';
import { processDueTodoReminders } from './todoReminder.js';
it.each(['in_app', 'email'])('legacy %s reminders are delivered despite browser quiet hours', async (channel) => {
  vi.clearAllMocks();
  const preferences = { notificationsDnd: true, notificationsDndStart: '00:00', notificationsDndEnd: '23:59' };
  pool.query.mockImplementation(async sql => sql.includes('SELECT id FROM todo_reminders') ? [[{ id: 'r1' }]] : [{ affectedRows: 1 }]);
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    query: vi.fn().mockResolvedValueOnce([[{ id: 'r1', todoId: 't1', userId: 'u1', channel, targetEmail: 'test@example.com' }]])
      .mockResolvedValueOnce([[{ title: 'test' }]])
      .mockResolvedValueOnce([[{ preferences: JSON.stringify(preferences) }]])
      .mockResolvedValue([{ affectedRows: 1 }]),
  };
  pool.getConnection.mockResolvedValue(connection);
  await processDueTodoReminders();
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(channel === 'in_app' ? createNotification : sendTrackedEmail).toHaveBeenCalledOnce();
});
