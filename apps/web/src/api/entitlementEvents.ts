import { apiBasePost } from '@/http/request';
import { isAdminLoginPreview } from '@/utils/authStorage';
export type EntitlementEvent = 'quota_insufficient' | 'enter_points' | 'enter_store' | 'select_item' | 'return_task';
export function recordEntitlementEvent(
  event: EntitlementEvent,
  data: { flowId?: string; source?: string; skuId?: string; asset?: string } = {},
) {
  if (isAdminLoginPreview()) return;
  const { flowId, source, skuId, asset } = data;
  void apiBasePost(
    '/api/support/events',
    { event, flowId, source, skuId, asset },
    { silent: true, feedback: false },
  ).catch(() => {});
}
