<template>
  <div>
    <div class="admin-filters security-filters">
      <div class="admin-filters-main security-filters-main">
        <b-input
          v-model:value="ipFilters.key"
          placeholder="搜索IP或封禁原因"
          class="security-search-input"
          @input="handleIpSearch"
        />
        <b-button type="primary" @click="searchIps">搜索</b-button>
      </div>
    </div>
    <div class="admin-table-card">
      <BTable
        :style="{ height: tableScrollY + 'px' }"
        :data="ipList"
        :columns="ipColumns"
        :rowKey="'ip'"
        :row-clickable="true"
        @row-click="onRowClick"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'riskScore'">
            <a-progress
              :percent="record.riskScore || 0"
              size="small"
              :stroke-color="scoreColor(record.riskScore || 0)"
              trail-color="var(--security-progress-trail)"
            />
          </template>
          <template v-else-if="column.key === 'isBanned'">
            <span class="security-pill" :class="record.isBanned ? 'is-high' : 'is-low'">{{
              record.isBanned ? '封禁中' : '正常'
            }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <b-button size="small" @click.stop="openIpAccounts?.(record.ip, record.isBanned)">账户</b-button>
          </template>
        </template>
      </BTable>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { inject, onMounted, reactive, ref, watch } from 'vue';
  import { apiQueryPost } from '@/http/request.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import { OPEN_IP_ACCOUNTS, REFRESH_TRIGGER, ipColumns, scoreColor } from './securityShared';

  const openIpAccounts = inject(OPEN_IP_ACCOUNTS);
  const refreshTrigger = inject(REFRESH_TRIGGER);
  const { tableScrollY } = useTableScrollY({ reservedHeight: 302 });

  const ipList = ref<any[]>([]);
  const ipTotal = ref(0);
  const ipPage = reactive({ currentPage: 1, pageSize: 100 });
  const ipFilters = reactive<any>({ key: '' });
  const ipSearchTimer = ref<any>(null);

  function onRowClick(record: any) {
    openIpAccounts?.(record.ip, record.isBanned);
  }

  async function searchIps() {
    const res = await apiQueryPost('/api/security/ipReputation', {
      currentPage: ipPage.currentPage,
      pageSize: ipPage.pageSize,
      filters: { key: ipFilters.key },
    });
    if (res.status === 200) {
      ipList.value = res.data.items;
      ipTotal.value = res.data.total;
    }
  }

  function handleIpSearch() {
    clearTimeout(ipSearchTimer.value);
    ipSearchTimer.value = setTimeout(() => {
      ipPage.currentPage = 1;
      searchIps();
    }, 300);
  }

  watch(
    () => refreshTrigger?.value,
    () => {
      searchIps();
    },
  );

  onMounted(() => {
    searchIps();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
