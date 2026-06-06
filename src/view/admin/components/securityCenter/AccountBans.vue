<template>
  <div>
    <div class="admin-filters security-filters">
      <div class="admin-filters-main security-filters-main">
        <b-input
          v-model:value="accountFilters.key"
          placeholder="搜索账号/邮箱/封禁原因"
          class="security-search-input"
          @input="handleAccountSearch"
        />
        <b-button type="primary" @click="searchAccountBans">搜索</b-button>
      </div>
      <span class="admin-filters-hint">账号封禁会让该账号退出登录；登录时会明确提示账号已被封禁</span>
    </div>
    <div class="admin-table-card" ref="tableCardRef">
      <BTable

        :data="accountBans"
        :columns="accountColumns"
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
              :percent="record.riskScore || 0"
              size="small"
              :stroke-color="scoreColor(record.riskScore || 0)"
              trail-color="var(--security-progress-trail)"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <b-button size="small" @click.stop="unbanAccount?.(record)">解封账号</b-button>
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
  import {
    NAVIGATE_TO_USER_EVENTS,
    REFRESH_TRIGGER,
    UNBAN_ACCOUNT,
    accountColumns,
    scoreColor,
  } from './securityShared';

  const navigateToUserEvents = inject(NAVIGATE_TO_USER_EVENTS);
  const refreshTrigger = inject(REFRESH_TRIGGER);
  const unbanAccount = inject(UNBAN_ACCOUNT);

  const tableCardRef = ref<HTMLElement | null>(null);
  useTableScrollY({ ref: tableCardRef });

  const accountBans = ref<any[]>([]);
  const accountTotal = ref(0);
  const accountPage = reactive({ currentPage: 1, pageSize: 100 });
  const accountFilters = reactive<any>({ key: '' });
  const accountSearchTimer = ref<any>(null);

  function onRowClick(record: any) {
    navigateToUserEvents?.(record.userId, record.alias || record.email || record.userId);
  }

  async function searchAccountBans() {
    const res = await apiQueryPost('/api/security/accountBans', {
      currentPage: accountPage.currentPage,
      pageSize: accountPage.pageSize,
      filters: { key: accountFilters.key },
    });
    if (res.status === 200) {
      accountBans.value = res.data.items;
      accountTotal.value = res.data.total;
    }
  }

  function handleAccountSearch() {
    clearTimeout(accountSearchTimer.value);
    accountSearchTimer.value = setTimeout(() => {
      accountPage.currentPage = 1;
      searchAccountBans();
    }, 300);
  }

  watch(
    () => refreshTrigger?.value,
    () => {
      searchAccountBans();
    },
  );

  onMounted(() => {
    searchAccountBans();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
