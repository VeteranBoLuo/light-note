<template>
  <CommonContainer title="日志白名单" @backClick="router.push('/admin')">
    <div class="log-exclude">
      <header class="le-header">
        <!-- 移动端标题由 CommonContainer 顶栏提供,这里隐藏避免重复;PC 端无顶栏,保留标题 -->
        <h2 v-if="!bookmark.isMobile" class="le-title">日志白名单</h2>
        <p class="le-subtitle">
          加入白名单后，系统会自动绑定本浏览器的稳定设备标识，过滤 API 日志、操作日志和转化漏斗；无需单独升级，浏览器升级或屏幕变化时也不容易失效。
        </p>
      </header>

      <div class="le-current">
        <div class="le-current-info">
          <span class="le-label">当前浏览器指纹</span>
          <code class="le-fp">{{ currentFp || '(未生成)' }}</code>
          <span class="le-label">稳定设备标识：{{ currentDeviceId || '(存储不可用)' }}</span>
        </div>
        <b-button v-if="currentFp" type="primary" size="small" :disabled="currentInList || adding" @click="addCurrent">
          {{ currentInList ? '本设备已在白名单' : '加入白名单' }}
        </b-button>
      </div>

      <div class="le-list">
        <div class="le-list-head">
          <span>已加入设备({{ list.length }})</span>
          <b-button size="small" :disabled="loading" @click="load">刷新</b-button>
        </div>
        <div v-if="!list.length" class="le-empty">暂无</div>
        <div
          v-for="item in list"
          :key="item.fingerprint"
          class="le-item"
          :class="{ 'is-current': isCurrent(item) }"
        >
          <div class="le-item-main">
            <code class="le-fp">{{ item.fingerprint }}</code>
            <span v-if="isCurrent(item)" class="le-badge">本设备</span>
            <!-- 是否「本设备」由上方 badge 按当前浏览器指纹动态判断;历史数据里 note 被写死成「本设备」是脏数据,过滤掉避免每行都显示 -->
            <span v-if="item.note && item.note !== '本设备'" class="le-note">{{ item.note }}</span>
          </div>
          <span class="le-del dom-hover" @click="remove(item.fingerprint)">删除</span>
        </div>
      </div>
    </div>
  </CommonContainer>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { getLogExclude, addLogExclude, removeLogExclude } from '@/api/commonApi';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { bookmarkStore } from '@/store';
  import router from '@/router';
  import { getLogDeviceId, getLogFingerprint } from '@/utils/common';

  interface ExcludeItem {
    fingerprint: string;
    deviceId?: string;
    deviceIds?: string[];
    note?: string;
    create_time?: string;
  }

  const bookmark = bookmarkStore();
  const list = ref<ExcludeItem[]>([]);
  const loading = ref(false);
  const adding = ref(false);
  const currentFp = ref(getLogFingerprint());
  const currentDeviceId = ref(getLogDeviceId());

  const isCurrent = (item: ExcludeItem) =>
    Boolean(
      (currentDeviceId.value &&
        (item.deviceId === currentDeviceId.value || item.deviceIds?.includes(currentDeviceId.value))) ||
      item.fingerprint === currentFp.value,
    );
  const currentInList = computed(() => list.value.some(isCurrent));

  async function load() {
    loading.value = true;
    try {
      const res = await getLogExclude();
      if (res.status === 200) list.value = res.data || [];
    } finally {
      loading.value = false;
    }
  }

  async function addCurrent() {
    if (!currentFp.value || currentInList.value) return;
    adding.value = true;
    try {
      // 不传 note:是否本设备由列表项 badge 按 fingerprint === currentFp 动态判断,固化进 note 会导致换设备后仍显示「本设备」
      const res = await addLogExclude(currentFp.value, currentDeviceId.value);
      if (res.status === 200) {
        message.success('已加入白名单,本设备的日志/漏斗将不再记录');
        await load();
      }
    } finally {
      adding.value = false;
    }
  }

  async function remove(fp: string) {
    const res = await removeLogExclude(fp);
    if (res.status === 200) {
      message.success('已移除');
      await load();
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .log-exclude {
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text-color);
  }
  .le-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .le-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }
  .le-subtitle {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .le-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    background: var(--workbench-subcard-bg);
  }
  .le-current-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .le-label {
    font-size: 12px;
    color: var(--desc-color);
  }
  .le-fp {
    font-family: monospace;
    font-size: 13px;
    word-break: break-all;
    color: var(--text-color);
  }
  .le-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .le-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: var(--desc-color);
  }
  .le-empty {
    font-size: 12px;
    color: var(--desc-color);
    padding: 8px 0;
  }
  .le-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--card-border-color) 14%, transparent);
  }
  .le-item.is-current {
    border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
  }
  .le-item-main {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .le-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
    color: var(--primary-color);
  }
  .le-note {
    font-size: 12px;
    color: var(--desc-color);
  }
  .le-del {
    flex-shrink: 0;
    font-size: 12px;
    color: #ec4899;
    cursor: pointer;
  }
</style>
