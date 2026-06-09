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
    <div class="admin-table-card" ref="tableCardRef">
      <BTable

        :data="accountRepList"
        :columns="accountRepColumns"
        :rowKey="'userId'"
        :row-clickable="true"
        @row-click="onRowClick"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'account'">
            <div class="account-cell">
              <strong>{{ record.alias || record.email || record.userId }}</strong>
              <span>{{ record.email || record.userId }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'role'">
            <span class="security-pill is-neutral">{{ record.role }}</span>
          </template>
          <template v-else-if="column.key === 'riskScore'">
            <a-progress
              :title="record.riskScore || 0"
              :percent="record.riskScore || 0"
              size="small"
              :stroke-color="scoreColor(record.riskScore || 0)"
              trail-color="var(--security-progress-trail)"
              :show-info="false"
            ></a-progress>
          </template>
          <template v-else-if="column.key === 'delFlag'">
            <span class="security-pill" :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{
              Number(record.delFlag) === 1 ? '已封禁' : '正常'
            }}</span>
          </template>
          <template v-else-if="column.key === 'lastEventAt'">
            <BTooltip :title="record.lastEventAt">
              <span class="ellipsis-cell">{{ record.lastEventAt || '-' }}</span>
            </BTooltip>
          </template>
          <template v-else-if="column.key === 'action'">
            <b-button v-if="Number(record.delFlag) !== 1" size="small" @click.stop="banAccount?.(record)"
              >封禁账号</b-button
            >
            <b-button v-else size="small" @click.stop="unbanAccount?.(record)">解封账号</b-button>
          </template>
        </template>
      </BTable>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { inject, onMounted, reactive, ref, watch } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
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

  const tableCardRef = ref<HTMLElement | null>(null);
  useTableScrollY({ ref: tableCardRef });

  const accountRepList = ref<any[]>([]);
  const acctRepTotal = ref(0);
  const acctRepPage = reactive({ currentPage: 1, pageSize: 100 });
  const acctRepFilters = reactive<any>({ key: '' });
  const acctRepSearchTimer = ref<any>(null);

  function onRowClick(record: any) {
    navigateToUserEvents?.(record.userId, record.alias || record.email || record.userId);
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
