<template>
  <AdminDataPage
    :eyebrow="t('communityChatAdmin.eyebrow')"
    :title="t('communityChatAdmin.title')"
    :subtitle="t('communityChatAdmin.subtitle')"
    :toolbar-hint="t('communityChatAdmin.toolbarHint')"
    :summary-count="total"
  >
    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('communityChatAdmin.pending') }}</span>
        <strong class="admin-stat-value">{{ formatCount(totals.pending) }}</strong>
        <span class="admin-stat-hint">{{ t('communityChatAdmin.pendingHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('communityChatAdmin.approved') }}</span>
        <strong class="admin-stat-value">{{ formatCount(totals.approved) }}</strong>
        <span class="admin-stat-hint">{{ t('communityChatAdmin.approvedHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('communityChatAdmin.rejected') }}</span>
        <strong class="admin-stat-value">{{ formatCount(totals.rejected) }}</strong>
        <span class="admin-stat-hint">{{ t('communityChatAdmin.rejectedHint') }}</span>
      </li>
    </template>

    <template #toolbar>
      <BSelect
        v-model:value="status"
        class="community-chat-access-admin__filter"
        :options="statusOptions"
        :aria-label="t('communityChatAdmin.statusFilter')"
        @change="handleStatusChange"
      />
      <BButton type="primary" :loading="loading" @click="load">{{ t('communityChatAdmin.refresh') }}</BButton>
    </template>

    <div v-if="bookmark.isMobile" class="community-chat-access-admin__mobile" v-auto-scrollbar>
      <MobileListSurface v-if="items.length" :aria-label="t('communityChatAdmin.listAria')">
        <MobileListRow v-for="item in items" :key="item.id" complex>
          <template #title>
            <span class="community-chat-access-admin__mobile-heading">
              <span>{{ userLabel(item) }}</span>
              <BChip :tone="requestStatusTone(item.status)">{{ requestStatusLabel(item.status) }}</BChip>
            </span>
          </template>
          <template #subtitle>
            <span class="community-chat-access-admin__mobile-copy">{{ item.userEmail || '-' }}</span>
            <span class="community-chat-access-admin__mobile-copy">{{ requestMessage(item) }}</span>
          </template>
          <template #meta>
            <span class="community-chat-access-admin__mobile-meta">
              <BChip :tone="memberStatusTone(item.memberStatus)">{{ memberStatusLabel(item.memberStatus) }}</BChip>
              <time :datetime="item.createTime">{{ formatTime(item.createTime) }}</time>
            </span>
            <span v-if="hasActions(item)" class="community-chat-access-admin__mobile-actions">
              <BButton
                v-if="item.status === 'pending'"
                type="primary"
                class="community-chat-access-admin__action--approve"
                @click="openAction(item, 'approve')"
              >
                {{ t('communityChatAdmin.approve') }}
              </BButton>
              <BButton
                v-if="item.status === 'pending'"
                type="danger"
                class="community-chat-access-admin__action--reject"
                @click="openAction(item, 'reject')"
              >
                {{ t('communityChatAdmin.reject') }}
              </BButton>
              <BButton
                v-if="canRevoke(item)"
                type="danger"
                class="community-chat-access-admin__action--revoke"
                @click="openAction(item, 'revoke')"
              >
                {{ t('communityChatAdmin.revoke') }}
              </BButton>
            </span>
          </template>
        </MobileListRow>
      </MobileListSurface>
      <p v-else-if="!loading" class="community-chat-access-admin__empty">{{ t('communityChatAdmin.empty') }}</p>
      <BPagination
        v-if="total > pageSize"
        class="community-chat-access-admin__mobile-pagination"
        :current="currentPage"
        :page-size="pageSize"
        :total="total"
        @page-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <BTable
      v-else-if="items.length || loading"
      fill
      row-key="id"
      :data="items"
      :columns="columns"
      :loading="loading"
      :pagination="true"
      :total="total"
      :current-page="currentPage"
      :page-size="pageSize"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    >
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'user'" class="community-chat-access-admin__user">
          <strong>{{ userLabel(record) }}</strong>
          <span>{{ record.userEmail || '-' }}</span>
          <small>{{ t('communityChatAdmin.userId', { id: record.userId }) }}</small>
        </div>
        <span v-else-if="column.key === 'requestMessage'" class="community-chat-access-admin__copy">
          {{ requestMessage(record) }}
        </span>
        <BChip v-else-if="column.key === 'status'" :tone="requestStatusTone(record.status)">
          {{ requestStatusLabel(record.status) }}
        </BChip>
        <BChip v-else-if="column.key === 'memberStatus'" :tone="memberStatusTone(record.memberStatus)">
          {{ memberStatusLabel(record.memberStatus) }}
        </BChip>
        <time v-else-if="column.key === 'createTime'" :datetime="record.createTime">
          {{ formatTime(record.createTime) }}
        </time>
        <span v-else-if="column.key === 'reviewNote'" class="community-chat-access-admin__copy">
          {{ record.reviewNote || t('communityChatAdmin.noReviewNote') }}
        </span>
        <div v-else-if="column.key === 'actions'" class="community-chat-access-admin__actions">
          <BButton
            v-if="record.status === 'pending'"
            size="small"
            type="primary"
            class="community-chat-access-admin__action--approve"
            @click="openAction(record, 'approve')"
          >
            {{ t('communityChatAdmin.approve') }}
          </BButton>
          <BButton
            v-if="record.status === 'pending'"
            size="small"
            type="danger"
            class="community-chat-access-admin__action--reject"
            @click="openAction(record, 'reject')"
          >
            {{ t('communityChatAdmin.reject') }}
          </BButton>
          <BButton
            v-if="canRevoke(record)"
            size="small"
            type="danger"
            class="community-chat-access-admin__action--revoke"
            @click="openAction(record, 'revoke')"
          >
            {{ t('communityChatAdmin.revoke') }}
          </BButton>
        </div>
      </template>
    </BTable>
    <p v-else class="community-chat-access-admin__empty">{{ t('communityChatAdmin.empty') }}</p>
  </AdminDataPage>

  <BModal
    v-model:visible="actionVisible"
    :title="actionTitle"
    width="520px"
    initial-focus=".community-chat-access-admin__note textarea"
  >
    <div v-if="selected" class="community-chat-access-admin__dialog">
      <p>{{ actionDescription }}</p>
      <div class="community-chat-access-admin__dialog-user">
        <strong>{{ userLabel(selected) }}</strong>
        <span>{{ selected.userEmail || selected.userId }}</span>
      </div>
      <label for="community-chat-access-review-note">{{ t('communityChatAdmin.noteLabel') }}</label>
      <BInput
        id="community-chat-access-review-note"
        v-model:value="actionNote"
        class="community-chat-access-admin__note"
        type="textarea"
        :rows="4"
        :maxlength="500"
        :placeholder="actionPlaceholder"
      />
    </div>
    <template #footer>
      <div class="community-chat-access-admin__dialog-actions">
        <BButton :disabled="saving" @click="actionVisible = false">{{ t('common.cancel') }}</BButton>
        <BButton :type="action === 'approve' ? 'primary' : 'danger'" :loading="saving" @click="submitAction">
          {{ actionButtonLabel }}
        </BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { bookmarkStore } from '@/store';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import {
    getCommunityChatAdminAccessRequests,
    reviewCommunityChatAdminAccessRequest,
    revokeCommunityChatAdminMember,
    type CommunityChatAccessRequestItem,
    type CommunityChatAccessRequestPage,
    type CommunityChatAccessRequestStatus,
    type CommunityChatMemberStatus,
  } from '@/api/communityChatApi';

  type AdminAction = 'approve' | 'reject' | 'revoke';

  const REQUEST_STATUSES: readonly CommunityChatAccessRequestStatus[] = ['pending', 'approved', 'rejected'];
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const saving = ref(false);
  const status = ref<CommunityChatAccessRequestStatus>('pending');
  const items = ref<CommunityChatAccessRequestItem[]>([]);
  const totals = ref<Record<CommunityChatAccessRequestStatus, number>>({ pending: 0, approved: 0, rejected: 0 });
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const actionVisible = ref(false);
  const action = ref<AdminAction>('approve');
  const actionNote = ref('');
  const selected = ref<CommunityChatAccessRequestItem | null>(null);

  const statusOptions = computed(() =>
    REQUEST_STATUSES.map((value) => ({ value, label: t(`communityChatAdmin.status.${value}`) })),
  );
  const columns = computed<Column[]>(() => [
    { key: 'user', title: t('communityChatAdmin.user'), width: 'minmax(190px, 1.15fr)', ellipsis: false },
    {
      key: 'requestMessage',
      title: t('communityChatAdmin.requestMessage'),
      width: 'minmax(170px, 1fr)',
      ellipsis: false,
    },
    { key: 'status', title: t('communityChatAdmin.requestStatus'), width: '92px', ellipsis: false },
    { key: 'memberStatus', title: t('communityChatAdmin.memberStatus'), width: '110px', ellipsis: false },
    { key: 'createTime', title: t('communityChatAdmin.submittedAt'), width: '156px' },
    { key: 'reviewNote', title: t('communityChatAdmin.reviewNote'), width: 'minmax(150px, 0.9fr)', ellipsis: false },
    { key: 'actions', title: t('communityChatAdmin.actions'), width: '150px', ellipsis: false },
  ]);
  const actionTitle = computed(() => t(`communityChatAdmin.${action.value}Title`));
  const actionDescription = computed(() => t(`communityChatAdmin.${action.value}Description`));
  const actionPlaceholder = computed(() => t(`communityChatAdmin.${action.value}Placeholder`));
  const actionButtonLabel = computed(() => t(`communityChatAdmin.${action.value}`));

  function formatCount(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }

  function formatTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value, { hour12: false });
  }

  function userLabel(item: CommunityChatAccessRequestItem) {
    return item.userAlias || item.userEmail || item.userId || t('communityChat.memberFallback');
  }

  function requestMessage(item: CommunityChatAccessRequestItem) {
    return item.requestMessage || t('communityChatAdmin.noRequestMessage');
  }

  function requestStatusLabel(value: CommunityChatAccessRequestStatus) {
    return t(`communityChatAdmin.status.${value}`);
  }

  function requestStatusTone(value: CommunityChatAccessRequestStatus): 'pending' | 'success' | 'danger' {
    if (value === 'approved') return 'success';
    if (value === 'rejected') return 'danger';
    return 'pending';
  }

  function memberStatusLabel(value: CommunityChatMemberStatus) {
    return t(`communityChatAdmin.member.${value || 'unknown'}`);
  }

  function memberStatusTone(value: CommunityChatMemberStatus): 'pending' | 'success' | 'danger' | 'neutral' {
    if (value === 'active') return 'success';
    if (value === 'invited') return 'pending';
    if (value === 'revoked' || value === 'banned') return 'danger';
    return 'neutral';
  }

  function canRevoke(item: CommunityChatAccessRequestItem) {
    return item.status === 'approved' && (item.memberStatus === 'invited' || item.memberStatus === 'active');
  }

  function hasActions(item: CommunityChatAccessRequestItem) {
    return item.status === 'pending' || canRevoke(item);
  }

  function normalizePage(response: any): CommunityChatAccessRequestPage {
    if (response?.status !== 200 || !response.data || !Array.isArray(response.data.items)) {
      throw new Error('COMMUNITY_ACCESS_LIST_UNAVAILABLE');
    }
    return response.data as CommunityChatAccessRequestPage;
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const pages = await Promise.all(
        REQUEST_STATUSES.map(async (requestStatus) => {
          const isCurrent = requestStatus === status.value;
          const response = await getCommunityChatAdminAccessRequests({
            status: requestStatus,
            page: isCurrent ? currentPage.value : 1,
            pageSize: isCurrent ? pageSize.value : 1,
          });
          return normalizePage(response);
        }),
      );
      const nextTotals = { ...totals.value };
      pages.forEach((page) => {
        nextTotals[page.status] = Number(page.total || 0);
      });
      totals.value = nextTotals;

      let current = pages.find((page) => page.status === status.value);
      if (!current) throw new Error('COMMUNITY_ACCESS_STATUS_UNAVAILABLE');
      if (!current.items.length && current.total > 0 && currentPage.value > 1) {
        currentPage.value = Math.max(1, Math.ceil(current.total / pageSize.value));
        current = normalizePage(
          await getCommunityChatAdminAccessRequests({
            status: status.value,
            page: currentPage.value,
            pageSize: pageSize.value,
          }),
        );
      }
      items.value = current.items;
      total.value = Number(current.total || 0);
    } catch {
      message.error(t('communityChatAdmin.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  function handleStatusChange() {
    currentPage.value = 1;
    load();
  }

  function handlePageChange(page: number) {
    currentPage.value = Math.max(1, Number(page) || 1);
    load();
  }

  function handleSizeChange(_current: number, size: number) {
    currentPage.value = 1;
    pageSize.value = Math.max(1, Number(size) || 20);
    load();
  }

  function openAction(item: CommunityChatAccessRequestItem, nextAction: AdminAction) {
    selected.value = item;
    action.value = nextAction;
    actionNote.value = '';
    actionVisible.value = true;
  }

  async function submitAction() {
    if (!selected.value || saving.value) return;
    const note = actionNote.value.trim();
    if (action.value !== 'approve' && !note) {
      message.warning(t('communityChatAdmin.noteRequired'));
      return;
    }

    saving.value = true;
    try {
      const response =
        action.value === 'revoke'
          ? await revokeCommunityChatAdminMember(selected.value.userId, note)
          : await reviewCommunityChatAdminAccessRequest(selected.value.userId, { action: action.value, note });
      if (response?.status !== 200) throw new Error('COMMUNITY_ACCESS_ACTION_FAILED');

      const successKey =
        action.value === 'approve'
          ? 'communityChatAdmin.approvedSuccess'
          : action.value === 'reject'
            ? 'communityChatAdmin.rejectedSuccess'
            : 'communityChatAdmin.revokedSuccess';
      message.success(t(successKey));
      actionVisible.value = false;
      selected.value = null;
      await load();
    } catch {
      message.error(t('communityChatAdmin.actionFailed'));
    } finally {
      saving.value = false;
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .community-chat-access-admin__filter {
    width: 190px;
  }

  .community-chat-access-admin__user {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong,
    span,
    small {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span,
    small {
      color: var(--sub-text-color);
      font-size: 11px;
    }
  }

  .community-chat-access-admin__copy {
    min-width: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    line-height: 1.4;
  }

  .community-chat-access-admin__actions,
  .community-chat-access-admin__dialog-actions,
  .community-chat-access-admin__mobile-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .community-chat-access-admin__empty {
    min-height: 180px;
    margin: 0;
    display: grid;
    place-items: center;
    color: var(--sub-text-color);
    text-align: center;
  }

  .community-chat-access-admin__mobile {
    min-height: 0;
    height: 100%;
    overflow-y: auto;
    padding-right: 4px;
  }

  .community-chat-access-admin__mobile-heading,
  .community-chat-access-admin__mobile-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .community-chat-access-admin__mobile-copy {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-chat-access-admin__mobile-meta time {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-chat-access-admin__mobile-actions {
    margin-top: 6px;

    :deep(.b_btn) {
      min-height: 42px;
    }
  }

  .community-chat-access-admin__mobile-pagination {
    margin-top: 12px;
  }

  .community-chat-access-admin__dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--text-color);

    p {
      margin: 0;
      color: var(--sub-text-color);
      line-height: 1.6;
    }

    label {
      font-size: 13px;
      font-weight: 600;
    }
  }

  .community-chat-access-admin__dialog-user {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);

    span {
      color: var(--sub-text-color);
      font-size: 12px;
    }
  }

  .community-chat-access-admin__dialog-actions {
    width: 100%;
    justify-content: flex-end;
  }

  @media (max-width: 960px) {
    .community-chat-access-admin__filter {
      flex: 1 1 180px;
      width: auto;
    }

    .community-chat-access-admin__mobile {
      height: auto;
      overflow: visible;
    }
  }
</style>
