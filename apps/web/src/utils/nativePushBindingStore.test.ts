import { beforeEach, expect, it } from 'vitest';
import { createNativePushBindingStore } from './nativePushBindingStore';

const first = { id: 'device-a', generation: 'g-a', userId: 'alice' };
const second = { id: 'device-b', generation: 'g-b', userId: 'alice' };
beforeEach(() => localStorage.clear());
it('keeps account receipts across runtime recreation without storing a provider token', () => {
  const store = createNativePushBindingStore(localStorage);
  store.save({ ...first, providerToken: 'must-not-be-persisted' } as typeof first);
  expect(createNativePushBindingStore(localStorage).read('alice')).toEqual(first);
  expect(store.read('bob')).toBeUndefined();
  expect(Object.values(localStorage).join('')).not.toContain('must-not-be-persisted');
  store.save({ ...second, userId: 'bob' });
  expect(store.read('alice')).toEqual(first);
});
it('does not delete a newer generation when an old unbind finishes late', () => {
  const store = createNativePushBindingStore(localStorage);
  store.save(first);
  store.save(second);
  store.remove(first);
  expect(store.read('alice')).toEqual(second);
  store.remove(second);
  expect(store.read('alice')).toBeUndefined();
});
it('rejects unavailable persistence before a new binding is created', () => {
  const store = createNativePushBindingStore({
    getItem: () => null,
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {},
  });
  expect(() => store.read('alice')).toThrow('NATIVE_PUSH_STORAGE_UNAVAILABLE');
});
