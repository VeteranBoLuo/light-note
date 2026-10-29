import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { getAdminOperationAudits } from '@/api/commonApi';
export interface InfraAuditQuery {
  currentPage: number;
  pageSize: number;
  keyword: string;
  outcome: string;
  startDate: string;
  endDate: string;
}
export interface InfraAuditItem {
  id: string;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: string;
  reason?: string;
  createTime: string;
  requestId?: string;
  actorAlias?: string;
  actorUserId?: string;
  ipMasked?: string;
  metadata?: Record<string, unknown>;
}
export interface InfraAuditData {
  items: InfraAuditItem[];
  total: number;
  filteredSummary: Record<string, number>;
}
export function useInfraAuditList(query: Readonly<Ref<InfraAuditQuery>>) {
  const data = shallowRef<InfraAuditData | null>(null);
  const refreshing = ref(false);
  const error = ref('');
  let generation = 0;
  let mounted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeKey = '';
  function schedule() {
    clearTimeout(timer);
    if (mounted && document.visibilityState === 'visible') timer = setTimeout(() => void refresh(), 30_000);
  }
  async function refresh() {
    const target = { ...query.value };
    const key = JSON.stringify(target);
    if (refreshing.value && key === activeKey) return;
    const current = ++generation;
    activeKey = key;
    refreshing.value = true;
    clearTimeout(timer);
    try {
      const response = await getAdminOperationAudits({
        ...target,
        action: 'all',
        actionScope: 'infra',
        includeSummary7d: false,
      });
      if (current !== generation || !mounted) return;
      if (response.status !== 200) throw new Error(response.msg || 'Audit unavailable');
      data.value = {
        items: Array.isArray(response.data?.items) ? response.data.items : [],
        total: Number(response.data?.total) || 0,
        filteredSummary: response.data?.filteredSummary || {},
      };
      error.value = '';
    } catch (cause) {
      if (current === generation && mounted) error.value = cause instanceof Error ? cause.message : 'Audit unavailable';
    } finally {
      if (current === generation && mounted) {
        refreshing.value = false;
        schedule();
      }
    }
  }
  watch(
    query,
    () => {
      data.value = null;
      error.value = '';
      if (mounted) void refresh();
    },
    { flush: 'post' },
  );
  function visibility() {
    if (document.visibilityState === 'visible') void refresh();
    else clearTimeout(timer);
  }
  onMounted(() => {
    mounted = true;
    document.addEventListener('visibilitychange', visibility);
    void refresh();
  });
  onBeforeUnmount(() => {
    mounted = false;
    ++generation;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibility);
  });
  return { data, refreshing, error, refresh };
}
