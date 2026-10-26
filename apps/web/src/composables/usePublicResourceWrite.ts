import { onBeforeUnmount, ref, watch } from 'vue';
import { useUserStore } from '@/store';
import { publicOperation } from '@/api/publicResources';
import { logPublicResourceWrite } from '@/utils/publicResourceOperationLog';
export function usePublicResourceWrite() {
  const user = useUserStore(),
    busy = ref(false);
  let operation: (() => Promise<any>) | null = null,
    key = '',
    generation = 0;
  function reset() {
    generation++;
    operation = null;
    key = '';
    busy.value = false;
  }
  watch(() => [user.id, user.role, user.adminContext?.id, user.adminPreview], reset, { flush: 'sync' });
  onBeforeUnmount(reset);
  async function execute<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
    if (busy.value) throw new Error('PUBLIC_RESOURCE_BUSY');
    const next = JSON.stringify([path, body]);
    if (!operation || key !== next) {
      operation = publicOperation<T>(path, body);
      key = next;
    }
    const current = generation;
    busy.value = true;
    try {
      const result = await operation();
      if (current !== generation) throw new Error('PUBLIC_RESOURCE_IDENTITY_CHANGED');
      operation = null;
      key = '';
      logPublicResourceWrite(path, body, result);
      return result;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  return { busy, execute };
}
