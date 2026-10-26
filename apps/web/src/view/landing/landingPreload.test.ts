import { expect, it, vi } from 'vitest';
import type { Router } from 'vue-router';
import { scheduleStaticPrewarm } from '@/utils/staticPrewarm';
import { scheduleLandingStartupPreload } from './landingPreload';
vi.mock('@/utils/staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => () => {}) }));
it('resolves the homepage without invoking its loader or navigating', () => {
  const router = { resolve: vi.fn(() => ({ name: 'noteLibrary' })) } as unknown as Router;
  scheduleLandingStartupPreload(router, '/noteLibrary');
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({
    groups: ['route.noteLibrary', 'route.workbenches', 'account'],
    priority: 2,
  });
});
