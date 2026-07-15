import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { completeInbox, type InboxResourceType } from '@/api/inboxApi';
import { inboxStore } from '@/store';

export function useInboxOrganizer() {
  const route = useRoute();
  const inbox = inboxStore();
  const completingInbox = ref(false);
  const isOrganizingFromInbox = computed(() => route.query.organize === 'inbox');

  async function completeInboxResource(resourceType: InboxResourceType, resourceId: string | number) {
    const id = String(resourceId || '').trim();
    if (!id || completingInbox.value) return false;
    completingInbox.value = true;
    try {
      const res = await completeInbox([{ resourceType, resourceId: id }]);
      if (res.status !== 200) return false;
      // 完成接口幂等：关系已完成时 affectedRows=0，也应允许编辑页正常退出。
      await inbox.refreshCount();
      return true;
    } catch {
      return false;
    } finally {
      completingInbox.value = false;
    }
  }

  return { isOrganizingFromInbox, completingInbox, completeInboxResource };
}
