<template>
  <main class="infra-module-page">
    <div class="infra-module-content">
      <InfraModuleHeader
        :title="t('serverManagement.storagePage.title')"
        :subtitle="t('serverManagement.storagePage.subtitle')"
        :icon-src="icon.infrastructure.storage"
        :cadence="t('serverManagement.storagePage.cadence')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        @refresh="refresh"
      />
      <BLoading v-if="initialLoading" inline :loading="true" :title="t('serverManagement.loading')" />
      <BCard v-else-if="!data" class="infra-state-card" variant="panel">
        <SvgIcon :src="icon.message.warning" size="24" /><div
          ><strong>{{ t('serverManagement.snapshotUnavailable') }}</strong
          ><p>{{ error }}</p></div
        >
        <BButton type="primary" @click="refresh">{{ t('serverManagement.retry') }}</BButton>
      </BCard>
      <template v-else>
        <div v-if="error" class="infra-stale-warning" role="status"
          ><SvgIcon :src="icon.message.warning" size="16" />{{ t('serverManagement.staleSnapshot') }}</div
        >
        <section class="storage-metrics">
          <BCard v-for="item in ioCards" :key="item.key" class="storage-metric-card">
            <span>{{ item.label }}</span
            ><strong>{{ item.value }}</strong
            ><small>{{ item.hint }}</small>
          </BCard>
        </section>
        <BCard :title="t('serverManagement.storagePage.capacityTitle')">
          <div v-if="!data.mounts.length" class="storage-empty">{{ t('serverManagement.storagePage.noMounts') }}</div>
          <div v-for="mount in data.mounts" v-else :key="mount.mountPoint" class="storage-mount">
            <div class="storage-mount__heading"
              ><strong>{{ mount.mountPoint }}</strong
              ><span>{{ formatBytes(mount.usedBytes) }} / {{ formatBytes(mount.totalBytes) }}</span></div
            >
            <div class="storage-track" aria-hidden="true"><i :style="{ width: `${mount.percent || 0}%` }"></i></div>
            <dl>
              <div
                ><dt>{{ t('serverManagement.storagePage.spaceUsage') }}</dt
                ><dd>{{ formatPercent(mount.percent) }}</dd></div
              >
              <div
                ><dt>{{ t('serverManagement.storagePage.freeSpace') }}</dt
                ><dd>{{ formatBytes(mount.freeBytes) }}</dd></div
              >
              <div
                ><dt>{{ t('serverManagement.storagePage.inodeUsage') }}</dt
                ><dd>{{ formatPercent(mount.inodePercent) }}</dd></div
              >
              <div
                ><dt>{{ t('serverManagement.storagePage.freeInodes') }}</dt
                ><dd>{{ formatNumber(mount.freeInodes) }}</dd></div
              >
            </dl>
          </div>
        </BCard>
        <BCard :title="t('serverManagement.storagePage.ioTrendTitle')">
          <DiskIoChart :points="data.history" />
        </BCard>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { getInfraStorage } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import DiskIoChart from './DiskIoChart.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import { formatBytes, formatPercent, formatRate } from './serverManagementFormat';

  const { t, locale } = useI18n();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraStorage, 3_000);
  const ioCards = computed(() => [
    {
      key: 'read',
      label: t('serverManagement.storagePage.read'),
      value: formatRate(data.value?.io?.readBytesPerSecond),
      hint: `${data.value?.io?.readsPerSecond ?? '—'} IOPS`,
    },
    {
      key: 'write',
      label: t('serverManagement.storagePage.write'),
      value: formatRate(data.value?.io?.writeBytesPerSecond),
      hint: `${data.value?.io?.writesPerSecond ?? '—'} IOPS`,
    },
    {
      key: 'busy',
      label: t('serverManagement.storagePage.busy'),
      value: formatPercent(data.value?.io?.busyPercent),
      hint: t('serverManagement.storagePage.busyHint'),
    },
    {
      key: 'mounts',
      label: t('serverManagement.storagePage.mounts'),
      value: String(data.value?.mounts.length || 0),
      hint: t('serverManagement.storagePage.mountsHint'),
    },
  ]);
  function formatNumber(value: unknown) {
    const number = Number(value);
    return value === null || value === undefined || !Number.isFinite(number)
      ? '—'
      : number.toLocaleString(locale.value);
  }
</script>

<style scoped lang="less">
  .infra-module-page {
    height: 100%;
    overflow-y: auto;
    background: var(--background-color);
    color: var(--text-color);
  }
  .infra-module-content {
    width: min(1320px, calc(100% - 48px));
    margin: 0 auto;
    padding: 28px 0 48px;
    display: grid;
    gap: 18px;
  }
  .infra-state-card {
    min-height: 150px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .infra-state-card div {
    flex: 1;
  }
  .infra-state-card p {
    margin: 5px 0 0;
    color: var(--desc-color);
  }
  .infra-stale-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    background: var(--card-background);
  }
  .storage-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .storage-metric-card {
    display: grid;
    gap: 8px;
  }
  .storage-metric-card span,
  .storage-metric-card small {
    color: var(--desc-color);
  }
  .storage-metric-card strong {
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }
  .storage-mount {
    display: grid;
    gap: 12px;
  }
  .storage-mount__heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .storage-mount__heading span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .storage-track {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-divider-color);
  }
  .storage-track i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }
  dl {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
  }
  dl div {
    padding: 4px 16px;
    border-left: 1px solid var(--surface-divider-color);
  }
  dl div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  dt {
    color: var(--desc-color);
    font-size: 12px;
  }
  dd {
    margin: 5px 0 0;
    font-weight: 600;
  }
  .storage-empty {
    min-height: 100px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }
  @media (max-width: 900px) {
    .storage-metrics,
    dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .infra-module-content {
      width: calc(100% - 24px);
      padding: 18px 0 32px;
      gap: 14px;
    }
    .storage-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    dl {
      gap: 10px 0;
    }
    dl div:nth-child(3) {
      padding-left: 0;
      border-left: 0;
    }
  }
</style>
