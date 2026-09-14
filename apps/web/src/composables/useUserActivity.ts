import { onBeforeUnmount, watch } from 'vue';
import { useUserStore } from '@/store';
import { apiBasePost } from '@/http/request';
import { isAdminLoginPreview } from '@/utils/authStorage';
import { createUserActivityRuntime } from '@/utils/userActivityRuntime';
import { bindResourceReuseRuntime, createResourceReuseRuntime } from '@/utils/resourceReuseRuntime';

export function useUserActivity() {
  const user = useUserStore();
  const reuse = createResourceReuseRuntime({
    report: async (target, signal) => {
      const response = await apiBasePost('/api/common/recordResourceOpen', target, {
        silent: true,
        suppressAuthExpired: true,
        timeout: 3000,
        signal,
        adapter: 'fetch',
        fetchOptions: { keepalive: true },
      });
      return response.status === 200 && response.data?.accepted === true;
    },
  });
  bindResourceReuseRuntime(reuse);
  watch(
    () => (user.role === 'user' && !user.adminContext && !isAdminLoginPreview() ? user.id : ''),
    (owner) => reuse.setOwner(owner || ''),
    { immediate: true, flush: 'sync' },
  );
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
  onBeforeUnmount(() => {
    runtime.dispose();
    reuse.dispose();
    bindResourceReuseRuntime(null);
  });
}
