<template>
  <AdminDataPage
    :eyebrow="t('communityChatModerationAdmin.eyebrow')"
    :title="t('communityChatModerationAdmin.title')"
    :subtitle="t('communityChatModerationAdmin.subtitle')"
    :toolbar-hint="t('communityChatModerationAdmin.toolbarHint')"
    :summary-count="total"
  >
    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('communityChatModerationAdmin.pending') }}</span>
        <strong class="admin-stat-value">{{ formatCount(totals.pending) }}</strong>
        <span class="admin-stat-hint">{{ t('communityChatModerationAdmin.pendingHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('communityChatModerationAdmin.actioned') }}</span>
        <strong class="admin-stat-value">{{ formatCount(totals.actioned) }}</strong>
        <span class="admin-stat-hint">{{ t('communityChatModerationAdmin.actionedHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('communityChatModerationAdmin.dismissed') }}</span>
        <strong class="admin-stat-value">{{ formatCount(totals.dismissed) }}</strong>
        <span class="admin-stat-hint">{{ t('communityChatModerationAdmin.dismissedHint') }}</span>
      </li>
      <li class="admin-stat-card community-moderation-admin__runtime-card">
        <span class="admin-stat-label">{{ t('communityChatModerationAdmin.runtimeTitle') }}</span>
        <strong class="admin-stat-value community-moderation-admin__runtime-value">
          <BChip :tone="runtimeTone" size="medium">{{ runtimeLabel }}</BChip>
        </strong>
        <span class="admin-stat-hint">{{ runtimeHint }}</span>
      </li>
    </template>

    <template #toolbar>
      <BSelect
        v-model:value="status"
        class="community-moderation-admin__filter"
        :options="statusOptions"
        :aria-label="t('communityChatModerationAdmin.statusFilter')"
        @change="handleStatusChange"
      />
      <BButton
        :type="runtimePolicy?.databasePostingEnabled ? 'danger' : 'primary'"
        :loading="runtimeSaving"
        :disabled="!runtimeCanToggle"
        :title="runtimeHint"
        @click="openRuntimePolicyDialog"
      >
        {{ runtimeActionLabel }}
      </BButton>
      <BButton type="primary" :loading="loading || runtimeLoading" @click="loadAll">
        {{ t('communityChatModerationAdmin.refresh') }}
      </BButton>
    </template>

    <div v-if="bookmark.isMobile" class="community-moderation-admin__mobile" v-auto-scrollbar>
      <MobileListSurface v-if="items.length" :aria-label="t('communityChatModerationAdmin.listAria')">
        <MobileListRow v-for="item in items" :key="item.id" complex>
          <template #title>
            <span class="community-moderation-admin__mobile-heading">
              <span>{{ evidenceAuthor(item) }}</span>
              <BChip :tone="statusTone(item.status)">{{ statusLabel(item.status) }}</BChip>
            </span>
          </template>
          <template #subtitle>
            <span class="community-moderation-admin__mobile-content">{{ evidenceContent(item) }}</span>
            <span class="community-moderation-admin__mobile-copy">
              {{ reasonLabel(item.reasonCode) }} · {{ evidenceRoom(item) }}
            </span>
            <span class="community-moderation-admin__mobile-copy">
              {{ t('communityChatModerationAdmin.reporter', { name: reporterName(item) }) }}
            </span>
          </template>
          <template #meta>
            <span class="community-moderation-admin__mobile-meta">
              <time :datetime="item.createTime">{{ formatTime(item.createTime) }}</time>
              <BChip v-if="item.resolutionAction" :tone="actionTone(item.resolutionAction)">
                {{ actionLabel(item.resolutionAction) }}
              </BChip>
            </span>
            <BButton
              v-if="item.status === 'pending'"
              type="danger"
              class="community-moderation-admin__mobile-action"
              @click="openAction(item)"
            >
              {{ t('communityChatModerationAdmin.review') }}
            </BButton>
          </template>
        </MobileListRow>
      </MobileListSurface>
      <p v-else-if="!loading" class="community-moderation-admin__empty">
        {{ t('communityChatModerationAdmin.empty') }}
      </p>
      <BPagination
        v-if="total > pageSize"
        class="community-moderation-admin__mobile-pagination"
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
        <div v-if="column.key === 'evidence'" class="community-moderation-admin__evidence">
          <span class="community-moderation-admin__evidence-heading">
            <strong>{{ evidenceAuthor(record) }}</strong>
            <BChip :tone="messageStatusTone(record.messageStatus)">
              {{ messageStatusLabel(record.messageStatus) }}
            </BChip>
          </span>
          <span>{{ evidenceContent(record) }}</span>
          <small>{{ evidenceRoom(record) }} · {{ formatTime(record.evidenceSnapshot?.messageCreatedAt) }}</small>
        </div>
        <div v-else-if="column.key === 'reason'" class="community-moderation-admin__reason">
          <strong>{{ reasonLabel(record.reasonCode) }}</strong>
          <span>{{ record.detail || t('communityChatModerationAdmin.noDetail') }}</span>
        </div>
        <div v-else-if="column.key === 'reporter'" class="community-moderation-admin__reporter">
          <strong>{{ reporterName(record) }}</strong>
          <time :datetime="record.createTime">{{ formatTime(record.createTime) }}</time>
        </div>
        <div v-else-if="column.key === 'status'" class="community-moderation-admin__status">
          <BChip :tone="statusTone(record.status)">{{ statusLabel(record.status) }}</BChip>
          <BChip v-if="record.resolutionAction" :tone="actionTone(record.resolutionAction)">
            {{ actionLabel(record.resolutionAction) }}
          </BChip>
          <small v-if="record.reviewNote">{{ record.reviewNote }}</small>
        </div>
        <BButton
          v-else-if="column.key === 'actions' && record.status === 'pending'"
          size="small"
          type="danger"
          @click="openAction(record)"
        >
          {{ t('communityChatModerationAdmin.review') }}
        </BButton>
        <span v-else-if="column.key === 'actions'">{{ t('communityChatModerationAdmin.reviewed') }}</span>
      </template>
    </BTable>
    <p v-else class="community-moderation-admin__empty">{{ t('communityChatModerationAdmin.empty') }}</p>
  </AdminDataPage>

  <BModal
    v-model:visible="actionVisible"
    :title="t('communityChatModerationAdmin.dialogTitle')"
    width="min(620px, 94vw)"
    :mask-closable="!saving"
    :show-footer="false"
  >
    <div v-if="selected" class="community-moderation-admin__dialog">
      <div class="community-moderation-admin__dialog-evidence">
        <span>
          <strong>{{ evidenceAuthor(selected) }}</strong>
          <small>{{ evidenceRoom(selected) }} · {{ formatTime(selected.evidenceSnapshot?.messageCreatedAt) }}</small>
        </span>
        <p>{{ evidenceContent(selected) }}</p>
        <small>
          {{ reasonLabel(selected.reasonCode) }}：{{ selected.detail || t('communityChatModerationAdmin.noDetail') }}
        </small>
      </div>

      <label id="community-chat-moderation-action-label">{{ t('communityChatModerationAdmin.actionLabel') }}</label>
      <BSelect
        v-model:value="action"
        :options="actionOptions"
        :aria-labelledby="'community-chat-moderation-action-label'"
        :disabled="saving"
      />

      <template v-if="action === 'mute_author'">
        <label id="community-chat-moderation-duration-label">
          {{ t('communityChatModerationAdmin.durationLabel') }}
        </label>
        <BSelect
          v-model:value="durationMinutes"
          :options="durationOptions"
          :aria-labelledby="'community-chat-moderation-duration-label'"
          :disabled="saving"
        />
      </template>

      <label for="community-chat-moderation-note">{{ t('communityChatModerationAdmin.noteLabel') }}</label>
      <BInput
        id="community-chat-moderation-note"
        v-model:value="note"
        type="textarea"
        :rows="4"
        :maxlength="500"
        :disabled="saving"
        :placeholder="t('communityChatModerationAdmin.notePlaceholder')"
      />
      <p class="community-moderation-admin__dialog-warning">{{ actionDescription }}</p>

      <div class="community-moderation-admin__dialog-actions">
        <BButton :disabled="saving" @click="actionVisible = false">{{ t('common.cancel') }}</BButton>
        <BButton :type="action === 'dismiss' ? 'primary' : 'danger'" :loading="saving" @click="submitAction">
          {{ t('communityChatModerationAdmin.confirmAction') }}
        </BButton>
      </div>
    </div>
  </BModal>

  <BModal
    v-model:visible="runtimeVisible"
    :title="runtimeDialogTitle"
    width="min(560px, 94vw)"
    :mask-closable="!runtimeSaving"
    :show-footer="false"
  >
    <div class="community-moderation-admin__runtime-dialog">
      <p class="community-moderation-admin__runtime-description">{{ runtimeDialogDescription }}</p>
      <label for="community-chat-runtime-reason">{{ t('communityChatModerationAdmin.runtimeReasonLabel') }}</label>
      <BInput
        id="community-chat-runtime-reason"
        v-model:value="runtimeReason"
        type="textarea"
        :rows="4"
        :maxlength="500"
        :disabled="runtimeSaving"
        :placeholder="t('communityChatModerationAdmin.runtimeReasonPlaceholder')"
      />
      <p class="community-moderation-admin__runtime-audit-hint">
        {{ t('communityChatModerationAdmin.toolbarHint') }}
      </p>
      <div class="community-moderation-admin__dialog-actions">
        <BButton :disabled="runtimeSaving" @click="runtimeVisible = false">{{ t('common.cancel') }}</BButton>
        <BButton
          :type="runtimeTargetPostingEnabled ? 'primary' : 'danger'"
          :loading="runtimeSaving"
          @click="submitRuntimePolicy"
        >
          {{ runtimeConfirmLabel }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { communityChatInlineEmojiToPlainText } from '@lightnote/shared/community-chat-inline-emojis';
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    getCommunityChatAdminRuntimePolicy,
    getCommunityChatAdminReports,
    reviewCommunityChatAdminReport,
    updateCommunityChatAdminRuntimePolicy,
    type CommunityChatModerationAction,
    type CommunityChatReportItem,
    type CommunityChatReportPage,
    type CommunityChatReportReason,
    type CommunityChatReportStatus,
    type CommunityChatRuntimePolicy,
  } from '@/api/communityChatApi';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import { bookmarkStore } from '@/store';

  const REPORT_STATUSES: readonly CommunityChatReportStatus[] = ['pending', 'actioned', 'dismissed'];
  const MODERATION_ACTIONS: readonly CommunityChatModerationAction[] = [
    'dismiss',
    'hide_message',
    'mute_author',
    'ban_author',
  ];
  const MUTE_DURATIONS = [60, 1440, 10080] as const;

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const saving = ref(false);
  const runtimeLoading = ref(false);
  const runtimeSaving = ref(false);
  const runtimePolicy = ref<CommunityChatRuntimePolicy | null>(null);
  const runtimeVisible = ref(false);
  const runtimeReason = ref('');
  const runtimeTargetPostingEnabled = ref(false);
  const status = ref<CommunityChatReportStatus>('pending');
  const items = ref<CommunityChatReportItem[]>([]);
  const totals = ref<Record<CommunityChatReportStatus, number>>({ pending: 0, actioned: 0, dismissed: 0 });
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const actionVisible = ref(false);
  const selected = ref<CommunityChatReportItem | null>(null);
  const action = ref<CommunityChatModerationAction>('hide_message');
  const durationMinutes = ref<number>(1440);
  const note = ref('');

  const statusOptions = computed(() =>
    REPORT_STATUSES.map((value) => ({ value, label: t(`communityChatModerationAdmin.status.${value}`) })),
  );
  const actionOptions = computed(() => {
    const allowed = selected.value?.evidenceSnapshot?.authorRole === 'official' ? ['dismiss'] : MODERATION_ACTIONS;
    return allowed.map((value) => ({ value, label: actionLabel(value as CommunityChatModerationAction) }));
  });
  const durationOptions = computed(() =>
    MUTE_DURATIONS.map((value) => ({ value, label: t(`communityChatModerationAdmin.duration.${value}`) })),
  );
  const actionDescription = computed(() => t(`communityChatModerationAdmin.actionDescription.${action.value}`));
  const runtimeTone = computed<'success' | 'danger' | 'neutral'>(() => {
    if (!runtimePolicy.value || !runtimePolicy.value.messagingEnabled) return 'neutral';
    return runtimePolicy.value.postingEnabled ? 'success' : 'danger';
  });
  const runtimeLabel = computed(() => {
    const policy = runtimePolicy.value;
    if (!policy) return t('communityChatModerationAdmin.runtimeUnavailable');
    if (!policy.messagingEnabled) return t('communityChatModerationAdmin.runtimeFeatureClosed');
    if (policy.environmentReadOnly) return t('communityChatModerationAdmin.runtimeEnvironmentReadOnly');
    return policy.postingEnabled
      ? t('communityChatModerationAdmin.runtimeOpen')
      : t('communityChatModerationAdmin.runtimeReadOnly');
  });
  const runtimeHint = computed(() => {
    const policy = runtimePolicy.value;
    if (!policy) return t('communityChatModerationAdmin.runtimeUnavailableHint');
    let hint = t('communityChatModerationAdmin.runtimeOpenHint');
    if (!policy.messagingEnabled) hint = t('communityChatModerationAdmin.runtimeFeatureClosedHint');
    else if (policy.environmentReadOnly) hint = t('communityChatModerationAdmin.runtimeEnvironmentReadOnlyHint');
    else if (!policy.postingEnabled) hint = t('communityChatModerationAdmin.runtimeReadOnlyHint');
    if (!policy.updatedAt) return hint;
    return `${hint} · ${t('communityChatModerationAdmin.runtimeLastUpdated', { time: formatTime(policy.updatedAt) })}`;
  });
  const runtimeCanToggle = computed(
    () =>
      Boolean(runtimePolicy.value?.messagingEnabled) &&
      !runtimePolicy.value?.environmentReadOnly &&
      !runtimeLoading.value &&
      !runtimeSaving.value,
  );
  const runtimeActionLabel = computed(() => {
    const policy = runtimePolicy.value;
    if (policy?.environmentReadOnly) return t('communityChatModerationAdmin.runtimeEnvironmentReadOnly');
    return policy?.databasePostingEnabled
      ? t('communityChatModerationAdmin.enableReadOnly')
      : t('communityChatModerationAdmin.restorePosting');
  });
  const runtimeDialogTitle = computed(() =>
    runtimeTargetPostingEnabled.value
      ? t('communityChatModerationAdmin.runtimeDialogDisableTitle')
      : t('communityChatModerationAdmin.runtimeDialogEnableTitle'),
  );
  const runtimeDialogDescription = computed(() =>
    runtimeTargetPostingEnabled.value
      ? t('communityChatModerationAdmin.runtimeDialogDisableDescription')
      : t('communityChatModerationAdmin.runtimeDialogEnableDescription'),
  );
  const runtimeConfirmLabel = computed(() =>
    runtimeTargetPostingEnabled.value
      ? t('communityChatModerationAdmin.runtimeConfirmDisable')
      : t('communityChatModerationAdmin.runtimeConfirmEnable'),
  );
  const columns = computed<Column[]>(() => [
    {
      key: 'evidence',
      title: t('communityChatModerationAdmin.evidence'),
      width: 'minmax(260px, 1.5fr)',
      ellipsis: false,
    },
    { key: 'reason', title: t('communityChatModerationAdmin.reason'), width: 'minmax(160px, 0.9fr)', ellipsis: false },
    { key: 'reporter', title: t('communityChatModerationAdmin.reportInfo'), width: '155px', ellipsis: false },
    {
      key: 'status',
      title: t('communityChatModerationAdmin.statusLabel'),
      width: 'minmax(150px, 0.8fr)',
      ellipsis: false,
    },
    { key: 'actions', title: t('communityChatModerationAdmin.actions'), width: '92px', ellipsis: false },
  ]);

  function formatCount(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }

  function formatTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value, { hour12: false });
  }

  function evidenceAuthor(item: CommunityChatReportItem) {
    return item.evidenceSnapshot?.authorName || item.authorName || t('communityChat.memberFallback');
  }

  function evidenceContent(item: CommunityChatReportItem) {
    const evidence = item.evidenceSnapshot;
    const content = evidence?.content
      ? communityChatInlineEmojiToPlainText(evidence.content, (emoji) =>
          t('communityChat.emoji.summary', {
            name: t(`communityChat.emoji.jianTuanItems.${emoji.id}`),
          }),
        )
      : t('communityChatModerationAdmin.messageUnavailable');
    const options = evidence?.poll?.options?.filter(Boolean) || [];
    if (!options.length) return content;
    return t('communityChatModerationAdmin.pollEvidence', { question: content, options: options.join(' / ') });
  }

  function evidenceRoom(item: CommunityChatReportItem) {
    const evidence = item.evidenceSnapshot;
    if (!evidence) return item.roomSlug || '-';
    return (locale.value.startsWith('zh') ? evidence.roomNameZh : evidence.roomNameEn) || evidence.roomSlug;
  }

  function reporterName(item: CommunityChatReportItem) {
    return item.reporterName || t('communityChat.memberFallback');
  }

  function reasonLabel(value: CommunityChatReportReason) {
    return t(`communityChat.report.reason.${value}`);
  }

  function statusLabel(value: CommunityChatReportStatus) {
    return t(`communityChatModerationAdmin.status.${value}`);
  }

  function statusTone(value: CommunityChatReportStatus): 'pending' | 'success' | 'neutral' {
    if (value === 'pending') return 'pending';
    if (value === 'actioned') return 'success';
    return 'neutral';
  }

  function actionLabel(value: CommunityChatModerationAction) {
    return t(`communityChatModerationAdmin.action.${value}`);
  }

  function actionTone(value: CommunityChatModerationAction): 'danger' | 'neutral' {
    return value === 'dismiss' ? 'neutral' : 'danger';
  }

  function messageStatusLabel(value: string) {
    return t(`communityChatModerationAdmin.messageStatus.${value === 'active' ? 'active' : 'hidden'}`);
  }

  function messageStatusTone(value: string): 'success' | 'danger' {
    return value === 'active' ? 'success' : 'danger';
  }

  function normalizePage(response: any): CommunityChatReportPage {
    if (response?.status !== 200 || !response.data || !Array.isArray(response.data.items)) {
      throw new Error('COMMUNITY_REPORT_LIST_UNAVAILABLE');
    }
    return response.data as CommunityChatReportPage;
  }

  function normalizeRuntimePolicy(response: any): CommunityChatRuntimePolicy {
    const policy = response?.data;
    if (
      response?.status !== 200 ||
      !policy ||
      typeof policy.messagingEnabled !== 'boolean' ||
      typeof policy.postingEnabled !== 'boolean' ||
      typeof policy.databasePostingEnabled !== 'boolean' ||
      typeof policy.emergencyReadOnly !== 'boolean' ||
      typeof policy.environmentReadOnly !== 'boolean'
    ) {
      throw new Error('COMMUNITY_RUNTIME_POLICY_UNAVAILABLE');
    }
    return policy as CommunityChatRuntimePolicy;
  }

  async function loadRuntimePolicy() {
    if (runtimeLoading.value) return;
    runtimeLoading.value = true;
    try {
      runtimePolicy.value = normalizeRuntimePolicy(await getCommunityChatAdminRuntimePolicy());
    } catch {
      runtimePolicy.value = null;
      message.error(t('communityChatModerationAdmin.runtimeLoadFailed'));
    } finally {
      runtimeLoading.value = false;
    }
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const pages = await Promise.all(
        REPORT_STATUSES.map(async (reportStatus) => {
          const isCurrent = reportStatus === status.value;
          const response = await getCommunityChatAdminReports({
            status: reportStatus,
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
      if (!current) throw new Error('COMMUNITY_REPORT_STATUS_UNAVAILABLE');
      if (!current.items.length && current.total > 0 && currentPage.value > 1) {
        currentPage.value = Math.max(1, Math.ceil(current.total / pageSize.value));
        current = normalizePage(
          await getCommunityChatAdminReports({
            status: status.value,
            page: currentPage.value,
            pageSize: pageSize.value,
          }),
        );
      }
      items.value = current.items;
      total.value = Number(current.total || 0);
    } catch {
      message.error(t('communityChatModerationAdmin.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  async function loadAll() {
    await Promise.all([load(), loadRuntimePolicy()]);
  }

  function handleStatusChange() {
    currentPage.value = 1;
    void load();
  }

  function handlePageChange(page: number) {
    currentPage.value = Math.max(1, Number(page) || 1);
    void load();
  }

  function handleSizeChange(_current: number, size: number) {
    currentPage.value = 1;
    pageSize.value = Math.max(1, Number(size) || 20);
    void load();
  }

  function openAction(item: CommunityChatReportItem) {
    selected.value = item;
    action.value = item.evidenceSnapshot?.authorRole === 'official' ? 'dismiss' : 'hide_message';
    durationMinutes.value = 1440;
    note.value = '';
    actionVisible.value = true;
  }

  function openRuntimePolicyDialog() {
    if (!runtimeCanToggle.value || !runtimePolicy.value) return;
    runtimeTargetPostingEnabled.value = !runtimePolicy.value.databasePostingEnabled;
    runtimeReason.value = '';
    runtimeVisible.value = true;
  }

  async function submitRuntimePolicy() {
    if (!runtimeVisible.value || runtimeSaving.value) return;
    const reason = runtimeReason.value.trim();
    if (!reason) {
      message.warning(t('communityChatModerationAdmin.runtimeReasonRequired'));
      return;
    }

    runtimeSaving.value = true;
    try {
      runtimePolicy.value = normalizeRuntimePolicy(
        await updateCommunityChatAdminRuntimePolicy({
          postingEnabled: runtimeTargetPostingEnabled.value,
          reason,
        }),
      );
      message.success(
        runtimeTargetPostingEnabled.value
          ? t('communityChatModerationAdmin.runtimeUpdatedDisable')
          : t('communityChatModerationAdmin.runtimeUpdatedEnable'),
      );
      runtimeVisible.value = false;
      runtimeReason.value = '';
    } catch {
      message.error(t('communityChatModerationAdmin.runtimeUpdateFailed'));
      await loadRuntimePolicy();
    } finally {
      runtimeSaving.value = false;
    }
  }

  async function submitAction() {
    if (!selected.value || saving.value) return;
    const reviewNote = note.value.trim();
    if (!reviewNote) {
      message.warning(t('communityChatModerationAdmin.noteRequired'));
      return;
    }

    saving.value = true;
    try {
      const response = await reviewCommunityChatAdminReport(selected.value.id, {
        action: action.value,
        note: reviewNote,
        durationMinutes: action.value === 'mute_author' ? durationMinutes.value : null,
      });
      if (response?.status !== 200) throw new Error('COMMUNITY_REPORT_ACTION_FAILED');
      message.success(t('communityChatModerationAdmin.actionSuccess'));
      actionVisible.value = false;
      selected.value = null;
      await load();
    } catch {
      message.error(t('communityChatModerationAdmin.actionFailed'));
    } finally {
      saving.value = false;
    }
  }

  onMounted(loadAll);
</script>

<style scoped lang="less">
  .community-moderation-admin__filter {
    width: 190px;
  }

  .community-moderation-admin__runtime-value {
    min-height: 24px;
    display: flex;
    align-items: center;
  }

  .community-moderation-admin__evidence,
  .community-moderation-admin__reason,
  .community-moderation-admin__reporter,
  .community-moderation-admin__status {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .community-moderation-admin__evidence-heading,
  .community-moderation-admin__mobile-heading,
  .community-moderation-admin__mobile-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .community-moderation-admin__evidence span:not(.community-moderation-admin__evidence-heading),
  .community-moderation-admin__reason span,
  .community-moderation-admin__status small {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
    line-height: 1.45;
  }

  .community-moderation-admin__evidence small,
  .community-moderation-admin__reason span,
  .community-moderation-admin__reporter time,
  .community-moderation-admin__status small {
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .community-moderation-admin__empty {
    min-height: 180px;
    margin: 0;
    display: grid;
    place-items: center;
    color: var(--sub-text-color);
    text-align: center;
  }

  .community-moderation-admin__mobile {
    min-height: 0;
    height: 100%;
    padding-right: 4px;
    overflow-y: auto;
  }

  .community-moderation-admin__mobile-content {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: var(--text-color);
    white-space: normal;
  }

  .community-moderation-admin__mobile-copy {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-moderation-admin__mobile-action {
    min-height: 42px;
    margin-top: 6px;
  }

  .community-moderation-admin__mobile-pagination {
    margin-top: 12px;
  }

  .community-moderation-admin__dialog {
    display: grid;
    gap: 11px;
    color: var(--text-color);
  }

  .community-moderation-admin__runtime-dialog {
    display: grid;
    gap: 12px;
    color: var(--text-color);
  }

  .community-moderation-admin__runtime-dialog > label {
    font-size: 13px;
    font-weight: 650;
  }

  .community-moderation-admin__runtime-description {
    margin: 0;
    padding: 11px 12px;
    border: 1px solid var(--chip-pending-border);
    border-left: 4px solid var(--warning-color, #b96b00);
    border-radius: 12px;
    background: var(--chip-pending-bg);
    line-height: 1.6;
  }

  .community-moderation-admin__runtime-audit-hint {
    margin: 0;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.55;
  }

  .community-moderation-admin__dialog > label {
    font-size: 13px;
    font-weight: 650;
  }

  .community-moderation-admin__dialog-evidence {
    padding: 11px 12px;
    display: grid;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-left: 4px solid var(--danger-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .community-moderation-admin__dialog-evidence > span {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .community-moderation-admin__dialog-evidence p,
  .community-moderation-admin__dialog-evidence small,
  .community-moderation-admin__dialog-warning {
    margin: 0;
    line-height: 1.55;
  }

  .community-moderation-admin__dialog-evidence small,
  .community-moderation-admin__dialog-warning {
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .community-moderation-admin__dialog-actions {
    margin-top: 3px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 960px) {
    .community-moderation-admin__filter {
      flex: 1 1 180px;
      width: auto;
    }

    :deep(.admin-data-page__toolbar-main) {
      flex-wrap: wrap;
    }

    .community-moderation-admin__mobile {
      height: auto;
      overflow: visible;
    }

    .community-moderation-admin__dialog-evidence > span {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    .community-moderation-admin__dialog-actions :deep(.b_btn) {
      min-height: 42px;
    }
  }
</style>
