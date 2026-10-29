<template><InfraTimeSeriesChart :points="points" /></template>
<script setup lang="ts">
  import type { HostAgentMetricPoint } from '@lightnote/shared/host-agent-protocol';
  import InfraTimeSeriesChart from './InfraTimeSeriesChart.vue';
  defineProps<{ points: HostAgentMetricPoint[] }>();
</script>
