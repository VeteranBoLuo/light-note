<template>
  <AdminDataPage
    :eyebrow="t('adminUserOpinion.eyebrow')"
    :title="t('adminUserOpinion.title')"
    :subtitle="t('adminUserOpinion.subtitle')"
    :toolbar-hint="t('adminUserOpinion.toolbarHint')"
    :summary-count="total"
    :back-to="returnTo || undefined"
  >
    <template v-if="returnTo" #actions>
      <BButton size="small" @click="goToReturnQueue">{{ t('adminUserOpinion.actions.backToQueue') }}</BButton>
    </template>

    <template #metrics>
      <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
        <span class="admin-stat-label">{{ card.label }}</span>
        <strong class="admin-stat-value">{{ card.value }}</strong>
        <span class="admin-stat-hint">{{ card.hint }}</span>
      </li>
    </template>

    <template #toolbar>
      <BInput
        v-model:value="searchValue"
        :placeholder="t('adminUserOpinion.searchPlaceholder')"
        class="user-opinion__search"
        @input="handleSearch"
      >
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="16" />
        </template>
      </BInput>
      <BSelect
        v-model:value="statusFilter"
        class="user-opinion__status-filter"
        :options="statusOptions"
        @change="applyFilters"
      />
      <span class="user-opinion__hide-internal">
        <BSwitch v-model:checked="hideInternal" @change="applyFilters" />
        {{ t('adminUserOpinion.hideInternal') }}
      </span>
    </template>

    <BTable
      fill
      :data="opinionList"
      :columns="opinionColumns"
      :loading="loading"
      row-key="id"
      :row-clickable="true"
      :pagination="true"
      :total="total"
      :current-page="currentPage"
      :page-size="pageSize"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @row-click="openOpinion"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <BChip :tone="statusMeta(record.status).tone">{{ statusMeta(record.status).label }}</BChip>
        </template>
        <template v-else-if="column.key === 'operation'">
          <div class="user-opinion__operation">
            <BActionButton action="delete" :tooltip="t('common.delete')" @click="requestDelete(record)" />
          </div>
        </template>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal
    v-model:visible="detailVisible"
    :title="t('adminUserOpinion.detail.title')"
    width="min(640px, 94vw)"
    :show-footer="false"
    :mask-closable="!replying"
    :esc-closable="!replying"
  >
    <AdminOpinionDetail
      v-if="selectedRecord"
      :record="selectedRecord"
      :draft="replyDrafts[selectedRecord.id] || ''"
      :replying="replying"
      :submit-label="returnTo ? t('adminUserOpinion.actions.saveAndReturn') : t('adminUserOpinion.actions.saveReply')"
      @update:draft="replyDrafts[selectedRecord.id] = $event"
      @open-image="bookmark.refreshViewer"
      @submit="submitSelected"
    />
  </BModal>

  <AdminRiskActionModal
    v-model:visible="deleteVisible"
    :title="t('adminUserOpinion.delete.title')"
    :impact="
      t('adminUserOpinion.delete.impact', {
        user: pendingDelete?.alias || t('adminUserOpinion.unknownUser'),
      })
    "
    :confirm-label="t('adminUserOpinion.delete.confirm')"
    :loading="deleting"
    @confirm="confirmDelete"
  />
</template>

<script lang="ts" setup>
  import { computed, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import AdminOpinionDetail from '@/view/admin/components/userOpinion/AdminOpinionDetail.vue';
  import { useAdminUserOpinion } from '@/view/admin/components/userOpinion/useAdminUserOpinion.ts';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const {
    opinionList,
    replyDrafts,
    selectedRecord,
    pendingDelete,
    detailVisible,
    deleteVisible,
    loading,
    replying,
    deleting,
    currentPage,
    pageSize,
    total,
    searchValue,
    statusFilter,
    hideInternal,
    returnTo,
    statusOptions,
    statCards,
    statusMeta,
    initialize,
    handleSearch,
    applyFilters,
    onPageChange,
    onSizeChange,
    openOpinion,
    submitReply,
    requestDelete,
    confirmDelete,
    goToReturnQueue,
  } = useAdminUserOpinion({ initialPageSize: 20 });

  const opinionColumns = computed(() => [
    { title: t('adminUserOpinion.columns.user'), key: 'alias', width: 'minmax(120px, 1fr)' },
    { title: t('adminUserOpinion.columns.contact'), key: 'phone', width: '130px' },
    { title: t('adminUserOpinion.columns.type'), key: 'type', width: '110px' },
    { title: t('adminUserOpinion.columns.status'), key: 'status', width: '100px' },
    { title: t('adminUserOpinion.columns.submittedAt'), key: 'createTime', width: '170px' },
    { title: t('adminUserOpinion.columns.repliedAt'), key: 'replyTime', width: '170px' },
    { title: t('adminUserOpinion.columns.operation'), key: 'operation', width: '64px' },
  ]);

  async function submitSelected() {
    if (!selectedRecord.value) return;
    const succeeded = await submitReply(selectedRecord.value);
    if (succeeded && returnTo.value) {
      detailVisible.value = false;
      goToReturnQueue();
    }
  }

  onMounted(initialize);
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';

  .user-opinion__search {
    min-width: 220px;
    flex: 1;
  }

  .user-opinion__status-filter {
    width: 160px;
  }

  .user-opinion__hide-internal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
  }

  .user-opinion__operation {
    display: flex;
    justify-content: center;
  }

  @media (max-width: @admin-bp-desktop) {
    .user-opinion__status-filter {
      width: 100%;
    }
  }
</style>
