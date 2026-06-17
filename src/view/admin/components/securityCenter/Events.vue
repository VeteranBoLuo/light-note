<template>
  <div>
    <div class="admin-filters security-filters">
      <div class="admin-filters-main security-filters-main">
        <b-input
          v-model:value="eventFilters.key"
          placeholder="搜索IP/接口/规则/用户"
          class="security-search-input"
          @input="handleEventSearch"
        />
        <BSelect
          v-model:value="eventFilters.severity"
          allowClear
          placeholder="威胁等级"
          class="security-select"
          :options="severityOptions"
          @change="searchEvents"
        />
        <BSelect
          v-model:value="eventFilters.actionTaken"
          allowClear
          placeholder="处置动作"
          class="security-select"
          :options="actionOptions"
          @change="searchEvents"
        />
        <BSelect
          v-model:value="eventFilters.handledStatus"
          allowClear
          placeholder="处理状态"
          class="security-select"
          :options="statusOptions"
          @change="searchEvents"
        />
        <b-button type="primary" @click="searchEvents">搜索</b-button>
      </div>
      <span class="admin-filters-hint flex-align-center">
        支持查看命中证据、脱敏请求快照、同IP近期行为和处置备注
        <div class="flex-align-center-gap" v-if="eventFilters.userId">
          <span class="filter-account-tag"> 当前账号：{{ eventFilters.userLabel || eventFilters.userId }} </span>
          <b-button size="small" type="primary" @click="clearEventAccountFilter">清除</b-button>
        </div>
      </span>
    </div>

    <div class="admin-table-card" ref="tableCardRef">
      <div class="event-batch-bar" v-if="selectedEventIds.length">
        <span>已选择 {{ selectedEventIds.length }} 条攻击日志</span>
        <div class="event-batch-actions">
          <b-button size="small" type="primary" @click="confirmBatchHandle('processed')">标记已处理</b-button>
          <b-button size="small" @click="confirmBatchHandle('false_positive')">标记误报</b-button>
          <b-button size="small" @click="confirmBatchHandle('unhandled')">改为未处理</b-button>
          <b-button size="small" @click="selectedEventIds = []">取消选择</b-button>
        </div>
      </div>
      <b-loading :loading="eventLoading">
        <BTable
          :data="events"
          :columns="eventColumns"
          :rowKey="'eventId'"
          :row-clickable="true"
          :selectable="true"
          :selected-rows="selectedEventIds"

          @row-click="onRowClick"
          @selection-change="selectedEventIds = $event"
          class="eventClass"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'createdAt'">
              <BTooltip :title="record.createdAt">
                <span class="ellipsis-cell">{{ record.createdAt }}</span>
              </BTooltip>
            </template>
            <template v-else-if="column.key === 'severity'">
              <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
            </template>
            <template v-else-if="column.key === 'matchedRule'">
              <BTooltip :title="record.matchedRule || record.attackType">
                <span class="ellipsis-cell">{{ record.matchedRule || record.attackType || '-' }}</span>
              </BTooltip>
            </template>
            <template v-else-if="column.key === 'user'">
              <BTooltip :title="eventUserTooltip(record)">
                <span class="ellipsis-cell">{{ eventUserText(record) }}</span>
              </BTooltip>
            </template>
            <template v-else-if="column.key === 'sourceIp'">
              <BTooltip :title="record.sourceIp">
                <span class="ellipsis-cell">{{ record.sourceIp }}</span>
              </BTooltip>
            </template>
            <template v-else-if="column.key === 'requestPath'">
              <BTooltip :title="record.requestPath">
                <span class="ellipsis-cell">{{ record.requestPath }}</span>
              </BTooltip>
            </template>
            <template v-else-if="column.key === 'blocked'">
              <span class="security-pill" :class="record.blocked ? 'is-high' : 'is-low'">{{
                record.blocked ? '已拦截' : '已放行'
              }}</span>
            </template>
            <template v-else-if="column.key === 'handledStatus'">
              <span class="security-pill" :class="statusPillClass(record.handledStatus)">{{ statusText(record.handledStatus) }}</span>
            </template>
          </template>
        </BTable>
      </b-loading>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { inject, onMounted, reactive, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import {
    OPEN_EVENT_DETAIL,
    REFRESH_TRIGGER,
    eventColumns,
    eventUserText,
    eventUserTooltip,
    statusText,
    statusPillClass,
  } from './securityShared';

  const openEventDetail = inject(OPEN_EVENT_DETAIL);
  const refreshTrigger = inject(REFRESH_TRIGGER);
  const route = useRoute();
  const router = useRouter();

  const tableCardRef = ref<HTMLElement | null>(null);
  useTableScrollY({ ref: tableCardRef });

  const events = ref<any[]>([]);
  const eventTotal = ref(0);
  const eventLoading = ref(false);
  const eventPage = reactive({ currentPage: 1, pageSize: 20 });
  const eventFilters = reactive<any>({
    key: '',
    severity: undefined,
    actionTaken: undefined,
    handledStatus: undefined,
    userId: undefined,
    userLabel: '',
  });
  const severityOptions = [
    { value: 'low', label: 'low' },
    { value: 'medium', label: 'medium' },
    { value: 'high', label: 'high' },
    { value: 'critical', label: 'critical' },
  ];
  const actionOptions = [
    { value: 'log', label: '记录' },
    { value: 'block', label: '拦截' },
  ];
  const statusOptions = [
    { value: 'unhandled', label: '未处理' },
    { value: 'processed', label: '已处理' },
    { value: 'false_positive', label: '误报' },
  ];
  const eventSearchTimer = ref<any>(null);
  const selectedEventIds = ref<string[]>([]);
  const batchLoading = ref(false);

  function onRowClick(record: any) {
    openEventDetail?.(record.eventId);
  }

  async function searchEvents() {
    eventLoading.value = true;
    const res = await apiQueryPost('/api/security/events', {
      currentPage: eventPage.currentPage,
      pageSize: eventPage.pageSize,
      filters: {
        key: eventFilters.key,
        severity: eventFilters.severity,
        actionTaken: eventFilters.actionTaken,
        handledStatus: eventFilters.handledStatus,
        userId: eventFilters.userId,
      },
    }).finally(() => {
      eventLoading.value = false;
    });
    if (res.status === 200) {
      events.value = res.data.items;
      eventTotal.value = res.data.total;
      selectedEventIds.value = selectedEventIds.value.filter((id) => events.value.some((event) => event.eventId === id));
    }
  }

  function handleEventSearch() {
    clearTimeout(eventSearchTimer.value);
    eventSearchTimer.value = setTimeout(() => {
      eventPage.currentPage = 1;
      searchEvents();
    }, 300);
  }

  function clearEventAccountFilter() {
    eventFilters.userId = undefined;
    eventFilters.userLabel = '';
    eventPage.currentPage = 1;
    router.replace({ query: {} });
    searchEvents();
  }

  function applyRouteFilters() {
    eventFilters.userId = route.query.userId ? String(route.query.userId) : undefined;
    eventFilters.userLabel = route.query.userLabel ? String(route.query.userLabel) : '';
    eventFilters.handledStatus = route.query.handledStatus ? String(route.query.handledStatus) : eventFilters.handledStatus;
    eventFilters.severity = route.query.severity ? String(route.query.severity) : eventFilters.severity;
  }

  const batchStatusText = {
    processed: '已处理',
    false_positive: '误报',
    unhandled: '未处理',
  };

  function confirmBatchHandle(handledStatus: 'processed' | 'false_positive' | 'unhandled') {
    if (!selectedEventIds.value.length || batchLoading.value) return;
    Alert.alert({
      title: '批量处理攻击日志',
      content:
        handledStatus === 'false_positive'
          ? `确认将选中的 ${selectedEventIds.value.length} 条攻击日志标记为误报？误报会回滚对应风险分。`
          : `确认将选中的 ${selectedEventIds.value.length} 条攻击日志标记为${batchStatusText[handledStatus]}？`,
      okText: '确认处理',
      cancelText: '取消',
      onOk: async () => {
        batchLoading.value = true;
        const res = await apiBasePost('/api/security/events/batchHandle', {
          eventIds: selectedEventIds.value,
          handledStatus,
          remark: `管理员批量标记为${batchStatusText[handledStatus]}`,
        }).finally(() => {
          batchLoading.value = false;
        });
        if (res.status === 200) {
          message.success(res.msg || '批量处理成功');
          selectedEventIds.value = [];
          searchEvents();
        }
      },
    });
  }

  watch(
    () => [route.query.userId, route.query.userLabel, route.query.handledStatus, route.query.severity],
    () => {
      applyRouteFilters();
      eventPage.currentPage = 1;
      searchEvents();
    },
  );

  watch(
    () => refreshTrigger?.value,
    () => {
      searchEvents();
    },
  );

  onMounted(() => {
    applyRouteFilters();
    searchEvents();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
