import { onMounted, onUnmounted, watch } from 'vue';
import { useUserStore } from '@/store';
import { getAdminContextToken } from '@/utils/authStorage';
import { createNotificationRealtime } from '@/utils/notificationRealtime';
import { useNotification } from '@/composables/useNotification';

const listeners = new Set<() => void>();
let owner = '';
let stop: (() => void) | undefined;

/** Header bell and notification page share one foreground connection per tab. */
export function useNotificationRealtime(onChange: () => void) {
  const user = useUserStore();
  const { refreshUnread } = useNotification();
  let unwatch: (() => void) | undefined;
  onMounted(() => {
    listeners.add(onChange);
    unwatch = watch(
      () => [user.id, user.role, getAdminContextToken()],
      () => {
        const nextOwner = user.id && user.role !== 'visitor' ? `${user.id}:${getAdminContextToken()}` : '';
        if (nextOwner === owner) return;
        stop?.();
        owner = nextOwner;
        stop = owner
          ? createNotificationRealtime({
              onChange: () => {
                void refreshUnread({ afterCurrent: true });
                for (const listener of listeners) listener();
              },
            })
          : undefined;
      },
      { immediate: true },
    );
  });
  onUnmounted(() => {
    unwatch?.();
    listeners.delete(onChange);
    if (listeners.size) return;
    stop?.();
    stop = undefined;
    owner = '';
  });
}
