import { expect, it, vi } from 'vitest';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { scheduleAppStartupPrewarm } from './appStartupPrewarm';
vi.mock('./staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => () => {}) }));
it('submits only static groups to the shared scheduler', () => {
  scheduleAppStartupPrewarm();
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({
    groups: expect.arrayContaining(['route.noteDetail', 'editor.html', 'editor.markdown', 'route.cloudSpace']),
    optional: true,
    priority: 2,
  });
});
