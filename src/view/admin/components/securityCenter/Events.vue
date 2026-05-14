<template>
  <div>
    <div class="admin-filters security-filters">
      <div class="admin-filters-main security-filters-main">
        <b-input
          v-model:value="eventFilters.key"
          placeholder="搜索IP/接口/类型/用户"
          class="security-search-input"
          @input="handleEventSearch"
        />
        <a-select
          v-model:value="eventFilters.severity"
          allow-clear
          placeholder="威胁等级"
          class="security-select"
          @change="searchEvents"
        >
          <a-select-option value="low">low</a-select-option>
          <a-select-option value="medium">medium</a-select-option>
          <a-select-option value="high">high</a-select-option>
          <a-select-option value="critical">critical</a-select-option>
        </a-select>
        <a-select
          v-model:value="eventFilters.actionTaken"
          allow-clear
          placeholder="处置动作"
          class="security-select"
          @change="searchEvents"
        >
          <a-select-option value="log">记录</a-select-option>
          <a-select-option value="block">拦截</a-select-option>
        </a-select>
        <a-select
          v-model:value="eventFilters.handledStatus"
          allow-clear
          placeholder="处理状态"
          class="security-select"
          @change="searchEvents"
        >
          <a-select-option value="unhandled">未处理</a-select-option>
          <a-select-option value="processed">已处理</a-select-option>
          <a-select-option value="false_positive">误报</a-select-option>
        </a-select>
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

    <div class="admin-table-card">
      <b-loading :loading="eventLoading">
        <BTable
          :data="events"
          :columns="eventColumns"
          :rowKey="'eventId'"
          :row-clickable="true"
          :style="{ height: tableScrollY + 'px' }"
          @row-click="onRowClick"
          class="eventClass"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'createdAt'">
              <a-tooltip :title="record.createdAt">
                <span class="ellipsis-cell">{{ record.createdAt }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'severity'">
              <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
            </template>
            <template v-else-if="column.key === 'attackType'">
              <a-tooltip :title="record.attackType">
                <span class="ellipsis-cell">{{ record.attackType }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'user'">
              <a-tooltip :title="eventUserTooltip(record)">
                <span class="ellipsis-cell">{{ eventUserText(record) }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'sourceIp'">
              <a-tooltip :title="record.sourceIp">
                <span class="ellipsis-cell">{{ record.sourceIp }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.key === 'requestPath'">
              <a-tooltip :title="record.requestPath">
                <span class="ellipsis-cell">{{ record.requestPath }}</span>
              </a-tooltip>
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
  import { apiQueryPost } from '@/http/request.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { useTableScrollY } from '@/composables/useTableScrollY';
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
  const { tableScrollY } = useTableScrollY({ reservedHeight: 330 });

  const events = ref<any[]>([]);
  const eventTotal = ref(0);
  const eventLoading = ref(false);
  const eventPage = reactive({ currentPage: 1, pageSize: 100 });
  const eventFilters = reactive<any>({
    key: '',
    severity: undefined,
    actionTaken: undefined,
    handledStatus: undefined,
    userId: undefined,
    userLabel: '',
  });
  const eventSearchTimer = ref<any>(null);

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

  watch(
    () => route.query.userId,
    (userId) => {
      if (userId) {
        eventFilters.userId = String(userId);
        eventFilters.userLabel = String(route.query.userLabel || userId);
        eventPage.currentPage = 1;
        searchEvents();
      }
    },
  );

  watch(
    () => refreshTrigger?.value,
    () => {
      searchEvents();
    },
  );

  onMounted(() => {
    if (route.query.userId) {
      eventFilters.userId = String(route.query.userId);
      eventFilters.userLabel = String(route.query.userLabel || route.query.userId);
    }
    searchEvents();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
