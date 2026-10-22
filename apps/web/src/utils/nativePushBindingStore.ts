import type { HuaweiBinding } from './nativeNotificationSync';

export interface NativePushBindingStore {
  read(owner: string): HuaweiBinding | undefined;
  save(binding: HuaweiBinding): void;
  remove(binding: HuaweiBinding): void;
}

// Persist only the account-scoped server receipt, never a Huawei token or web authentication.
// Keep receipts for other accounts so an offline logout can be reconciled on their next login.
export function createNativePushBindingStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): NativePushBindingStore {
  const key = (owner: string) => `light-note:native-push-binding:${encodeURIComponent(owner)}`;
  const unavailable = () =>
    Object.assign(new Error('NATIVE_PUSH_STORAGE_UNAVAILABLE'), { connectionState: 'storageUnavailable' });
  function read(owner: string) {
    try {
      const raw = storage.getItem(key(owner));
      // Verify persistence before creating a subscription, including on a fresh installation.
      storage.setItem(key(owner), raw || 'null');
      let binding: HuaweiBinding | null;
      try {
        binding = JSON.parse(raw || 'null');
      } catch {
        return undefined;
      }
      return binding?.userId === owner &&
        [binding.id, binding.generation].every(
          (value) => typeof value === 'string' && value.length > 0 && value.length <= 64,
        )
        ? { id: binding.id, generation: binding.generation, userId: owner }
        : undefined;
    } catch {
      throw unavailable();
    }
  }
  return {
    read,
    save(binding) {
      try {
        storage.setItem(
          key(binding.userId),
          JSON.stringify({ id: binding.id, generation: binding.generation, userId: binding.userId }),
        );
      } catch {
        throw unavailable();
      }
    },
    remove(binding) {
      const current = read(binding.userId);
      if (current?.id !== binding.id || current.generation !== binding.generation) return;
      try {
        storage.removeItem(key(binding.userId));
      } catch {
        throw unavailable();
      }
    },
  };
}
