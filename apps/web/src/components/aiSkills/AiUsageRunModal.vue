<template>
  <BModal
    v-model:visible="visible"
    :title="t('settings.ai.usage.actions.organizeRun')"
    :show-footer="false"
    width="min(760px, 94vw)"
    height="min(720px, 86vh)"
    fullscreen-mobile
  >
    <div class="run-usage">
      <p class="run-hint">{{ t('settings.ai.usage.runHint') }}</p>
      <div class="run-heading">
        <strong>{{
          t('settings.ai.usage.runTotal', { n: formatTokens(data?.summary.chargedTokens ?? run?.chargedTokens ?? 0) })
        }}</strong>
        <BButton size="small" :loading="loading && !!data" :disabled="loading" @click="load">{{
          t('settings.ai.usage.refresh')
        }}</BButton>
      </div>
      <BLoading v-if="loading && !data" inline :loading="true" :title="t('settings.ai.usage.detail.loading')" />
      <div v-if="error" role="alert" class="run-error">
        {{ t('settings.ai.usage.detail.errorDescription') }}
        <BButton size="small" @click="load">{{ t('settings.ai.usage.retry') }}</BButton>
      </div>
      <div v-if="data" class="run-calls">
        <BButton
          v-for="item in data.items"
          :key="item.id"
          class="run-call"
          block
          @click="
            selected = item;
            detailVisible = true;
          "
        >
          <span class="call-info"
            ><strong>{{
              t('settings.ai.usage.runCall', { n: (page - 1) * pageSize + data.items.indexOf(item) + 1 })
            }}</strong>
            <small
              >{{ formatDate(item.createdAt) }} · {{ t(`settings.ai.usage.status.${item.status}`) }} ·
              {{ t('settings.ai.usage.providerCalls', { n: item.providerCallCount }) }}</small
            >
          </span>
          <span class="call-tokens"
            ><strong>{{ formatTokens(item.chargedTokens) }}</strong
            ><small>tokens</small></span
          >
          <SvgIcon :src="icon.arrow_right" size="15" />
        </BButton>
        <p v-if="!data.items.length">{{ t('settings.ai.usage.emptyTitle') }}</p>
        <BPagination
          v-if="data.pagination.total > pageSize"
          :current="page"
          :page-size="pageSize"
          :total="data.pagination.total"
          @page-change="page = $event"
          @size-change="
            pageSize = $event;
            page = 1;
          "
        />
      </div>
    </div>
    <AiUsageDetailModal v-model:visible="detailVisible" :execution="selected" />
  </BModal>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import AiUsageDetailModal from './AiUsageDetailModal.vue';
  type Call = NonNullable<InstanceType<typeof AiUsageDetailModal>['$props']['execution']>;
  const props = defineProps<{
    visible: boolean;
    run: { organizeRunId?: string; chargedTokens: number } | null;
    days: number;
  }>();
  const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>();
  const visible = computed({ get: () => props.visible, set: (value) => emit('update:visible', value) });
  const { t, locale } = useI18n();
  const pageSize = ref(20);
  const page = ref(1),
    loading = ref(false),
    error = ref(false),
    detailVisible = ref(false);
  const selected = ref<Call | null>(null);
  const data = ref<{ items: Call[]; pagination: { total: number }; summary: { chargedTokens: number } } | null>(null);
  let sequence = 0;
  const formatTokens = (value: number) => new Intl.NumberFormat(locale.value).format(value);
  const formatDate = (value: number) => new Date(value).toLocaleString(locale.value);
  async function load() {
    if (!visible.value || !props.run?.organizeRunId) return;
    const current = ++sequence;
    loading.value = true;
    error.value = false;
    try {
      const response = await apiBasePost(
        '/api/chat/aiUsage',
        { organizeRunId: props.run.organizeRunId, days: props.days, page: page.value, pageSize: pageSize.value },
        { silent: true },
      );
      if (current !== sequence) return;
      if (response.status !== 200 || response.data?.query?.organizeRunId !== props.run?.organizeRunId)
        throw new Error('usage unavailable');
      data.value = response.data;
    } catch {
      if (current === sequence) error.value = true;
    } finally {
      if (current === sequence) loading.value = false;
    }
  }
  watch(
    () => [props.visible, props.run?.organizeRunId, props.days, page.value, pageSize.value],
    (next, previous) => {
      sequence++;
      data.value = null;
      error.value = false;
      loading.value = false;
      const changedScope = !previous || next.slice(0, 3).some((value, index) => value !== previous[index]);
      if (changedScope) {
        detailVisible.value = false;
        selected.value = null;
        if (page.value !== 1) {
          page.value = 1;
          return;
        }
      }
      void load();
    },
    { immediate: true },
  );
</script>
<style scoped lang="less">
  .run-usage {
    display: grid;
    gap: 16px;
    color: var(--text-color);
  }
  .run-hint {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .run-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .run-calls {
    display: grid;
    gap: 10px;
  }
  .run-call {
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    height: auto;
  }
  .call-info {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 5px;
    white-space: normal;
  }
  .call-info small,
  .call-tokens small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .call-tokens {
    display: grid;
    gap: 4px;
    text-align: right;
  }
  .run-error {
    color: var(--danger-color);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  @media (max-width: 600px) {
    .run-usage {
      padding: 16px;
    }
    .run-heading {
      align-items: flex-start;
    }
    .run-call {
      line-height: 1.5;
      gap: 8px;
      padding: 12px;
    }
  }
</style>
