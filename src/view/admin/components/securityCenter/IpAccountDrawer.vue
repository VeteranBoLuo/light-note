<template>
  <a-drawer :open="visible" title="IP关联账号" placement="right" width="1000" @close="$emit('close')">
    <div class="security-detail">
      <section>
        <h3>{{ ip }} 使用过的账号</h3>
        <div class="ip-account-actions">
          <span>共 {{ ipAccounts.length }} 个账号</span>
          <div class="table-actions">
            <b-button v-if="ipBanned" @click="unbanIp?.(ip)">解封此IP</b-button>
            <b-button v-else @click="banIp?.(ip)">封禁此IP 1小时</b-button>
            <b-button :disabled="selectedIpAccountIds.length === 0" @click="banSelectedIpAccounts"
              >封禁选中账号</b-button
            >
          </div>
        </div>
        <b-loading :loading="ipAccountLoading">
          <BTable
            :data="ipAccounts"
            :columns="ipAccountColumns"
            :rowKey="'userId'"
            :selectable="true"
            :selectedRows="selectedIpAccountIds"
            :row-clickable="true"
            @selectionChange="onIpAccountSelect"
            @row-click="onRowClick"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'account'">
                <div class="account-cell" :title="record.alias || record.email || record.userId">
                  <strong>{{ record.alias || record.email || record.userId }}</strong>
                  <span>{{ record.email || record.userId }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'delFlag'">
                <span :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{
                  Number(record.delFlag) === 1 ? '已封禁' : '正常'
                }}</span>
              </template>
              <template v-else-if="column.key === 'lastSeenAt'">
                <a-tooltip :title="record.lastSeenAt">
                  <span class="ellipsis-cell">{{ record.lastSeenAt || '-' }}</span>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'action'">
                <b-button v-if="Number(record.delFlag) !== 1" size="small" @click.stop="banAccount?.(record)"
                  >封禁账号</b-button
                >
                <b-button v-else size="small" @click.stop="unbanAccount?.(record)">解封账号</b-button>
              </template>
            </template>
          </BTable>
        </b-loading>
      </section>
    </div>
  </a-drawer>
</template>

<script lang="ts" setup>
  import { inject, ref, watch } from 'vue';
  import { message } from 'ant-design-vue';
  import { apiBasePost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import {
    BAN_IP,
    UNBAN_IP,
    BAN_ACCOUNT,
    UNBAN_ACCOUNT,
    NAVIGATE_TO_USER_EVENTS,
    ipAccountColumns,
  } from './securityShared';

  const props = defineProps<{ visible: boolean; ip: string; ipBanned: boolean }>();
  const emit = defineEmits<{
    close: [];
  }>();

  const banIp = inject(BAN_IP);
  const unbanIp = inject(UNBAN_IP);
  const banAccount = inject(BAN_ACCOUNT);
  const unbanAccount = inject(UNBAN_ACCOUNT);
  const navigateToUserEvents = inject(NAVIGATE_TO_USER_EVENTS);

  const ipAccounts = ref<any[]>([]);
  const ipAccountLoading = ref(false);
  const selectedIpAccountIds = ref<string[]>([]);

  function onIpAccountSelect(keys: string[]) {
    selectedIpAccountIds.value = keys;
  }

  function onRowClick(record: any) {
    navigateToUserEvents?.(record.userId, record.alias || record.email || record.userId);
    emit('close');
  }

  function isWhitelistConflict(res: any) {
    return res?.status === 409 && res?.data?.whitelistConflict;
  }

  async function banAccounts(userIds: string[], force = false) {
    const results = await Promise.all(
      userIds.map((userId) =>
        apiBasePost('/api/security/accountBan', {
          userId,
          reason: `管理员按IP ${props.ip} 批量封禁`,
          force,
        }),
      ),
    );
    const conflictIds = userIds.filter((_, index) => isWhitelistConflict(results[index]));
    const successCount = results.filter((item) => item.status === 200).length;
    if (successCount > 0) {
      message.success(`已封禁 ${successCount} 个账号`);
      selectedIpAccountIds.value = [];
      loadIpAccounts();
    }
    if (!force && conflictIds.length > 0) {
      Alert.alert({
        title: '移出白名单并封禁',
        content: `有 ${conflictIds.length} 个账号当前在白名单中，确认后会先移出白名单并执行封禁。`,
        okText: '移出白名单并封禁',
        cancelText: '取消',
        onOk: async () => {
          await banAccounts(conflictIds, true);
        },
      });
    }
  }

  async function loadIpAccounts() {
    if (!props.visible || !props.ip) return;
    ipAccountLoading.value = true;
    selectedIpAccountIds.value = [];
    const res = await apiBasePost('/api/security/ipAccounts', { ip: props.ip }).finally(() => {
      ipAccountLoading.value = false;
    });
    if (res.status === 200) {
      ipAccounts.value = res.data.items;
    }
  }

  function banSelectedIpAccounts() {
    const ids = selectedIpAccountIds.value.filter((id) => {
      const item = ipAccounts.value.find((account) => account.userId === id);
      return item && Number(item.delFlag) !== 1;
    });
    if (ids.length === 0) {
      message.warning('请选择未封禁账号');
      return;
    }
    Alert.alert({
      title: '批量封禁账号',
      content: `确认封禁选中的 ${ids.length} 个账号？这些账号会退出登录并无法访问业务接口。`,
      okText: '确认封禁',
      cancelText: '取消',
      onOk: async () => {
        await banAccounts(ids);
      },
    });
  }

  watch(
    () => props.visible,
    (v) => {
      if (v && props.ip) {
        loadIpAccounts();
      }
    },
  );
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>

<style lang="less">
  .ant-drawer-content,
  .ant-drawer-header {
    background: var(--background-color) !important;
    color: var(--text-color) !important;
  }

  .ant-drawer-title,
  .ant-drawer-close {
    color: var(--text-color) !important;
  }

  .ant-drawer-header {
    border-bottom-color: var(--card-border-color) !important;
  }

  .ant-drawer-body {
    background: var(--background-color) !important;
  }
</style>
