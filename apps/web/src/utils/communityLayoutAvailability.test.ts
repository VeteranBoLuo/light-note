import { afterEach, expect, it, vi } from 'vitest';
import { knownCommunityLayout, rememberCommunityLayout } from './communityLayoutAvailability';
afterEach(() => vi.useRealTimers());
it('reuses only the same identity layout while revalidation is pending', () => {
  rememberCommunityLayout('alice', true);
  expect(knownCommunityLayout('alice')).toBe(true);
  expect(knownCommunityLayout('bob')).toBe(false);
  rememberCommunityLayout('alice', false);
  expect(knownCommunityLayout('alice')).toBe(false);
});
it('expires stale presentation state', () => {
  vi.useFakeTimers();
  rememberCommunityLayout('expiry', true);
  vi.advanceTimersByTime(300_001);
  expect(knownCommunityLayout('expiry')).toBe(false);
});
