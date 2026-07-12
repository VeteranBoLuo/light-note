<template>
  <BModal v-model:visible="visible" title="日志白名单(自己人设备免记录)" :mask-closable="false" @ok="visible = false">
    <div class="log-exclude">
      <p class="le-desc">
        加入白名单的浏览器指纹,其 API 日志 / 操作日志 / 转化漏斗都不再记录。用来把你自己测试用的设备排除掉,换电脑/浏览器时在对应设备上再点一次「加入」即可。
      </p>

      <div class="le-current">
        <div class="le-current-info">
          <span class="le-label">当前浏览器指纹</span>
          <code class="le-fp">{{ currentFp || '(未生成)' }}</code>
        </div>
        <b-button v-if="currentFp" type="primary" size="small" :disabled="inList || adding" @click="addCurrent">
          {{ inList ? '本设备已在白名单' : '加入白名单' }}
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
          :class="{ 'is-current': item.fingerprint === currentFp }"
        >
          <div class="le-item-main">
            <code class="le-fp">{{ item.fingerprint }}</code>
            <span v-if="item.fingerprint === currentFp" class="le-badge">本设备</span>
            <span v-if="item.note" class="le-note">{{ item.note }}</span>
          </div>
          <span class="le-del dom-hover" @click="remove(item.fingerprint)">删除</span>
        </div>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { getLogExclude, addLogExclude, removeLogExclude } from '@/api/commonApi';

  const visible = defineModel<boolean>('visible', { default: false });

  interface ExcludeItem {
    fingerprint: string;
    note?: string;
    create_time?: string;
  }

  const list = ref<ExcludeItem[]>([]);
  const loading = ref(false);
  const adding = ref(false);
  const currentFp = ref<string>((window as any).fingerprint || '');

  const inList = computed(() => list.value.some((i) => i.fingerprint === currentFp.value));

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
    if (!currentFp.value || inList.value) return;
    adding.value = true;
    try {
      const res = await addLogExclude(currentFp.value, '本设备');
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

  watch(visible, (v) => {
    if (v) {
      currentFp.value = (window as any).fingerprint || '';
      load();
    }
  });
</script>

<style scoped lang="less">
  .log-exclude {
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--text-color);
  }
  .le-desc {
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
    padding: 12px;
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
    padding: 8px 10px;
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
