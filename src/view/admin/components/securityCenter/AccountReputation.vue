<template>
  <div>
    <div class="admin-filters security-filters">
      <div class="admin-filters-main security-filters-main">
        <b-input
          v-model:value="acctRepFilters.key"
          placeholder="搜索账号/邮箱"
          class="security-search-input"
          @input="handleAcctRepSearch"
        />
        <b-button type="primary" @click="searchAccountReputation">搜索</b-button>
      </div>
    </div>
    <div class="admin-table-card">
      <a-table
        :data-source="accountRepList"
        :columns="accountRepColumns"
        row-key="userId"
        :pagination="false"
        :scroll="{ y: tableScrollY }"
        :custom-row="acctRepRecordRow"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'account'">
            <div class="account-cell">
              <strong>{{ record.alias || record.email || record.userId }}</strong>
              <span>{{ record.email || record.userId }}</span>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'role'">
            <span class="security-pill is-neutral">{{ record.role }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'riskScore'">
            <a-progress
              :percent="record.riskScore || 0"
              size="small"
              :stroke-color="scoreColor(record.riskScore || 0)"
              trail-color="var(--security-progress-trail)"
            />
          </template>
          <template v-else-if="column.dataIndex === 'delFlag'">
            <span class="security-pill" :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{
              Number(record.delFlag) === 1 ? '已封禁' : '正常'
            }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'lastEventAt'">
            <a-tooltip :title="record.lastEventAt">
              <span class="ellipsis-cell">{{ record.lastEventAt || '-' }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <b-button v-if="Number(record.delFlag) !== 1" size="small" @click.stop="banAccount?.(record)"
              >封禁账号</b-button
            >
            <b-button v-else size="small" @click.stop="unbanAccount?.(record)">解封账号</b-button>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { inject, onMounted, reactive, ref, watch } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import {
    NAVIGATE_TO_USER_EVENTS,
    REFRESH_TRIGGER,
    BAN_ACCOUNT,
    UNBAN_ACCOUNT,
    accountRepColumns,
    scoreColor,
  } from './securityShared';

  const navigateToUserEvents = inject(NAVIGATE_TO_USER_EVENTS);
  const refreshTrigger = inject(REFRESH_TRIGGER);
  const banAccount = inject(BAN_ACCOUNT);
  const unbanAccount = inject(UNBAN_ACCOUNT);
  const { tableScrollY } = useTableScrollY({ reservedHeight: 350 });

  const accountRepList = ref<any[]>([]);
  const acctRepTotal = ref(0);
  const acctRepPage = reactive({ currentPage: 1, pageSize: 100 });
  const acctRepFilters = reactive<any>({ key: '' });
  const acctRepSearchTimer = ref<any>(null);

  function acctRepRecordRow(record: any) {
    return {
      class: 'clickable-row',
      onClick: (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest('button,input,.ant-checkbox-wrapper,.ant-checkbox')) {
          return;
        }
        navigateToUserEvents?.(record.userId, record.alias || record.email || record.userId);
      },
    };
  }

  async function searchAccountReputation() {
    const res = await apiQueryPost('/api/security/accountReputation', {
      currentPage: acctRepPage.currentPage,
      pageSize: acctRepPage.pageSize,
      filters: { key: acctRepFilters.key },
    });
    if (res.status === 200) {
      accountRepList.value = res.data.items;
      acctRepTotal.value = res.data.total;
    }
  }

  function handleAcctRepSearch() {
    clearTimeout(acctRepSearchTimer.value);
    acctRepSearchTimer.value = setTimeout(() => {
      acctRepPage.currentPage = 1;
      searchAccountReputation();
    }, 300);
  }

  function onAcctRepPageChange(page: number, pageSize: number) {
    acctRepPage.currentPage = pageSize !== acctRepPage.pageSize ? 1 : page;
    acctRepPage.pageSize = pageSize;
    searchAccountReputation();
  }

  watch(
    () => refreshTrigger?.value,
    () => {
      searchAccountReputation();
    },
  );

  onMounted(() => {
    searchAccountReputation();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
