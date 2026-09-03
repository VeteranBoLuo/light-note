import { useI18n } from 'vue-i18n';
import { completeInbox, enqueueInbox, type InboxResourceRef } from '@/api/inboxApi';
import { recordOperation } from '@/api/commonApi';
import { batchAddSearchResourcesToInbox } from '@/api/search';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { blockGuestWrite } from '@/composables/useGuestGuard';
import { inboxStore } from '@/store';

const INBOX_DIRECT_WRITE_LIMIT = 50;

export function useInboxEnqueue() {
  const { t } = useI18n();
  const inbox = inboxStore();

  async function addResourcesToInbox(items: InboxResourceRef[], operationModule: string) {
    if (!items.length) {
      message.warning(t('inbox.noResourceSelected'));
      return false;
    }
    if (blockGuestWrite('inbox-enqueue', t('inbox.guestPrompt'))) return false;

    try {
      const res =
        items.length <= INBOX_DIRECT_WRITE_LIMIT
          ? await enqueueInbox(items, 'manual')
          : await batchAddSearchResourcesToInbox({
              mode: 'explicit',
              items: items.map((item) => ({ id: item.resourceId, type: item.resourceType })),
            });
      if (res.status !== 200) {
        message.error(res.msg || t('inbox.addFailed'));
        return false;
      }
      const changed = Number(res.data?.added || 0) + Number(res.data?.reopened || 0);
      message.success(changed > 0 ? t('inbox.addedCount', { count: changed }) : t('inbox.alreadyPending'));
      if (changed > 0) {
        recordOperation({ module: operationModule, operation: `手动加入待整理【${changed}项】` });
      }
      await inbox.refreshCount();
      return true;
    } catch {
      message.error(t('inbox.addFailed'));
      return false;
    }
  }

  async function removeResourcesFromInbox(items: InboxResourceRef[], operationModule: string) {
    if (!items.length) return false;
    if (blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return false;

    try {
      const res = await completeInbox(items);
      if (res.status !== 200) {
        message.error(res.msg || t('inbox.removeFailed'));
        return false;
      }
      const changed = Number(res.data?.completed || 0);
      message.success(t('inbox.removedFromPending'));
      if (changed > 0) {
        recordOperation({ module: operationModule, operation: `取消待整理【${changed}项】` });
      }
      await inbox.refreshCount();
      return true;
    } catch {
      message.error(t('inbox.removeFailed'));
      return false;
    }
  }

  return { addResourcesToInbox, removeResourcesFromInbox };
}
