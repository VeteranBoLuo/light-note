<template>
  <BDrawer
    :open="open"
    :title="t('adminActivity.title')"
    width="620px"
    :mobile-full-screen="true"
    @close="emit('close')"
    @after-close="restoreFocus"
  >
    <div class="activity-drawer">
      <div class="activity-drawer__heading">
        <div>
          <strong v-if="page">{{ t('adminActivity.total', { date: page.date, count: page.total }) }}</strong>
          <p>{{ t(hideInternal ? 'adminActivity.internalHidden' : 'adminActivity.internalIncluded') }}</p>
        </div>
        <BButton size="small" :loading="loading" @click="load(true)">{{ t('adminActivity.refresh') }}</BButton>
      </div>
      <p class="activity-drawer__hint">{{ t('adminActivity.rule') }}</p>
      <p class="activity-drawer__hint">{{ t('adminActivity.timeHint') }}</p>
      <p v-if="page?.partialToday" class="activity-drawer__hint">{{ t('adminActivity.partial') }}</p>
      <BLoading v-if="loading && !page" inline loading :title="t('adminActivity.loading')" />
      <div v-if="error" class="activity-drawer__error" role="alert">
        <span>{{ t('adminActivity.failed') }}</span>
        <BButton size="small" @click="load(retryReset)">{{ t('adminActivity.retry') }}</BButton>
      </div>
      <p v-if="page && !page.items.length && !loading">{{ t('adminActivity.empty') }}</p>
      <BVirtualList
        v-if="page?.items.length"
        class="activity-drawer__list"
        :items="page.items"
        item-key="id"
        :item-height="148"
        :overscan="3"
        :loading="loading"
        :has-more="page.hasMore && !error"
        :loading-text="t('adminActivity.loading')"
        role="list"
        :aria-label="t('adminActivity.title')"
        @load-more="load(false)"
      >
        <template #default="{ item }">
          <div class="activity-drawer__row" role="listitem">
            <strong :title="item.name">{{ item.name || t('adminActivity.unnamed') }}</strong>
            <span class="activity-drawer__ellipsis" :title="item.id">ID · {{ item.id }}</span>
            <span v-if="item.userRemark" class="activity-drawer__ellipsis" :title="item.userRemark"
              >{{ t('adminActivity.remark') }} · {{ item.userRemark }}</span
            >
            <span>{{ t('adminActivity.first') }} · {{ item.firstActiveAt.slice(11, 19) }}</span>
            <span>{{ t('adminActivity.last') }} · {{ item.lastActiveAt.slice(11, 19) }}</span>
          </div>
        </template>
      </BVirtualList>
      <p v-if="page?.items.length && !page.hasMore" class="activity-drawer__hint">{{ t('adminActivity.complete') }}</p>
    </div>
  </BDrawer>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import { getActiveUsers, type ActiveUsersPage } from '@/api/userActivity';
  const props = defineProps<{ open: boolean; hideInternal: boolean }>();
  const emit = defineEmits<{ close: []; snapshot: [page: ActiveUsersPage] }>();
  const { t } = useI18n();
  const page = ref<ActiveUsersPage | null>(null);
  const loading = ref(false);
  const error = ref(false);
  const retryReset = ref(true);
  let returnFocus: HTMLElement | null = null;
  function restoreFocus() {
    if (!props.open && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  let sequence = 0;
  let abort: AbortController | null = null;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  function cancel() {
    sequence++;
    abort?.abort();
    abort = null;
    loading.value = false;
  }
  function scheduleMidnight() {
    if (midnightTimer !== undefined) clearTimeout(midnightTimer);
    if (!props.open) return;
    const delay = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000) + 100;
    midnightTimer = setTimeout(() => {
      void load(true);
      scheduleMidnight();
    }, delay);
  }
  async function load(reset = false) {
    if (!props.open) return;
    const changedDay = Boolean(page.value && page.value.date !== today());
    reset ||= changedDay;
    if (!reset && (loading.value || (page.value && !page.value.hasMore))) return;
    if (reset) {
      cancel();
      if (changedDay) page.value = null;
    }
    const requestSequence = ++sequence;
    const scope = props.hideInternal;
    abort = new AbortController();
    loading.value = true;
    error.value = false;
    try {
      const response = await getActiveUsers(
        scope,
        reset ? null : page.value?.nextCursor || null,
        reset ? null : page.value?.snapshotAt || null,
        abort.signal,
      );
      if (requestSequence !== sequence || !props.open) return;
      if (response.status !== 200) throw new Error('ACTIVITY_UNAVAILABLE');
      const next = response.data as ActiveUsersPage;
      if (next.date !== today()) {
        void load(true);
        return;
      }
      const prior = reset ? [] : page.value?.items || [];
      const existing = new Set(prior.map((item) => item.id));
      page.value = { ...next, items: [...prior, ...next.items.filter((item) => !existing.has(item.id))] };
      if (!prior.length) emit('snapshot', next);
    } catch {
      if (requestSequence === sequence) {
        error.value = true;
        retryReset.value = reset || !page.value;
      }
    } finally {
      if (requestSequence === sequence) {
        loading.value = false;
        abort = null;
      }
    }
  }
  watch(
    () => [props.open, props.hideInternal],
    (_, previous) => {
      if (props.open && !previous?.[0])
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      cancel();
      page.value = null;
      error.value = false;
      scheduleMidnight();
      if (props.open) void load(true);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    cancel();
    if (midnightTimer !== undefined) clearTimeout(midnightTimer);
  });
</script>
<style scoped lang="less">
  .activity-drawer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
    color: var(--text-color);
  }
  .activity-drawer p {
    margin: 0;
  }
  .activity-drawer__heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .activity-drawer__heading p,
  .activity-drawer__hint {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .activity-drawer__list {
    flex: 1;
    min-height: 0;
  }
  .activity-drawer__row {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-border-color);
    font-size: 12px;
    color: var(--desc-color);
  }
  .activity-drawer__row strong {
    color: var(--text-color);
    font-size: 14px;
  }
  .activity-drawer__ellipsis,
  .activity-drawer__row strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .activity-drawer__error {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--danger-color);
  }
</style>
