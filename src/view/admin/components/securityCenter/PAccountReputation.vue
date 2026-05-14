<template>
  <CommonContainer title="账号画像" @backClick="router.push('/securityCenterMobile')">
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
        <BTable
          :data="accountRepList"
          :columns="mobileAccountRepColumns"
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
            <template v-else-if="column.key === 'riskScore'">
              <a-progress
                :title="record.riskScore || 0"
                :percent="record.riskScore || 0"
                size="small"
                :stroke-color="scoreColor(record.riskScore || 0)"
                trail-color="var(--security-progress-trail)"
                :show-info="false"
              />
            </template>
            <template v-else-if="column.key === 'delFlag'">
              <span class="security-pill" :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{
                Number(record.delFlag) === 1 ? '已封禁' : '正常'
              }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <b-button v-if="Number(record.delFlag) !== 1" size="small" @click.stop="handleBanAccount(record)"
                >封禁账号</b-button
              >
              <b-button v-else size="small" @click.stop="handleUnbanAccount(record)">解封账号</b-button>
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
import { scoreColor } from './securityShared';

const router = useRouter();

const mobileAccountRepColumns = [
  { title: '账号', key: 'account' },
  { title: '风险分', key: 'riskScore' },
  { title: '状态', key: 'delFlag' },
  { title: '操作', key: 'action' },
];

const accountRepList = ref<any[]>([]);
const acctRepTotal = ref(0);
const acctRepPage = reactive({ currentPage: 1, pageSize: 100 });
const acctRepFilters = reactive<any>({ key: '' });
const acctRepSearchTimer = ref<any>(null);

function onRowClick(record: any) {
  const query = new URLSearchParams({
    userId: record.userId,
    userLabel: record.alias || record.email || record.userId,
  }).toString();
  router.push(`/securityEvents?${query}`);
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

async function handleBanAccount(account: any) {
  const userId = typeof account === 'string' ? account : account?.userId;
  if (!userId) return;
  Modal.confirm({
    title: '封禁账号',
    content: `确认封禁账号【${account.alias || userId}】吗？`,
    okText: '确认封禁',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/accountBan', {
        userId,
        reason: '管理员在安全中心手动封禁',
      });
      if (res.status === 200) {
        message.success('已封禁账号');
        searchAccountReputation();
      }
    },
  });
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
        searchAccountReputation();
      }
    },
  });
}

onMounted(() => {
  searchAccountReputation();
});
</script>

<style lang="less" scoped>
@import './securityCenter.less';
</style>
