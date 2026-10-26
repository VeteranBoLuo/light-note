import { expect, it, vi } from 'vitest';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { scheduleManorPrewarm } from './manorPrewarm';
vi.mock('./staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => () => {}) }));
it('submits only static groups to the shared scheduler', () => {
  scheduleManorPrewarm(false);
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({ groups: ['manor.desktop'], priority: 4 });
  vi.mocked(scheduleStaticPrewarm).mockClear();
  scheduleManorPrewarm(true);
  expect(scheduleStaticPrewarm).not.toHaveBeenCalled();
});
