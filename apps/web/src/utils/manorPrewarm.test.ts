import { expect, it, vi } from 'vitest';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { scheduleManorPrewarm } from './manorPrewarm';
vi.mock('./staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => () => {}) }));
it('submits only static groups to the shared scheduler', () => {
  scheduleManorPrewarm(false);
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({ groups: ['manor.critical'], priority: 2, optional: true });
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({ groups: ['manor.desktop'], priority: 4, optional: true });
  expect(scheduleStaticPrewarm).toHaveBeenLastCalledWith({ groups: ['manor.catalog'], priority: 5, optional: true });
  vi.mocked(scheduleStaticPrewarm).mockClear();
  scheduleManorPrewarm(true);
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({ groups: ['manor.mobileCritical'], priority: 2, optional: true });
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({ groups: ['manor.mobile'], priority: 4, optional: true });
  expect(scheduleStaticPrewarm).toHaveBeenLastCalledWith({ groups: ['manor.catalog'], priority: 5, optional: true });
});
