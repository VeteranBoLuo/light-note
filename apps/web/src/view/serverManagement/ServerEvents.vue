<template>
  <InfraPage>
    <template #header
      ><InfraModuleHeader
        :mobile-title="t('serverManagement.modules.events')"
        :title="t('serverManagement.eventsPage.title')"
        :cadence="t('serverManagement.eventsPage.cadence')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        @refresh="refresh"
    /></template>
    <div class="events-toolbar">
      <BInput v-model:value="keyword" clearable :placeholder="t('serverManagement.workspace.auditSearch')"
        ><template #prefix><SvgIcon :src="icon.navigation.search" size="15" /></template
      ></BInput>
      <BSelect
        v-model:value="outcome"
        :options="outcomeOptions"
        :aria-label="t('serverManagement.eventsPage.outcomeFilterLabel')"
      />
      <BDateTimePicker
        v-model:value="startDate"
        v-model:end-value="endDate"
        mode="range"
        :show-time="false"
        :placeholder="t('serverManagement.workspace.dateRange')"
      />
      <BButton @click="reset">{{ t('serverManagement.workspace.resetFilters') }}</BButton>
      <BButton :disabled="refreshing || !data?.items.length || keyword.trim() !== appliedKeyword" @click="exportItems"
        ><SvgIcon :src="icon.infrastructure.export" size="14" />{{
          t('serverManagement.workspace.exportPage')
        }}</BButton
      >
    </div>
    <div class="events-summary" :aria-busy="refreshing"
      ><span>{{ t('serverManagement.workspace.currentFilter') }}</span
      ><span v-for="key in ['total', 'succeeded', 'failed', 'denied', 'intent']" :key="key"
        >{{ key === 'total' ? t('serverManagement.eventsPage.summary.total') : outcomeLabel(key) }}
        <strong>{{ data?.filteredSummary[key === 'intent' ? 'intents' : key] ?? '—' }}</strong></span
      ></div
    >
    <BLoading v-if="refreshing && !data" inline :loading="true" :title="t('serverManagement.eventsPage.loading')" />
    <div v-if="error" class="events-error" role="status"
      ><SvgIcon :src="icon.message.warning" size="18" />{{
        data ? t('serverManagement.staleSnapshot') : t('serverManagement.snapshotUnavailable')
      }}
      · {{ error }}<BButton size="small" @click="refresh">{{ t('serverManagement.retry') }}</BButton></div
    >
    <BCard v-if="data">
      <div v-if="!data.items.length" class="events-empty"
        ><SvgIcon :src="icon.infrastructure.events" size="28" /><strong>{{
          t('serverManagement.workspace.auditEmpty')
        }}</strong
        ><BButton type="text" @click="reset">{{ t('serverManagement.workspace.resetFilters') }}</BButton></div
      >
      <template v-else>
        <div v-if="bookmark.isMobile" class="events-mobile"
          ><article v-for="item in data.items" :key="item.id"
            ><header
              ><strong>{{ actionLabel(item.action) }}</strong
              ><BChip :tone="outcomeTone(item.outcome)">{{ outcomeLabel(item.outcome) }}</BChip></header
            ><p>{{ targetLabel(item) }}</p
            ><p>{{ item.reason || t('serverManagement.eventsPage.noReason') }}</p
            ><footer
              ><time>{{ formatTime(item.createTime) }}</time
              ><BButton type="text" size="small" @click="detail = item">{{ t('common.detail') }}</BButton></footer
            ></article
          ></div
        >
        <BTable v-else :data="data.items" :columns="columns" row-key="id" :loading="refreshing"
          ><template #bodyCell="{ column, record }">
            <template v-if="column.key === 'time'">{{ formatTime(record.createTime) }}</template>
            <template v-else-if="column.key === 'action'">{{ actionLabel(record.action) }}</template>
            <template v-else-if="column.key === 'target'">{{ targetLabel(record) }}</template>
            <BChip v-else-if="column.key === 'outcome'" :tone="outcomeTone(record.outcome)">{{
              outcomeLabel(record.outcome)
            }}</BChip>
            <span class="events-reason" v-else-if="column.key === 'reason'">{{
              record.reason || t('serverManagement.eventsPage.noReason')
            }}</span>
            <BButton v-else-if="column.key === 'detail'" type="text" size="small" @click="detail = record">{{
              t('common.detail')
            }}</BButton>
          </template></BTable
        >
      </template>
      <BPagination
        :current="currentPage"
        :page-size="pageSize"
        :total="data.total"
        @page-change="currentPage = $event"
        @size-change="
          pageSize = $event;
          currentPage = 1;
        "
      />
    </BCard>
    <BModal
      :visible="Boolean(detail)"
      :title="t('common.detail')"
      :show-footer="false"
      width="min(var(--ui-layout-680, 680px), 94vw)"
      fullscreen-mobile
      @update:visible="!$event && (detail = null)"
    >
      <dl v-if="detail" class="events-detail"
        ><div v-for="field in detailFields" :key="field.label"
          ><dt>{{ field.label }}</dt
          ><dd>{{ field.value || '—' }}</dd></div
        ></dl
      >
    </BModal>
  </InfraPage>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import InfraPage from './InfraPage.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraAuditList, type InfraAuditItem } from './useInfraAuditList';
  import { formatAdminDateTime } from '@/utils/adminDateTime';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const keyword = ref('');
  const appliedKeyword = ref('');
  const outcome = ref('all');
  const startDate = ref('');
  const endDate = ref('');
  const currentPage = ref(1);
  const pageSize = ref(20);
  const detail = ref<InfraAuditItem | null>(null);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  watch(keyword, (value) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      appliedKeyword.value = value.trim();
      currentPage.value = 1;
    }, 300);
  });
  onBeforeUnmount(() => clearTimeout(debounce));
  watch([outcome, startDate, endDate], () => (currentPage.value = 1), { flush: 'sync' });
  const query = computed(() => ({
    currentPage: currentPage.value,
    pageSize: pageSize.value,
    keyword: appliedKeyword.value,
    outcome: outcome.value,
    startDate: startDate.value,
    endDate: endDate.value,
  }));
  const { data, refreshing, error, refresh } = useInfraAuditList(query);
  watch(data, (value) => {
    if (value && currentPage.value > Math.max(1, Math.ceil(value.total / pageSize.value)))
      currentPage.value = Math.max(1, Math.ceil(value.total / pageSize.value));
  });
  const outcomeOptions = computed(() =>
    ['all', 'succeeded', 'failed', 'denied', 'intent'].map((value) => ({
      value,
      label: value === 'all' ? t('serverManagement.eventsPage.filters.all') : outcomeLabel(value),
    })),
  );
  const columns = computed(() => [
    {
      key: 'time',
      title: t('serverManagement.eventsPage.exportHeaders.time'),
      width: 'var(--ui-layout-180,180px)',
      ellipsis: false,
    },
    {
      key: 'action',
      title: t('serverManagement.eventsPage.exportHeaders.action'),
      width: 'var(--ui-layout-150,150px)',
      ellipsis: false,
    },
    {
      key: 'target',
      title: t('serverManagement.eventsPage.exportHeaders.target'),
      width: 'minmax(var(--ui-layout-160,160px),1fr)',
      ellipsis: false,
    },
    {
      key: 'outcome',
      title: t('serverManagement.eventsPage.exportHeaders.outcome'),
      width: 'var(--ui-layout-90,90px)',
      ellipsis: false,
    },
    {
      key: 'reason',
      title: t('serverManagement.eventsPage.exportHeaders.reason'),
      width: 'minmax(var(--ui-layout-240,240px),1fr)',
      ellipsis: false,
    },
    { key: 'detail', title: t('common.detail'), width: 'var(--ui-layout-80,80px)', ellipsis: false },
  ]);
  function formatTime(value: string) {
    return formatAdminDateTime(value, locale.value);
  }
  function actionLabel(action: string) {
    return action === 'infra.nginx_reload'
      ? t('serverManagement.reloadNginx')
      : action === 'infra.service_restart'
        ? t('serverManagement.restartService')
        : action;
  }
  function outcomeLabel(value: string) {
    return t(
      `serverManagement.eventsPage.outcomes.${['succeeded', 'failed', 'denied', 'intent'].includes(value) ? value : 'unknown'}`,
    );
  }
  function outcomeTone(value: string): 'success' | 'danger' | 'pending' | 'neutral' {
    return value === 'succeeded'
      ? 'success'
      : value === 'failed' || value === 'denied'
        ? 'danger'
        : value === 'intent'
          ? 'pending'
          : 'neutral';
  }
  function targetLabel(item: InfraAuditItem) {
    const key = `serverManagement.serviceNames.${item.targetId}`;
    return item.targetId &&
      [
        'lightnote-api',
        'lightnote-document-worker',
        'lightnote-bookmark-icon-worker',
        'lightnote-resource-governance-worker',
        'nginx',
        'mysql',
        'redis',
      ].includes(item.targetId)
      ? t(key)
      : [item.targetType, item.targetId].filter(Boolean).join(' / ') || '—';
  }
  const detailFields = computed(() =>
    detail.value
      ? Object.entries({
          [t('serverManagement.eventsPage.exportHeaders.time')]: formatTime(detail.value.createTime),
          [t('serverManagement.eventsPage.exportHeaders.action')]: actionLabel(detail.value.action),
          [t('serverManagement.eventsPage.exportHeaders.target')]: targetLabel(detail.value),
          [t('serverManagement.eventsPage.exportHeaders.outcome')]: outcomeLabel(detail.value.outcome),
          [t('serverManagement.eventsPage.exportHeaders.reason')]: detail.value.reason,
          [t('serverManagement.workspace.actor')]: detail.value.actorAlias || detail.value.actorUserId,
          'Audit ID': detail.value.id,
          'Request ID': detail.value.requestId,
          IP: detail.value.ipMasked,
          [t('serverManagement.workspace.rawEvidence')]: JSON.stringify(detail.value.metadata || {}, null, 2),
        }).map(([label, value]) => ({ label, value }))
      : [],
  );
  function reset() {
    clearTimeout(debounce);
    keyword.value = '';
    appliedKeyword.value = '';
    outcome.value = 'all';
    startDate.value = '';
    endDate.value = '';
    currentPage.value = 1;
  }
  function auditText() {
    const cell = (value: unknown) =>
      String(value ?? '')
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/^[=+@-]/, "'$&");
    return [
      [
        t('serverManagement.eventsPage.exportHeaders.time'),
        t('serverManagement.eventsPage.exportHeaders.outcome'),
        t('serverManagement.eventsPage.exportHeaders.action'),
        t('serverManagement.eventsPage.exportHeaders.target'),
        t('serverManagement.eventsPage.exportHeaders.reason'),
      ],
      ...(data.value?.items || []).map((item) => [
        formatTime(item.createTime),
        outcomeLabel(item.outcome),
        actionLabel(item.action),
        targetLabel(item),
        item.reason,
      ]),
    ]
      .map((row) => row.map(cell).join('\t'))
      .join('\n');
  }
  async function exportItems() {
    if (!data.value || refreshing.value) return;
    const content = auditText();
    try {
      const result = await deliverGeneratedFile({
        content,
        fileName: buildExportFileName(
          'lightnote-server-audit-page',
          `lightnote-server-audit-page-${currentPage.value}`,
          'tsv',
        ),
        mimeType: 'text/tab-separated-values',
        preferShare: true,
      });
      if (result === 'unavailable') {
        const copied = await copyTextToClipboard(content);
        copied
          ? message.warning(t('serverManagement.eventsPage.exportUnavailable'))
          : message.error(t('serverManagement.eventsPage.exportFailed'));
      } else if (result !== 'cancelled') message.success(t('serverManagement.eventsPage.exported'));
    } catch {
      message.error(t('serverManagement.eventsPage.exportFailed'));
    }
  }
</script>
<style scoped lang="less">
  .events-reason {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }

  .events-toolbar {
    display: grid;
    grid-template-columns:
      minmax(var(--ui-layout-200, 200px), 1fr) var(--ui-layout-140, 140px) var(--ui-layout-260, 260px)
      auto auto;
    gap: var(--ui-space-10, 10px);
    align-items: center;
  }
  .events-summary {
    display: flex;
    align-items: center;
    gap: var(--ui-space-24, 24px);
    flex-wrap: wrap;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .events-summary strong {
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .events-error {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--warning-color);
    border-radius: 12px;
    color: var(--warning-color);
  }
  .events-empty {
    min-height: var(--ui-layout-240, 240px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
  }
  .events-mobile article {
    padding: var(--ui-space-16, 16px) 0;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .events-mobile header,
  .events-mobile footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }
  .events-mobile p,
  .events-mobile time {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    overflow-wrap: anywhere;
  }
  .events-detail {
    display: grid;
    gap: var(--ui-space-16, 16px);
    margin: 0;
  }
  .events-detail dt {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .events-detail dd {
    margin: var(--ui-space-6, 6px) 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-14, 14px);
  }
  @media (max-width: 1199px) {
    .events-toolbar {
      grid-template-columns: 1fr 1fr;
    }
    .events-toolbar > :first-child {
      grid-column: 1/-1;
    }
  }
  @media (max-width: 767px) {
    .events-toolbar {
      gap: var(--ui-space-8, 8px);
    }
    .events-toolbar > :nth-child(3) {
      grid-column: 1/-1;
    }
    .events-summary {
      gap: var(--ui-space-10, 10px);
    }
  }
</style>
