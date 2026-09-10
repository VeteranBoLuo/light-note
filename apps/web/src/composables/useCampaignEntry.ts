import { computed, onMounted, shallowRef } from 'vue';
import { getCampaignEntry, type CampaignPresentation } from '@/api/supportApi';
import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
const entry = shallowRef<CampaignPresentation | null>(null);
let pending: Promise<void> | null = null;
let loadedAt = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
export async function refreshCampaignEntry(force = false) {
  if (pending) {
    if (!force) return pending;
    await pending;
  }
  if (!force && Date.now() - loadedAt < 1500) return;
  pending = (async () => {
    try {
      entry.value = await getCampaignEntry();
      loadedAt = Date.now();
      clearTimeout(expiryTimer);
      if (entry.value) {
        const remaining = new Date(entry.value.endsAt).getTime() - new Date(entry.value.serverNow).getTime();
        if (Number.isFinite(remaining))
          expiryTimer = setTimeout(
            () => {
              if (remaining > 2147483647) void refreshCampaignEntry(true);
              else {
                entry.value = null;
                loadedAt = 0;
              }
            },
            Math.max(0, Math.min(remaining, 2147483647)),
          );
      }
    } catch {
      entry.value = null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
export function useCampaignEntry() {
  onMounted(() => void refreshCampaignEntry());
  useForegroundRefresh({ refresh: () => refreshCampaignEntry(), staleMs: 0 });
  return {
    entry: computed(() => entry.value),
    path: computed(() => (entry.value ? `/campaign/${encodeURIComponent(entry.value.campaignKey)}` : '')),
  };
}
