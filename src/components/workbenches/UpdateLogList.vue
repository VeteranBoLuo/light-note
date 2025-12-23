<template>
  <WorkbenchesCard title="更新日志">
    <template #rightHeader>
      <a class="dom-hover" @click="$router.push('/updateLogs')" v-click-log="OPERATION_LOG_MAP.workbenches.moreLog"
        >查看更多</a
      >
    </template>
    <div class="logList">
      <div
        v-for="log in [...updateOptions].reverse().slice(0, 10)"
        class="log-item dom-hover"
        @click="viewLogDetail(log)"
        v-click-log="OPERATION_LOG_MAP.workbenches.LogDetail"
      >
        <span class="label">{{ log.label }}</span>
        <span class="time">{{ log.time }}</span>
      </div>
    </div>
    <b-modal title="更新详情" v-model:visible="detailVisible" v-if="detailVisible" :show-footer="false">
      <div style="max-width: 800px; min-width: 500px">
        <div>{{ logObj.label }}</div>
        <div>
          <ul>
            <li v-for="log in logObj.list ?? []">
              {{ log }}
            </li>
          </ul>
        </div>
        <div>{{ logObj.time }}</div>
      </div>
    </b-modal>
  </WorkbenchesCard>
</template>

<script lang="ts" setup>
  import WorkbenchesCard from '@/components/workbenches/WorkbenchesCard.vue';
  import { updateOptions } from '@/config/jsonCfg.ts';
  import { computed, ref } from 'vue';
  import { cloneDeep } from 'lodash-es';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  const logObj = ref();
  const detailVisible = ref(false);
  function viewLogDetail(log) {
    logObj.value = cloneDeep(log);
    detailVisible.value = true;
  }
</script>

<style lang="less" scoped>
  .logList {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .log-item {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .time {
    color: #cccccc;
  }
</style>
