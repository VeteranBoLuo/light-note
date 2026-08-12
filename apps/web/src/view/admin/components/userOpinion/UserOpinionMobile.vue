<template>
  <div class="mobile-user-opinion-page">
    <CommonContainer :title="t('adminUserOpinion.title')" @backClick="goBack">
      <div class="mobile-user-opinion">
        <div class="mobile-user-opinion__filters">
          <BInput
            v-model:value="searchValue"
            :placeholder="t('adminUserOpinion.searchPlaceholder')"
            @input="handleSearch"
          >
            <template #prefix>
              <SvgIcon :src="icon.navigation.search" size="16" />
            </template>
          </BInput>
          <BSelect v-model:value="statusFilter" :options="statusOptions" @change="applyFilters" />
        </div>

        <BLoading v-if="loading" loading :title="t('adminUserOpinion.loading')" />
        <div v-else-if="!opinionList.length" class="mobile-user-opinion__empty">
          <strong>{{ t('adminUserOpinion.emptyTitle') }}</strong>
          <span>{{ t('adminUserOpinion.emptyHint') }}</span>
        </div>
        <MobileListSurface v-else :aria-label="t('adminUserOpinion.mobileListAria')">
          <MobileListRow
            v-for="record in opinionList"
            :key="record.id"
            interactive
            complex
            :selected="selectedRecord?.id === record.id && detailVisible"
            @click="openOpinion(record)"
          >
            <template #title>{{ record.alias || t('adminUserOpinion.unknownUser') }}</template>
            <template #subtitle>{{ record.type || '-' }} · {{ record.createTime || '-' }}</template>
            <template #meta>{{ record.content || '-' }}</template>
            <template #trailing>
              <BChip :tone="statusMeta(record.status).tone">{{ statusMeta(record.status).label }}</BChip>
            </template>
          </MobileListRow>
        </MobileListSurface>

        <BPagination
          v-if="total > pageSize"
          :current="currentPage"
          :page-size="pageSize"
          :total="total"
          @page-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </CommonContainer>

    <BModal
      v-model:visible="detailVisible"
      :title="t('adminUserOpinion.detail.title')"
      width="min(640px, 94vw)"
      :show-footer="false"
      :mask-closable="!replying"
      :esc-closable="!replying"
      fullscreen-mobile
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
  </div>
</template>

<script setup lang="ts">
  import { onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import icon from '@/config/icon.ts';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory.ts';
  import AdminOpinionDetail from '@/view/admin/components/userOpinion/AdminOpinionDetail.vue';
  import { useAdminUserOpinion } from '@/view/admin/components/userOpinion/useAdminUserOpinion.ts';

  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const {
    opinionList,
    replyDrafts,
    selectedRecord,
    detailVisible,
    loading,
    replying,
    currentPage,
    pageSize,
    total,
    searchValue,
    statusFilter,
    returnTo,
    statusOptions,
    statusMeta,
    initialize,
    handleSearch,
    applyFilters,
    onPageChange,
    onSizeChange,
    openOpinion,
    submitReply,
  } = useAdminUserOpinion({ initialPageSize: 10 });

  function goBack() {
    void router.push(returnTo.value || '/admin');
  }

  async function submitSelected() {
    if (!selectedRecord.value) return;
    const succeeded = await submitReply(selectedRecord.value);
    if (!succeeded || !returnTo.value) return;
    await closeCurrentMobileOverlayThen(
      () => {
        detailVisible.value = false;
      },
      () => router.push(returnTo.value),
    );
  }

  onMounted(initialize);
</script>

<style lang="less" scoped>
  .mobile-user-opinion-page {
    width: 100%;
    min-height: 0;
  }

  .mobile-user-opinion {
    min-height: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
  }

  .mobile-user-opinion__filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .mobile-user-opinion :deep(.mobile-list-row__meta) {
    display: -webkit-box;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .mobile-user-opinion__empty {
    min-height: 180px;
    display: grid;
    place-content: center;
    gap: 6px;
    padding: 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: var(--mobile-surface-radius, 16px);
    color: var(--desc-color);
    background: var(--card-background);
    text-align: center;
  }

  .mobile-user-opinion__empty strong {
    color: var(--text-color);
  }
</style>
