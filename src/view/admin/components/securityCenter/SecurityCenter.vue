<template>
  <div class="admin-panel-container">
    <section class="admin-panel security-panel">
      <header class="admin-header security-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Security</p>
          <h2 class="admin-title">安全中心</h2>
          <p class="admin-subtitle">查看攻击态势、拦截记录、IP风险和处置状态</p>
        </div>
      </header>

      <b-tabs :options="securityTabs" :activeTab="activeKey" @change="onTabChange" class="security-tab-bar" />

      <div class="security-tab-content">
        <RouterView />
      </div>

      <EventDetailDrawer
        v-if="eventDetailVisible"
        :visible="eventDetailVisible"
        :event-id="currentEventId"
        @close="eventDetailVisible = false"
        @saved="onEventSaved"
      />
      <IpAccountDrawer
        v-if="ipAccountVisible"
        :visible="ipAccountVisible"
        :ip="currentIp"
        :ip-banned="currentIpBanned"
        @close="ipAccountVisible = false"
      />
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, provide, ref } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import {
    securityTabs,
    getRouteTab,
    normalizeAccount,
    OPEN_EVENT_DETAIL,
    OPEN_IP_ACCOUNTS,
    NAVIGATE_TO_USER_EVENTS,
    REFRESH_TRIGGER,
    BAN_IP,
    UNBAN_IP,
    BAN_ACCOUNT,
    UNBAN_ACCOUNT,
  } from './securityShared';

  const EventDetailDrawer = defineAsyncComponent(() => import('./EventDetailDrawer.vue'));
  const IpAccountDrawer = defineAsyncComponent(() => import('./IpAccountDrawer.vue'));

  const route = useRoute();
  const router = useRouter();

  const activeKey = computed(() => getRouteTab(route.name));

  function onTabChange(key: string) {
    const tab = securityTabs.find((t) => t.key === key);
    if (tab) {
      router.push({ name: tab.routeName });
    }
  }

  const refreshCounter = ref(0);
  provide(REFRESH_TRIGGER, refreshCounter);

  function triggerRefresh() {
    refreshCounter.value++;
  }

  function isWhitelistConflict(res: any) {
    return res?.status === 409 && res?.data?.whitelistConflict;
  }

  function confirmWhitelistForce(content: string, onOk: () => Promise<void>) {
    Alert.alert({
      title: '移出白名单并封禁',
      content,
      okText: '移出白名单并封禁',
      cancelText: '取消',
      onOk,
    });
  }

  const eventDetailVisible = ref(false);
  const currentEventId = ref<string | null>(null);

  function openEventDetail(eventId: string) {
    currentEventId.value = eventId;
    eventDetailVisible.value = true;
  }

  function onEventSaved() {
    triggerRefresh();
  }

  provide(OPEN_EVENT_DETAIL, openEventDetail);

  const ipAccountVisible = ref(false);
  const currentIp = ref('');
  const currentIpBanned = ref(false);

  function openIpAccounts(ip: string, isBanned?: boolean) {
    currentIp.value = ip;
    currentIpBanned.value = isBanned || false;
    ipAccountVisible.value = true;
  }

  provide(OPEN_IP_ACCOUNTS, openIpAccounts);

  function navigateToUserEvents(userId: string, userLabel: string) {
    router.push({ name: 'securityCenterEvents', query: { userId, userLabel } });
  }

  provide(NAVIGATE_TO_USER_EVENTS, navigateToUserEvents);

  async function banIp(ip: string) {
    if (!ip) return;
    const submit = async (force = false) => {
      const res = await apiBasePost('/api/security/ipBan', {
        ip,
        minutes: 60,
        reason: '管理员在安全中心手动封禁',
        force,
      });
      if (res.status === 200) {
        message.success('已封禁IP');
        currentIpBanned.value = true;
        triggerRefresh();
        return;
      }
      if (isWhitelistConflict(res)) {
        confirmWhitelistForce(`确认将 ${ip} 移出白名单并封禁 1 小时？`, () => submit(true));
      }
    };
    Alert.alert({
      title: '封禁IP',
      content: `确认封禁 ${ip} 1小时？封禁期内该IP的普通业务访问会被拦截。`,
      okText: '确认封禁',
      cancelText: '取消',
      onOk: () => submit(),
    });
  }

  async function unbanIp(ip: string) {
    if (!ip) return;
    Alert.alert({
      title: '解封IP',
      content: `确认解封 ${ip}？`,
      okText: '确认解封',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiBasePost('/api/security/ipUnban', { ip });
        if (res.status === 200) {
          message.success('已解封IP');
          currentIpBanned.value = false;
          triggerRefresh();
        }
      },
    });
  }

  provide(BAN_IP, banIp);
  provide(UNBAN_IP, unbanIp);

  async function banAccount(account: any) {
    account = normalizeAccount(account);
    if (!account?.userId) return;
    const submit = async (force = false) => {
      const res = await apiBasePost('/api/security/accountBan', {
        userId: account.userId,
        reason: '管理员在安全中心手动封禁',
        force,
      });
      if (res.status === 200) {
        message.success('已封禁账号');
        eventDetailVisible.value = false;
        triggerRefresh();
        return;
      }
      if (isWhitelistConflict(res)) {
        confirmWhitelistForce(`确认将账号【${account.alias || account.userId}】移出白名单并封禁？`, () => submit(true));
      }
    };
    Alert.alert({
      title: '封禁账号',
      content: `确认封禁账号【${account.alias || account.userId}】吗？该账号会退出登录并无法访问业务接口。`,
      okText: '确认封禁',
      cancelText: '取消',
      onOk: () => submit(),
    });
  }

  async function unbanAccount(account: any) {
    account = normalizeAccount(account);
    if (!account?.userId) return;
    Alert.alert({
      title: '解封账号',
      content: `确认解封账号【${account.alias || account.userId}】吗？`,
      okText: '确认解封',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiBasePost('/api/security/accountUnban', { userId: account.userId });
        if (res.status === 200) {
          message.success('已解封账号');
          triggerRefresh();
        }
      },
    });
  }

  provide(BAN_ACCOUNT, banAccount);
  provide(UNBAN_ACCOUNT, unbanAccount);
</script>

<style lang="less" scoped>
@import './securityCenter.less';

.security-tab-bar {
  padding-top: 8px;
  margin-bottom: 16px;
}

.security-tab-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>

