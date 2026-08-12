<template>
  <BPopover
    v-model:open="detailsOpen"
    trigger="click"
    placement="bottom-right"
    overlay-class-name="cloud-storage-popover"
  >
    <BButton
      class="storage-usage"
      :class="statusClass"
      :aria-label="t('cloudSpace.storageDetailsAria', { percent: usagePercent })"
    >
      <div class="storage-head">
        <span class="storage-title">{{ t('cloudSpace.hasUsedSpace') }}</span>
        <div class="storage-meta">
          <span class="storage-value">{{ formattedUsed }} / {{ formattedMax }}</span>
          <span class="storage-percent">{{ usagePercent }}%</span>
        </div>
      </div>
      <div
        class="storage-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(usagePercent)"
      >
        <div class="storage-bar-fill" :style="{ width: `${usagePercent}%` }"></div>
      </div>
      <div v-if="statusLabel" class="storage-status" role="status">
        <SvgIcon :src="icon.message.warning" size="12" aria-hidden="true" />
        {{ statusLabel }}
      </div>
    </BButton>

    <template #content>
      <section class="storage-detail-panel" :aria-label="t('cloudSpace.storageDetailsTitle')">
        <header class="storage-detail-header">
          <div class="storage-detail-icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.storage" size="19" />
          </div>
          <div>
            <h3>{{ t('cloudSpace.storageDetailsTitle') }}</h3>
            <p :class="{ 'is-shortfall': quotaShortfallMb > 0 }">{{ detailStatusText }}</p>
          </div>
        </header>

        <div class="storage-detail-summary">
          <div>
            <span>{{ t('cloudSpace.storageUsed') }}</span>
            <strong>{{ formattedUsed }}</strong>
          </div>
          <div>
            <span>{{ t('cloudSpace.storageRemaining') }}</span>
            <strong>{{ formattedRemaining }}</strong>
          </div>
          <div>
            <span>{{ t('cloudSpace.storageTotal') }}</span>
            <strong>{{ formattedMax }}</strong>
          </div>
        </div>

        <div class="storage-shared-note">
          <SvgIcon :src="icon.common.info" size="14" aria-hidden="true" />
          <span>{{ t('cloudSpace.storageSharedHint') }}</span>
        </div>

        <div class="storage-location-breakdown">
          <div>
            <span>{{ t('cloudSpace.storageActiveFiles') }}</span>
            <strong>{{ formattedActiveSpace }}</strong>
          </div>
          <div>
            <span>{{ t('cloudSpace.storageTrashFiles') }}</span>
            <strong>{{ formattedTrashSpace }}</strong>
          </div>
        </div>

        <BLoading v-if="growthLoading && !growth" inline loading :title="t('cloudSpace.storageLoading')" />
        <div v-else-if="growth" class="storage-detail-breakdown">
          <div>
            <span>{{ t('cloudSpace.storageLevelCapacity', { level: growth.level }) }}</span>
            <strong>{{ formattedBaseCapacity }}</strong>
          </div>
          <div>
            <span>{{ t('cloudSpace.storagePermanentBonus') }}</span>
            <strong class="is-bonus">+{{ formattedBonusCapacity }}</strong>
          </div>
        </div>

        <div class="storage-detail-actions">
          <BButton class="storage-option" @click="goToGrowthTasks">
            <span class="storage-option-icon is-level" aria-hidden="true">
              <SvgIcon :src="icon.growth.level" size="17" />
            </span>
            <span class="storage-option-copy">
              <strong>{{ t('cloudSpace.storageUpgradeTitle') }}</strong>
              <small>{{ upgradeDescription }}</small>
            </span>
            <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
          </BButton>

          <BButton class="storage-option" @click="goToStorageShop">
            <span class="storage-option-icon is-shop" aria-hidden="true">
              <SvgIcon :src="icon.growth.coin" size="17" />
            </span>
            <span class="storage-option-copy">
              <strong>{{ t('cloudSpace.storageExchangeTitle') }}</strong>
              <small>{{ t('cloudSpace.storageExchangeDescription') }}</small>
            </span>
            <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
          </BButton>
        </div>

        <BButton class="storage-cleanup" @click="goToTrash">
          {{ t('cloudSpace.storageCleanup') }}
          <SvgIcon :src="icon.arrow_right" size="12" aria-hidden="true" />
        </BButton>
      </section>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { cloudSpaceStore } from '@/store';
  import { useGrowth } from '@/composables/useGrowth';
  import { formatStorageSize } from '@/utils/common';
  import {
    getCloudStorageRemaining,
    getCloudStorageStatus,
    getCloudStorageUsageRatio,
    getLevelBaseCapacity,
    getNextLevelCapacityGain,
  } from './cloudStorageCapacity';
  import icon from '@/config/icon';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  const cloud = cloudSpaceStore();
  const router = useRouter();
  const { t } = useI18n();
  const { growth, ranks, loading: growthLoading, load, loadRanks } = useGrowth();
  const detailsOpen = ref(false);
  const quotaShortfallMb = ref(0);

  const usageRatio = computed(() => getCloudStorageUsageRatio(cloud.usedSpace, cloud.maxSpace));

  const usagePercent = computed(() => Number((usageRatio.value * 100).toFixed(1)));
  const storageStatus = computed(() => getCloudStorageStatus(usageRatio.value));
  const statusClass = computed(() => {
    if (storageStatus.value === 'low') return 'progress-red';
    if (storageStatus.value === 'filling') return 'progress-yellow';
    return 'progress-normal';
  });
  const statusLabel = computed(() => {
    if (storageStatus.value === 'low') return t('cloudSpace.storageStatusLow');
    if (storageStatus.value === 'filling') return t('cloudSpace.storageStatusFilling');
    return '';
  });
  const detailStatusText = computed(() => {
    if (quotaShortfallMb.value > 0) {
      return t('cloudSpace.storageUploadShortfall', { capacity: formatStorageSize(quotaShortfallMb.value) });
    }
    return statusLabel.value ? statusLabel.value : t('cloudSpace.storageStatusAvailable');
  });

  const formattedUsed = computed(() => formatStorageSize(cloud.usedSpace));
  const formattedMax = computed(() => formatStorageSize(cloud.maxSpace));
  const formattedActiveSpace = computed(() => formatStorageSize(cloud.activeSpace));
  const formattedTrashSpace = computed(() => formatStorageSize(cloud.trashSpace));
  const formattedRemaining = computed(() =>
    formatStorageSize(getCloudStorageRemaining(cloud.usedSpace, cloud.maxSpace)),
  );
  const baseCapacity = computed(() =>
    getLevelBaseCapacity(Number(growth.value?.spaceMb || 0), Number(growth.value?.spaceBonusMb || 0)),
  );
  const formattedBaseCapacity = computed(() => formatStorageSize(baseCapacity.value));
  const formattedBonusCapacity = computed(() => formatStorageSize(Number(growth.value?.spaceBonusMb || 0)));
  const nextRank = computed(() => ranks.value.find((rank) => rank.level === Number(growth.value?.level || 0) + 1));
  const nextLevelCapacityGain = computed(() => getNextLevelCapacityGain(baseCapacity.value, nextRank.value?.spaceMb));
  const upgradeDescription = computed(() => {
    if (!growth.value) return t('cloudSpace.storageUpgradeDescription');
    if (growth.value.isMax || !nextRank.value) return t('cloudSpace.storageUpgradeMaxLevel');
    return t('cloudSpace.storageUpgradeGain', {
      level: nextRank.value.level,
      capacity: formatStorageSize(nextLevelCapacityGain.value),
      exp: Number(growth.value.expToNext || 0).toLocaleString(),
    });
  });

  watch(detailsOpen, (open) => {
    if (!open) {
      quotaShortfallMb.value = 0;
      return;
    }
    void Promise.all([load(), loadRanks()]);
  });

  function openDetails(shortfallMb = 0) {
    quotaShortfallMb.value = Math.max(0, Number(shortfallMb) || 0);
    detailsOpen.value = true;
  }

  function closeAndNavigate(to: Parameters<typeof router.push>[0]) {
    detailsOpen.value = false;
    void router.push(to);
  }

  function goToGrowthTasks() {
    closeAndNavigate({ path: '/growth', query: { section: 'tasks' } });
  }

  function goToStorageShop() {
    closeAndNavigate({ path: '/growth', query: { section: 'rewards', reward: 'shop' } });
  }

  function goToTrash() {
    closeAndNavigate('/trash');
  }

  defineExpose({ openDetails });
</script>

<style lang="less" scoped>
  .storage-usage {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 250px;
    min-width: 250px;
    height: auto;
    padding: 3px 0;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-size: 12px;
    line-height: normal;
    text-align: left;

    &:hover {
      background: transparent;
    }
  }

  .storage-head,
  .storage-meta {
    display: flex;
    align-items: center;
  }

  .storage-head {
    justify-content: space-between;
    width: 100%;
    gap: 10px;
  }

  .storage-title {
    color: var(--desc-color);
    white-space: nowrap;
  }

  .storage-status {
    display: inline-flex;
    align-self: flex-end;
    align-items: center;
    gap: 3px;
    min-height: 16px;
    color: #9a6300;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .storage-meta {
    gap: 8px;
    min-width: 0;
  }

  .storage-value,
  .storage-percent {
    line-height: 1;
    white-space: nowrap;
  }

  .storage-value {
    min-width: 0;
    color: var(--text-color);
    font-weight: 500;
  }

  .storage-percent {
    min-width: 40px;
    text-align: right;
    font-weight: 700;
    color: var(--resource-file-color, #ff8a00);
  }

  .storage-bar {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: #d7d7d9;
  }

  .storage-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--resource-file-color, #ff8a00);
    transition: width 0.3s ease;
  }

  .storage-usage.progress-yellow {
    .storage-percent {
      color: #a96d00;
    }

    .storage-bar-fill {
      background: #d99a22;
    }
  }

  .storage-usage.progress-red {
    .storage-status {
      color: #b32632;
    }

    .storage-percent {
      color: #d12f3d;
    }

    .storage-bar-fill {
      background: #d84a55;
    }
  }

  :global([data-theme='night']) .storage-usage {
    .storage-bar {
      background: #5d6677;
    }

    .storage-status {
      color: #ffd782;
    }

    &.progress-red .storage-status {
      color: #ffabb2;
    }
  }
</style>

<style lang="less">
  .cloud-storage-popover {
    width: min(390px, calc(100vw - 24px));
    max-height: calc(100vh - 16px);
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .storage-detail-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }

  .storage-detail-header {
    display: flex;
    align-items: center;
    gap: 10px;

    h3,
    p {
      margin: 0;
    }

    h3 {
      color: var(--text-color);
      font-size: 15px;
      line-height: 1.4;
    }

    p {
      margin-top: 2px;
      color: var(--desc-color);
      font-size: 12px;

      &.is-shortfall {
        color: #d12f3d;
        font-weight: 700;
      }
    }
  }

  .storage-detail-icon,
  .storage-option-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 9px;
  }

  .storage-detail-icon {
    width: 36px;
    height: 36px;
    color: var(--resource-file-color, #ff8a00);
    border: 1px solid #f2aa52;
    background: #fff7e8;
  }

  .storage-detail-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    overflow: hidden;

    > div {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      padding: 10px;
    }

    > div + div {
      border-left: 1px solid var(--card-border-color);
    }

    span {
      color: var(--desc-color);
      font-size: 11px;
    }

    strong {
      overflow: hidden;
      color: var(--text-color);
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .storage-detail-breakdown {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--primary-btn-bg-color);

    > div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    > div:last-child {
      text-align: right;
    }

    span {
      color: var(--desc-color);
      font-size: 11px;
    }

    strong {
      color: var(--text-color);
      font-size: 13px;
    }

    .is-bonus {
      color: var(--primary-color);
    }
  }

  .storage-shared-note {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 9px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 9px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
    line-height: 1.5;

    svg {
      flex: 0 0 auto;
      margin-top: 1px;
      color: var(--resource-file-color, #ff8a00);
    }
  }

  .storage-location-breakdown {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid var(--card-border-color);
      border-radius: 9px;
    }

    span {
      color: var(--desc-color);
      font-size: 11px;
    }

    strong {
      color: var(--text-color);
      font-size: 12px;
      white-space: nowrap;
    }
  }

  .storage-detail-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .storage-option.b_btn {
    justify-content: flex-start;
    width: 100%;
    height: auto;
    min-height: 54px;
    padding: 9px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: transparent;
    text-align: left;

    &:hover {
      border-color: var(--primary-color);
      background: var(--primary-btn-h-bg-color);
    }

    > svg:last-child {
      flex: 0 0 auto;
      color: var(--desc-color);
    }
  }

  .storage-option-icon {
    width: 32px;
    height: 32px;
    margin-right: 10px;
    border: 1px solid var(--card-border-color);

    &.is-level {
      color: var(--primary-color);
    }

    &.is-shop {
      color: #b56c00;
    }
  }

  .storage-option-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    strong {
      color: var(--text-color);
      font-size: 13px;
      line-height: 1.35;
    }

    small {
      overflow: hidden;
      color: var(--desc-color);
      font-size: 11px;
      line-height: 1.4;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .storage-cleanup.b_btn {
    align-self: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    color: var(--desc-color);
    background: transparent;
    font-size: 12px;

    &:hover {
      color: var(--primary-color);
    }
  }

  [data-theme='night'] {
    .storage-detail-icon {
      color: #ffb04a;
      background: #38260e;
    }

    .storage-option-icon.is-shop {
      color: #f5b544;
    }
  }
</style>
