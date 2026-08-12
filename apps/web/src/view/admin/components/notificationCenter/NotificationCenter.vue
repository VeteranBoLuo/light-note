<template>
  <AdminDataPage
    eyebrow="Admin / 通知"
    :title="t('notificationAdmin.inApp.title')"
    :subtitle="pageSubtitle"
    layout="scroll"
  >
    <template #actions>
      <BButton :loading="activeTab === 'in_app' && loading" @click="refreshActive">
        {{ t('notificationAdmin.refresh') }}
      </BButton>
    </template>
    <template #toolbar>
      <BTabs v-model:active-tab="activeTab" :options="tabOptions" variant="segment" class="nc-tabs" />
    </template>

    <template v-if="activeTab === 'in_app'">
      <!-- 概览 -->
      <div class="nc-stats">
        <div class="nc-stat">
          <SvgIcon class="nc-stat-icon" :src="icon.settings.notification" size="18" aria-hidden="true" />
          <b class="nc-stat-val">{{ stats.totalSent }}</b>
          <span class="nc-stat-label">{{ t('notificationAdmin.inApp.stats.sent') }}</span>
        </div>
        <div class="nc-stat">
          <SvgIcon class="nc-stat-icon" :src="icon.settings.notificationReadAll" size="18" aria-hidden="true" />
          <b class="nc-stat-val">{{ stats.totalRead }}</b>
          <span class="nc-stat-label">{{ t('notificationAdmin.inApp.stats.read') }}</span>
        </div>
        <div class="nc-stat">
          <SvgIcon class="nc-stat-icon" :src="icon.noteDetail.history" size="18" aria-hidden="true" />
          <b class="nc-stat-val">{{ stats.batches }}</b>
          <span class="nc-stat-label">{{ t('notificationAdmin.inApp.stats.batches') }}</span>
        </div>
        <div class="nc-stat">
          <SvgIcon class="nc-stat-icon" :src="icon.contextMenu.archive" size="18" aria-hidden="true" />
          <b class="nc-stat-val">{{ stats.totalRecalled }}</b>
          <span class="nc-stat-label">{{ t('notificationAdmin.inApp.stats.recalled') }}</span>
        </div>
      </div>

      <div class="nc-body">
        <!-- 发送 -->
        <section class="nc-card nc-compose">
          <h2 class="nc-card-title">{{ t('notificationAdmin.inApp.compose.title') }}</h2>

          <div class="nc-field">
            <label class="nc-label">{{ t('notificationAdmin.inApp.compose.recipient') }}</label>
            <div class="nc-seg">
              <BButton
                v-for="m in targetModes"
                :key="m.v"
                class="nc-seg-btn"
                :class="{ active: targetMode === m.v }"
                @click="targetMode = m.v"
              >
                {{ m.label }}
              </BButton>
            </div>
          </div>

          <!-- 指定用户:搜索 + 多选 -->
          <div v-if="targetMode === 'users'" class="nc-field">
            <label class="nc-label">{{ t('notificationAdmin.inApp.compose.chooseUsers') }}</label>
            <div class="nc-picker">
              <div v-if="selected.length" class="nc-chips">
                <span v-for="u in selected" :key="u.id" class="nc-chip">
                  {{ u.alias || u.email }}
                  <BButton
                    class="nc-chip-x"
                    size="small"
                    :aria-label="`移除收件人 ${u.alias || u.email}`"
                    @click="removeUser(u.id)"
                  >
                    ×
                  </BButton>
                </span>
              </div>
              <BInput
                v-model:value="searchKey"
                :placeholder="t('notificationAdmin.inApp.compose.searchUsers')"
                @input="onSearch"
              />
              <div v-if="searchKey && results.length" class="nc-results">
                <div
                  v-for="u in results"
                  :key="u.id"
                  class="nc-result"
                  :class="{ picked: isPicked(u.id) }"
                  @click="toggleUser(u)"
                >
                  <span class="nc-result-name">{{ u.alias || t('notificationAdmin.inApp.compose.unnamed') }}</span>
                  <span class="nc-result-mail">{{ u.email }}</span>
                  <span v-if="isPicked(u.id)" class="nc-result-tick">✓</span>
                </div>
              </div>
              <div v-else-if="searchKey && !searching && !results.length" class="nc-results-empty">
                {{ t('notificationAdmin.inApp.compose.noUsers') }}
              </div>
            </div>
          </div>

          <div class="nc-field">
            <label class="nc-label">{{ t('notificationAdmin.inApp.compose.type') }}</label>
            <BSelect v-model:value="form.type" :options="typeOptions" mode="single" style="width: 160px" />
          </div>

          <div class="nc-field">
            <label class="nc-label">{{ t('notificationAdmin.inApp.compose.subject') }}</label>
            <BInput
              v-model:value="form.title"
              :placeholder="t('notificationAdmin.inApp.compose.subjectPlaceholder')"
              :maxlength="60"
            />
          </div>

          <div class="nc-field">
            <label class="nc-label">{{ t('notificationAdmin.inApp.compose.content') }}</label>
            <BInput
              v-model:value="form.content"
              type="textarea"
              :rows="4"
              :placeholder="t('notificationAdmin.inApp.compose.contentPlaceholder')"
              :maxlength="500"
            />
          </div>

          <div class="nc-field">
            <label class="nc-label">{{ t('notificationAdmin.inApp.compose.link') }}</label>
            <BInput v-model:value="form.link" :placeholder="t('notificationAdmin.inApp.compose.linkPlaceholder')" />
          </div>

          <div class="nc-compose-foot">
            <span class="nc-target-hint">{{ targetHint }}</span>
            <BButton class="nc-send" type="primary" :loading="sending" @click="onSend">
              {{ sending ? t('notificationAdmin.inApp.compose.sending') : t('notificationAdmin.inApp.compose.send') }}
            </BButton>
          </div>
        </section>

        <!-- 记录 -->
        <section class="nc-card nc-history">
          <h2 class="nc-card-title">{{ t('notificationAdmin.inApp.history.title') }}</h2>
          <BTable
            :data="history"
            :columns="columns"
            :pagination="true"
            :total="total"
            :current-page="currentPage"
            :page-size="pageSize"
            :row-clickable="true"
            @row-click="onRowClick"
            @page-change="onPageChange"
            @size-change="onSizeChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'title'">
                <div class="nc-h-title" :class="{ recalled: Number(asBatch(record).recalled) === 1 }">
                  {{ asBatch(record).title }}
                </div>
                <div v-if="asBatch(record).content" class="nc-h-content">{{ asBatch(record).content }}</div>
              </template>
              <template v-else-if="column.key === 'type'">
                <span class="nc-type" :class="`t-${asBatch(record).type}`">{{
                  asBatch(record).type === 'system'
                    ? t('notificationAdmin.inApp.compose.system')
                    : t('notificationAdmin.inApp.compose.other')
                }}</span>
              </template>
              <template v-else-if="column.key === 'readRate'">
                <div class="nc-rate">
                  <div class="nc-rate-bar">
                    <div class="nc-rate-fill" :style="{ width: readPct(asBatch(record)) + '%' }"></div>
                  </div>
                  <span class="nc-rate-num">{{ asBatch(record).readCount }}/{{ asBatch(record).recipients }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'createTime'">
                <span class="nc-time">{{ fmtTime(asBatch(record).createTime) }}</span>
              </template>
              <template v-else-if="column.key === 'operation'">
                <BSpace class="nc-actions" :size="6" @click.stop>
                  <span v-if="Number(asBatch(record).recalled) === 1" class="nc-recalled-tag">
                    {{ t('notificationAdmin.inApp.history.recalled') }}
                  </span>
                  <BButton
                    v-else
                    class="nc-recall-btn"
                    size="small"
                    :loading="recallingBatchId === asBatch(record).batchId"
                    :disabled="Boolean(recallingBatchId)"
                    @click="onRecall(asBatch(record))"
                  >
                    {{ t('notificationAdmin.inApp.history.recall') }}
                  </BButton>
                  <BButton
                    class="nc-delete-btn"
                    type="danger"
                    size="small"
                    :loading="deletingBatchId === asBatch(record).batchId"
                    :disabled="Boolean(deletingBatchId)"
                    @click="onDelete(asBatch(record))"
                  >
                    {{ t('notificationAdmin.delete') }}
                  </BButton>
                </BSpace>
              </template>
            </template>
          </BTable>
        </section>
      </div>

      <BModal
        v-model:visible="recipientsVisible"
        :title="recipientsTitle"
        width="min(560px, 94vw)"
        :show-footer="false"
      >
        <div class="nc-recipients">
          <div class="nc-recipients-head">
            <span class="nc-recipients-count">{{
              t('notificationAdmin.inApp.recipients.readCount', {
                read: recipientsRead,
                total: recipientsList.length,
              })
            }}</span>
          </div>
          <div v-if="recipientsLoading" class="nc-recipients-empty">
            {{ t('notificationAdmin.inApp.recipients.loading') }}
          </div>
          <div v-else-if="!recipientsList.length" class="nc-recipients-empty">
            {{ t('notificationAdmin.inApp.recipients.empty') }}
          </div>
          <div v-else class="nc-recipients-list">
            <div v-for="r in recipientsList" :key="r.userId" class="nc-recipient">
              <span class="nc-recipient-main">
                <span class="nc-recipient-name">{{ r.alias || t('notificationAdmin.inApp.compose.unnamed') }}</span>
                <span class="nc-recipient-mail">{{ r.email || r.userId }}</span>
              </span>
              <span class="nc-recipient-meta">
                <span class="nc-recipient-status" :class="Number(r.isRead) === 1 ? 'is-read' : 'is-unread'">
                  {{
                    Number(r.isRead) === 1
                      ? t('notificationAdmin.inApp.recipients.read')
                      : t('notificationAdmin.inApp.recipients.unread')
                  }}
                </span>
                <span v-if="Number(r.isRead) === 1 && r.readTime" class="nc-recipient-time">{{
                  fmtTime(r.readTime)
                }}</span>
              </span>
            </div>
          </div>
        </div>
      </BModal>
    </template>

    <EmailDeliveryPanel v-else ref="emailPanelRef" />

    <AdminRiskActionModal
      v-model:visible="riskVisible"
      :title="riskConfig.title"
      :impact="riskConfig.impact"
      :confirm-phrase="riskConfig.phrase"
      :confirm-label="riskConfig.label"
      :loading="riskLoading"
      @confirm="confirmRiskAction"
    />
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiQueryPost } from '@/http/request.ts';
  import notificationApi from '@/api/notificationApi.ts';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import EmailDeliveryPanel from './EmailDeliveryPanel.vue';

  const { t, locale } = useI18n();
  const activeTab = ref<'in_app' | 'email'>('in_app');
  const emailPanelRef = ref<InstanceType<typeof EmailDeliveryPanel> | null>(null);
  const tabOptions = computed(() => [
    { key: 'in_app', label: t('notificationAdmin.tabs.inApp') },
    { key: 'email', label: t('notificationAdmin.tabs.email') },
  ]);
  const pageSubtitle = computed(() =>
    activeTab.value === 'email' ? t('notificationAdmin.email.subtitle') : t('notificationAdmin.inApp.subtitle'),
  );

  interface UserLite {
    id: string;
    alias: string;
    email: string;
    role: string;
  }
  interface Batch {
    batchId: string;
    type: string;
    title: string;
    content: string | null;
    recipients: number;
    readCount: number;
    recalled: number;
    createTime: string;
  }
  interface Recipient {
    userId: string;
    isRead: number;
    readTime: string | null;
    alias: string | null;
    email: string | null;
    role: string | null;
  }

  const loading = ref(false);
  const stats = ref({ totalSent: 0, totalRead: 0, batches: 0, totalRecalled: 0 });

  // —— 发送表单 ——
  const targetModes = computed<{ v: 'all' | 'users'; label: string }[]>(() => [
    { v: 'all', label: t('notificationAdmin.inApp.compose.allUsers') },
    { v: 'users', label: t('notificationAdmin.inApp.compose.selectedUsers') },
  ]);
  const targetMode = ref<'all' | 'users'>('all');
  const typeOptions = computed(() => [
    { value: 'system', label: t('notificationAdmin.inApp.compose.system') },
    { value: 'other', label: t('notificationAdmin.inApp.compose.other') },
  ]);
  const form = ref<{ type: string; title: string; content: string; link: string }>({
    type: 'system',
    title: '',
    content: '',
    link: '',
  });

  // 用户搜索 + 多选
  const searchKey = ref('');
  const results = ref<UserLite[]>([]);
  const selected = ref<UserLite[]>([]);
  const searching = ref(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function onSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    const key = searchKey.value.trim();
    if (!key) {
      results.value = [];
      return;
    }
    searching.value = true;
    searchTimer = setTimeout(async () => {
      try {
        const res = await apiQueryPost('/api/user/getUserList', {
          currentPage: 1,
          pageSize: 8,
          filters: { key },
        });
        results.value = (res?.data?.items || []).filter((u: UserLite) => u.role !== 'visitor');
      } catch {
        results.value = [];
      } finally {
        searching.value = false;
      }
    }, 400);
  }
  function isPicked(id: string) {
    return selected.value.some((u) => u.id === id);
  }
  function toggleUser(u: UserLite) {
    if (isPicked(u.id)) removeUser(u.id);
    else selected.value.push(u);
  }
  function removeUser(id: string) {
    selected.value = selected.value.filter((u) => u.id !== id);
  }

  const targetHint = computed(() => {
    if (targetMode.value === 'all') return t('notificationAdmin.inApp.compose.allHint');
    return selected.value.length
      ? t('notificationAdmin.inApp.compose.selectedHint', { count: selected.value.length })
      : t('notificationAdmin.inApp.compose.selectHint');
  });

  const sending = ref(false);
  type RiskActionKind = 'send' | 'recall' | 'archive';
  type RiskPayload = { reason: string; confirmed: true; confirmText: string };
  const riskVisible = ref(false);
  const riskActionKind = ref<RiskActionKind>('send');
  const pendingBatch = ref<Batch | null>(null);
  const recallingBatchId = ref('');
  const deletingBatchId = ref('');
  const riskLoading = computed(
    () => sending.value || Boolean(recallingBatchId.value) || Boolean(deletingBatchId.value),
  );
  const riskConfig = computed(() => {
    if (riskActionKind.value === 'recall') {
      return {
        title: t('notificationAdmin.inApp.history.recallTitle'),
        impact: t('notificationAdmin.inApp.history.recallConfirm', { title: pendingBatch.value?.title || '' }),
        phrase: '确认撤回通知',
        label: t('notificationAdmin.inApp.history.recall'),
      };
    }
    if (riskActionKind.value === 'archive') {
      return {
        title: t('notificationAdmin.deleteTitle'),
        impact: t('notificationAdmin.deleteConfirm'),
        phrase: '确认归档通知',
        label: t('notificationAdmin.delete'),
      };
    }
    const target =
      targetMode.value === 'all'
        ? t('notificationAdmin.inApp.compose.allHint')
        : t('notificationAdmin.inApp.compose.selectedHint', { count: selected.value.length });
    return {
      title: t('notificationAdmin.inApp.compose.confirmTitle'),
      impact: `${t('notificationAdmin.inApp.compose.confirmContent')} ${target}`,
      phrase: '确认发送通知',
      label: t('notificationAdmin.inApp.compose.send'),
    };
  });

  async function doSend(action: RiskPayload) {
    sending.value = true;
    const payload: any = {
      type: form.value.type,
      title: form.value.title.trim(),
      content: form.value.content.trim() || undefined,
      link: form.value.link.trim() || undefined,
      ...action,
    };
    if (targetMode.value === 'all') payload.toAll = true;
    else payload.userIds = selected.value.map((u) => u.id);

    try {
      const res = await notificationApi.sendNotification(payload);
      if (res.status === 200) {
        riskVisible.value = false;
        message.success(
          `${t('notificationAdmin.inApp.compose.sent', { count: res.data?.sent ?? 0 })} · 审计 ${String(
            res.data?.auditId || '',
          ).slice(0, 8)}`,
        );
        // 重置内容,保留类型/模式
        form.value.title = '';
        form.value.content = '';
        form.value.link = '';
        selected.value = [];
        searchKey.value = '';
        results.value = [];
        refreshAll();
      }
    } finally {
      sending.value = false;
    }
  }
  function onSend() {
    if (sending.value) return;
    if (!form.value.title.trim()) {
      message.warning(t('notificationAdmin.inApp.compose.subjectRequired'));
      return;
    }
    if (targetMode.value === 'users' && !selected.value.length) {
      message.warning(t('notificationAdmin.inApp.compose.selectHint'));
      return;
    }
    riskActionKind.value = 'send';
    pendingBatch.value = null;
    riskVisible.value = true;
  }

  // —— 发送记录 ——
  const history = ref<Batch[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const columns = computed(() => [
    { title: t('notificationAdmin.inApp.history.notification'), key: 'title', width: '1fr' },
    { title: t('notificationAdmin.inApp.history.type'), key: 'type', width: '72px' },
    { title: t('notificationAdmin.inApp.history.readRate'), key: 'readRate', width: '150px' },
    { title: t('notificationAdmin.inApp.history.sentAt'), key: 'createTime', width: '160px' },
    { title: t('notificationAdmin.inApp.history.operation'), key: 'operation', width: '138px' },
  ]);

  function asBatch(record: unknown): Batch {
    return record as Batch;
  }

  function readPct(r: Batch) {
    return r.recipients ? Math.round((Number(r.readCount) / Number(r.recipients)) * 100) : 0;
  }
  function fmtTime(ts: string) {
    if (!ts) return '';
    const d = new Date(String(ts).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString(locale.value === 'en-US' ? 'en-US' : 'zh-CN', { hour12: false });
  }

  async function loadHistory() {
    loading.value = true;
    try {
      const res = await notificationApi.getAdminList({ currentPage: currentPage.value, pageSize: pageSize.value });
      if (res?.status === 200 && res.data) {
        history.value = res.data.items || [];
        total.value = res.data.total || 0;
      }
    } finally {
      loading.value = false;
    }
  }
  async function loadStats() {
    const res = await notificationApi.getAdminStats();
    if (res?.status === 200 && res.data) stats.value = res.data;
  }
  function refreshAll() {
    loadStats();
    loadHistory();
  }
  function refreshActive() {
    if (activeTab.value === 'email') emailPanelRef.value?.refresh();
    else refreshAll();
  }
  function onPageChange(p: number) {
    currentPage.value = p;
    loadHistory();
  }
  function onSizeChange(s: number) {
    pageSize.value = s;
    currentPage.value = 1;
    loadHistory();
  }
  function onRecall(record: Batch) {
    if (riskLoading.value) return;
    pendingBatch.value = record;
    riskActionKind.value = 'recall';
    riskVisible.value = true;
  }
  function onDelete(record: Batch) {
    if (riskLoading.value) return;
    pendingBatch.value = record;
    riskActionKind.value = 'archive';
    riskVisible.value = true;
  }

  async function confirmRiskAction(action: RiskPayload) {
    const batch = pendingBatch.value;
    if (riskActionKind.value === 'send') {
      await doSend(action);
      return;
    }
    if (!batch) return;
    if (riskActionKind.value === 'recall') {
      recallingBatchId.value = batch.batchId;
      try {
        const res = await notificationApi.recallNotification(batch.batchId, action);
        if (res.status === 200) {
          riskVisible.value = false;
          message.success(
            `${t('notificationAdmin.inApp.history.recallSuccess', {
              count: res.data?.recalled ?? 0,
            })} · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`,
          );
          refreshAll();
        }
      } finally {
        recallingBatchId.value = '';
      }
      return;
    }
    deletingBatchId.value = batch.batchId;
    try {
      const res = await notificationApi.deleteAdminNotification(batch.batchId, action);
      if (res.status === 200) {
        riskVisible.value = false;
        message.success(
          `${t('notificationAdmin.deleted', { count: res.data?.archived ?? 0 })} · 审计 ${String(
            res.data?.auditId || '',
          ).slice(0, 8)}`,
        );
        if (history.value.length === 1 && currentPage.value > 1) currentPage.value -= 1;
        refreshAll();
      }
    } finally {
      deletingBatchId.value = '';
    }
  }

  // —— 接收明细弹框(发给谁 / 谁已读谁未读) ——
  const recipientsVisible = ref(false);
  const recipientsLoading = ref(false);
  const recipientsList = ref<Recipient[]>([]);
  const recipientsBatch = ref<Batch | null>(null);
  const recipientsRead = ref(0);
  const recipientsTitle = computed(() =>
    recipientsBatch.value
      ? t('notificationAdmin.inApp.recipients.detailTitle', { title: recipientsBatch.value.title })
      : t('notificationAdmin.inApp.recipients.title'),
  );
  async function openRecipients(batch: Batch) {
    recipientsBatch.value = batch;
    recipientsVisible.value = true;
    recipientsLoading.value = true;
    recipientsList.value = [];
    try {
      const res = await notificationApi.getBatchRecipients(batch.batchId);
      if (res?.status === 200 && res.data) {
        recipientsList.value = res.data.items || [];
        recipientsRead.value = Number(res.data.readCount || 0);
      }
    } catch {
      message.warning(t('notificationAdmin.inApp.recipients.loadFailed'));
    } finally {
      recipientsLoading.value = false;
    }
  }
  // 点击整行(操作按钮已 @click.stop 排除)查看接收明细
  function onRowClick(item: unknown) {
    openRecipients(asBatch(item));
  }

  onMounted(() => {
    refreshAll();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';
  @import '@/assets/css/admin-mixins.less';
  /* 页面骨架与标题、刷新按钮已交给 AdminDataPage（原 .nc-page/.nc-hero/.nc-title/
     .nc-sub/.nc-refresh 全部删除；刷新按钮改用 BButton 默认外观）。
     Tab 栏放在 toolbar 槽内，间距由容器统一给。 */
  .nc-tabs {
    width: max-content;
  }

  /* 概览 */
  .nc-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }
  .nc-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: var(--workbench-subcard-bg);
  }
  .nc-stat-icon {
    font-size: 18px;
  }
  .nc-stat-val {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .nc-stat-label {
    font-size: 12px;
    color: var(--desc-color);
  }

  /* body 两栏 */
  .nc-body {
    display: flex;
    gap: 18px;
    align-items: flex-start;
  }
  .nc-compose {
    flex: 0 0 380px;
    width: 380px;
  }
  .nc-history {
    flex: 1 1 auto;
    min-width: 0;
  }
  @media (max-width: @admin-bp-desktop) {
    .nc-body {
      flex-direction: column;
    }
    .nc-compose {
      flex: 1 1 auto;
      width: 100%;
    }
    .nc-history {
      width: 100%;
    }
  }

  .nc-card {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    border-radius: 14px;
    background: var(--workbench-subcard-bg);
    padding: 18px;
    box-sizing: border-box;
  }
  .nc-card-title {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 700;
  }

  /* 表单 */
  .nc-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .nc-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--desc-color);
  }
  .nc-seg {
    display: flex;
    gap: 8px;
  }
  .nc-seg-btn {
    flex: 1 1 0;
    padding: 8px 12px;
    border-radius: 9px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nc-seg-btn.active {
    border-color: transparent;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 76%, #4b46cc));
    color: #fff;
  }
  /* 用户选择 */
  .nc-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .nc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .nc-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px 3px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    color: var(--primary-color);
    font-size: 12px;
  }
  .nc-chip-x {
    .admin-focus-ring(4px);

    padding: 0 2px;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    font-style: normal;
    font-size: 14px;
    line-height: 1;
    opacity: 0.7;
  }
  .nc-chip-x:hover {
    opacity: 1;
  }
  .nc-results {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    border-radius: 9px;
    overflow: hidden;
    max-height: 220px;
    overflow-y: auto;
  }
  .nc-result {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 11px;
    cursor: pointer;
    font-size: 13px;
  }
  .nc-result:hover {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  }
  .nc-result.picked {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .nc-result-name {
    font-weight: 500;
  }
  .nc-result-mail {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--desc-color);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nc-result-tick {
    color: var(--primary-color);
    font-weight: 700;
  }
  .nc-results-empty {
    font-size: 12.5px;
    color: var(--desc-color);
    padding: 8px 2px;
  }

  .nc-compose-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 4px;
  }
  .nc-target-hint {
    font-size: 12px;
    color: var(--desc-color);
  }
  .nc-send {
    padding: 9px 26px;
    border-radius: 9px;
    border: none;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 76%, #4b46cc));
    box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--primary-color) 80%, transparent);
  }
  .nc-send:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* 历史表格单元 */
  .nc-h-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }
  .nc-h-title.recalled {
    text-decoration: line-through;
    color: var(--desc-color);
  }
  .nc-h-content {
    font-size: 12px;
    color: var(--desc-color);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nc-type {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .nc-type.t-system {
    color: var(--success-color);
    background: color-mix(in srgb, var(--success-color) 14%, transparent);
  }
  /* 与上面的 t-system 对齐用主题变量。原先硬编码的 #a855f7 深浅主题同色，
     且在白底 3.96:1、深色卡片 3.20:1，小字号标签两套主题都读不清。 */
  .nc-type.t-other {
    color: var(--info-color);
    background: color-mix(in srgb, var(--info-color) 14%, transparent);
  }
  .nc-rate {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nc-rate-bar {
    flex: 1 1 auto;
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .nc-rate-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), #22d3ee);
  }
  .nc-rate-num {
    font-size: 11.5px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }
  .nc-time {
    font-size: 12px;
    color: var(--desc-color);
  }
  .nc-recall-btn {
    border: 1px solid color-mix(in srgb, var(--danger-color) 45%, transparent);
    background: transparent;
    color: var(--danger-color);
  }
  .nc-recall-btn:hover {
    background: color-mix(in srgb, var(--danger-color) 10%, transparent);
  }
  .nc-recalled-tag {
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .nc-delete-btn {
    min-width: 48px;
  }

  /* 接收明细弹框 */
  .nc-recipients {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .nc-recipients-count {
    font-size: 13px;
    color: var(--text-color);
  }
  .nc-recipients-count b {
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }
  .nc-recipients-empty {
    padding: 22px;
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
  }
  .nc-recipients-list {
    display: flex;
    flex-direction: column;
    max-height: min(420px, 58vh);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .nc-recipient {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .nc-recipient:last-child {
    border-bottom: none;
  }
  .nc-recipient-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .nc-recipient-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color);
  }
  .nc-recipient-mail {
    font-size: 12px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nc-recipient-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
  }
  .nc-recipient-status {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .nc-recipient-status.is-read {
    color: var(--success-color);
    background: color-mix(in srgb, var(--success-color) 14%, transparent);
  }
  .nc-recipient-status.is-unread {
    color: var(--desc-color);
    background: color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .nc-recipient-time {
    font-size: 11.5px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>
