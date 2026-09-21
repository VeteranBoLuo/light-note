import { computed } from 'vue';
import { useUserStore } from '@/store';

/** Community browsing keeps the subject identity in both administrator context modes. */
export function useCommunityPreview() {
  const user = useUserStore();
  const preview = computed(() => Boolean(user.adminContext));
  const identity = computed(() => `${user.id}|${user.role}|${user.adminContext?.id || ''}`);
  return { preview, identity };
}
