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
          <BButton
            type="text"
            class="le-del dom-hover"
            :disabled="removing === item.fingerprint"
            :aria-label="`移除白名单设备 ${item.fingerprint}`"
            @click="remove(item.fingerprint)"
          >
            {{ removing === item.fingerprint ? '移除中…' : '删除' }}
          </BButton>
        </div>
      </div>
    </div>
  </CommonContainer>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { getLogExclude, addLogExclude, removeLogExclude } from '@/api/commonApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
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
  const removing = ref('');
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

  async function remove(fp: string, confirmed = false) {
    if (removing.value) return;
    if (!confirmed) {
      // 移除后该设备的日志会重新被记录，属于会改变系统行为的操作，先确认
      Alert.alert({
        title: '确认移除',
        content: `移除后该设备的 API 日志、操作日志与转化漏斗将重新被记录：\n${fp}`,
        onOk: () => remove(fp, true),
      });
      return;
    }
    removing.value = fp;
    try {
      const res = await removeLogExclude(fp);
      if (res.status === 200) {
        message.success('已移除');
        await load();
      }
    } finally {
      removing.value = '';
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  /* 只引 mixin 文件：它零 CSS 产物。引 admin-manage.less 会把它的 180+ 行实类
     全量复制进本页 scoped 产物。 */
  @import '@/assets/css/admin-mixins.less';
  .log-exclude {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
    color: var(--text-color);
  }
  .le-header {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
  }
  .le-title {
    margin: 0;
    font-size: var(--ui-font-18, 18px);
    font-weight: 700;
  }
  .le-subtitle {
    margin: 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    color: var(--desc-color);
  }
  .le-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    background: var(--workbench-subcard-bg);
  }
  .le-current-info {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
  }
  .le-label {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .le-fp {
    font-family: monospace;
    font-size: var(--ui-font-13, 13px);
    word-break: break-all;
    color: var(--text-color);
  }
  .le-list {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
  }
  .le-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
  }
  .le-empty {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    padding: var(--ui-space-8, 8px) 0;
  }
  .le-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border-radius: 8px;
    background: color-mix(in srgb, var(--card-border-color) 14%, transparent);
  }
  .le-item.is-current {
    border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
  }
  .le-item-main {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
    min-width: 0;
  }
  .le-badge {
    font-size: var(--ui-font-11, 11px);
    padding: var(--ui-space-1, 1px) var(--ui-space-6, 6px);
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
    color: var(--primary-color);
  }
  .le-note {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  /* 保留原有文字操作尺寸，按钮交互复用 BButton。 */
  .le-del.b_btn {
    height: auto;
    display: inline-block;
    border-radius: 0;
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: var(--ui-font-12, 12px);
    color: var(--danger-color);
    cursor: pointer;
  }

  .le-del:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .le-del {
    .admin-focus-ring(4px);
  }
</style>
