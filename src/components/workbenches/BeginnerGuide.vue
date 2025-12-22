<template>
  <div class="guide-container-card">
    欢迎使用智能云平台轻笺
    <b-button type="primary" @click="$router.push('/help')" v-click-log="OPERATION_LOG_MAP.workbenches.guide">新手指引</b-button>
  </div>
</template>

<script lang="ts" setup>
import {OPERATION_LOG_MAP} from "@/config/logMap.ts";
</script>

<style lang="less" scoped>
  .guide-container-card {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
  }
</style>
