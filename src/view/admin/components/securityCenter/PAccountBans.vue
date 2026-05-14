<template>
  <CommonContainer title="账号封禁" @backClick="router.push('/securityCenterMobile')">
    <div>
      <div class="admin-filters security-filters">
        <div class="admin-filters-main security-filters-main">
          <b-input
            v-model:value="accountFilters.key"
            placeholder="搜索账号/邮箱"
            class="security-search-input"
            @input="handleAccountSearch"
          />
          <b-button type="primary" @click="searchAccountBans">搜索</b-button>
        </div>
      </div>
      <div class="admin-table-card">
        <BTable
          :data="accountBans"
          :columns="mobileAccountColumns"
          :rowKey="'userId'"
          @row-click="onRowClick"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'account'">
              <div class="account-cell">
                <strong>{{ record.alias || record.email || record.userId }}</strong>
                <span>{{ record.email || record.userId }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'action'">
              <b-button size="small" @click.stop="handleUnbanAccount(record)">解封账号</b-button>
            </template>
          </template>
        </BTable>
      </div>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';

const router = useRouter();

const mobileAccountColumns = [
  { title: '账号', key: 'account' },
  { title: '封禁原因', key: 'banReason' },
  { title: '封禁时间', key: 'bannedAt' },
  { title: '操作', key: 'action' },
];

const accountBans = ref<any[]>([]);
const accountTotal = ref(0);
const accountPage = reactive({ currentPage: 1, pageSize: 100 });
const accountFilters = reactive<any>({ key: '' });
const accountSearchTimer = ref<any>(null);

function onRowClick(record: any) {
  const query = new URLSearchParams({
    userId: record.userId,
    userLabel: record.alias || record.email || record.userId,
  }).toString();
  router.push(`/securityEvents?${query}`);
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

async function handleUnbanAccount(account: any) {
  const userId = typeof account === 'string' ? account : account?.userId;
  if (!userId) return;
  Modal.confirm({
    title: '解封账号',
    content: `确认解封账号【${account.alias || userId}】吗？`,
    okText: '确认解封',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/accountUnban', { userId });
      if (res.status === 200) {
        message.success('已解封账号');
        searchAccountBans();
      }
    },
  });
}

onMounted(() => {
  searchAccountBans();
});
</script>

<style lang="less" scoped>
@import './securityCenter.less';
</style>
