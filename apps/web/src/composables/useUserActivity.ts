import { onBeforeUnmount, watch } from 'vue';
import { useUserStore } from '@/store';
import { apiBasePost } from '@/http/request';
import { isAdminLoginPreview } from '@/utils/authStorage';
import { createUserActivityRuntime } from '@/utils/userActivityRuntime';

export function useUserActivity() {
  const user = useUserStore();
  const runtime = createUserActivityRuntime({
    report: async (signal, abortSignal) => {
      const response = await apiBasePost(
        '/api/common/recordUserActivity',
        { signal },
        {
          silent: true,
          suppressAuthExpired: true,
          timeout: 3000,
          signal: abortSignal,
        },
      );
      return response.status === 200 && response.data?.accepted === true;
    },
  });
  watch(
    () =>
      user.id && !['visitor', 'deleted'].includes(user.role) && !user.adminContext && !isAdminLoginPreview()
        ? user.id
        : '',
    (owner) => runtime.setOwner(owner),
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(() => runtime.dispose());
}
