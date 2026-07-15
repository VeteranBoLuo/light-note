<template>
  <div class="nc-page">
    <header class="nc-hero">
      <div>
        <h1 class="nc-title">通知中心</h1>
        <p class="nc-sub">统一下发系统通知，查看送达与已读，支持撤回</p>
      </div>
      <button class="nc-refresh" @click="refreshAll" :disabled="loading">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        刷新
      </button>
    </header>

    <!-- 概览 -->
    <div class="nc-stats">
      <div class="nc-stat">
        <span class="nc-stat-icon">📨</span>
        <b class="nc-stat-val">{{ stats.totalSent }}</b>
        <span class="nc-stat-label">累计下发</span>
      </div>
      <div class="nc-stat">
        <span class="nc-stat-icon">👀</span>
        <b class="nc-stat-val">{{ stats.totalRead }}</b>
        <span class="nc-stat-label">已读条数</span>
      </div>
      <div class="nc-stat">
        <span class="nc-stat-icon">🗂️</span>
        <b class="nc-stat-val">{{ stats.batches }}</b>
        <span class="nc-stat-label">发送批次</span>
      </div>
      <div class="nc-stat">
        <span class="nc-stat-icon">↩️</span>
        <b class="nc-stat-val">{{ stats.totalRecalled }}</b>
        <span class="nc-stat-label">已撤回</span>
      </div>
    </div>

    <div class="nc-body">
      <!-- 发送 -->
      <section class="nc-card nc-compose">
        <h2 class="nc-card-title">发送通知</h2>

        <div class="nc-field">
          <label class="nc-label">接收人</label>
          <div class="nc-seg">
            <button v-for="m in targetModes" :key="m.v" class="nc-seg-btn" :class="{ active: targetMode === m.v }" @click="targetMode = m.v">
              {{ m.label }}
            </button>
          </div>
        </div>

        <!-- 指定用户:搜索 + 多选 -->
        <div v-if="targetMode === 'users'" class="nc-field">
          <label class="nc-label">选择用户</label>
          <div class="nc-picker">
            <div v-if="selected.length" class="nc-chips">
              <span v-for="u in selected" :key="u.id" class="nc-chip">
                {{ u.alias || u.email }}
                <i class="nc-chip-x" @click="removeUser(u.id)">×</i>
              </span>
            </div>
            <b-input v-model:value="searchKey" placeholder="搜索昵称 / 邮箱" @input="onSearch" />
            <div v-if="searchKey && results.length" class="nc-results">
              <div
                v-for="u in results"
                :key="u.id"
                class="nc-result"
                :class="{ picked: isPicked(u.id) }"
                @click="toggleUser(u)"
              >
                <span class="nc-result-name">{{ u.alias || '未命名' }}</span>
                <span class="nc-result-mail">{{ u.email }}</span>
                <span v-if="isPicked(u.id)" class="nc-result-tick">✓</span>
              </div>
            </div>
            <div v-else-if="searchKey && !searching && !results.length" class="nc-results-empty">无匹配用户</div>
          </div>
        </div>

        <div class="nc-field">
          <label class="nc-label">类型</label>
          <b-select v-model:value="form.type" :options="typeOptions" mode="single" style="width: 160px" />
        </div>

        <div class="nc-field">
          <label class="nc-label">标题</label>
          <b-input v-model:value="form.title" placeholder="通知标题(必填)" :maxlength="60" />
        </div>

        <div class="nc-field">
          <label class="nc-label">内容</label>
          <textarea v-model="form.content" class="nc-textarea" rows="4" placeholder="通知内容(可选)" maxlength="500"></textarea>
        </div>

        <div class="nc-field">
          <label class="nc-label">跳转链接</label>
          <b-input v-model:value="form.link" placeholder="点击通知后跳转的站内路径,如 /growth(可选)" />
        </div>

        <div class="nc-compose-foot">
          <span class="nc-target-hint">{{ targetHint }}</span>
          <button class="nc-send" :disabled="sending" @click="onSend">{{ sending ? '发送中…' : '发送' }}</button>
        </div>
      </section>

      <!-- 记录 -->
      <section class="nc-card nc-history">
        <h2 class="nc-card-title">发送记录</h2>
        <BTable
          :data="history"
          :columns="columns"
          :pagination="true"
          :total="total"
          :current-page="currentPage"
          :page-size="pageSize"
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
                asBatch(record).type === 'system' ? '系统' : '其他'
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
              <BSpace class="nc-actions" :size="6">
                <span v-if="Number(asBatch(record).recalled) === 1" class="nc-recalled-tag">已撤回</span>
                <BButton v-else class="nc-recall-btn" size="small" @click="onRecall(asBatch(record))">撤回</BButton>
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
  </div>
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
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();

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

  const loading = ref(false);
  const stats = ref({ totalSent: 0, totalRead: 0, batches: 0, totalRecalled: 0 });

  // —— 发送表单 ——
  const targetModes: { v: 'all' | 'users'; label: string }[] = [
    { v: 'all', label: '全体用户' },
    { v: 'users', label: '指定用户' },
  ];
  const targetMode = ref<'all' | 'users'>('all');
  const typeOptions = [
    { value: 'system', label: '系统通知' },
    { value: 'other', label: '其他' },
  ];
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
    if (targetMode.value === 'all') return '将发送给全体注册用户';
    return selected.value.length ? `已选 ${selected.value.length} 位用户` : '请先选择接收用户';
  });

  const sending = ref(false);
  function doSend() {
    sending.value = true;
    const payload: any = {
      type: form.value.type,
      title: form.value.title.trim(),
      content: form.value.content.trim() || undefined,
      link: form.value.link.trim() || undefined,
    };
    if (targetMode.value === 'all') payload.toAll = true;
    else payload.userIds = selected.value.map((u) => u.id);

    notificationApi
      .sendNotification(payload)
      .then((res) => {
        if (res.status === 200) {
          message.success(`已发送给 ${res.data?.sent ?? 0} 人`);
          recordOperation({ module: '通知中心', operation: `发送通知【${payload.title}】给 ${res.data?.sent ?? 0} 人` });
          // 重置内容,保留类型/模式
          form.value.title = '';
          form.value.content = '';
          form.value.link = '';
          selected.value = [];
          searchKey.value = '';
          results.value = [];
          refreshAll();
        }
      })
      .finally(() => {
        sending.value = false;
      });
  }
  function onSend() {
    if (sending.value) return;
    if (!form.value.title.trim()) {
      message.warning('请填写通知标题');
      return;
    }
    if (targetMode.value === 'users' && !selected.value.length) {
      message.warning('请先选择接收用户');
      return;
    }
    if (targetMode.value === 'all') {
      Alert.alert({
        title: '确认群发',
        content: '将向全体注册用户发送该通知，确认发送？',
        onOk() {
          doSend();
        },
      });
    } else {
      doSend();
    }
  }

  // —— 发送记录 ——
  const history = ref<Batch[]>([]);
  const total = ref(0);
  const currentPage = ref(1);
  const pageSize = ref(10);
  const columns = [
    { title: '通知', key: 'title', width: '1fr' },
    { title: '类型', key: 'type', width: '72px' },
    { title: '已读率', key: 'readRate', width: '150px' },
    { title: '发送时间', key: 'createTime', width: '160px' },
    { title: '操作', key: 'operation', width: '138px' },
  ];

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
    return d.toLocaleString('zh-CN', { hour12: false });
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
    Alert.alert({
      title: '撤回通知',
      content: `确认撤回「${record.title}」？撤回后所有接收者将不再看到该通知。`,
      onOk() {
        notificationApi.recallNotification(record.batchId).then((res) => {
          if (res.status === 200) {
            message.success(`已撤回(${res.data?.recalled ?? 0} 条)`);
            recordOperation({ module: '通知中心', operation: `撤回通知【${record.title}】` });
            refreshAll();
          }
        });
      },
    });
  }
  const deletingBatchId = ref('');
  function onDelete(record: Batch) {
    if (deletingBatchId.value) return;
    Alert.alert({
      title: t('notificationAdmin.deleteTitle'),
      content: t('notificationAdmin.deleteConfirm'),
      okText: t('notificationAdmin.delete'),
      onOk() {
        deletingBatchId.value = record.batchId;
        notificationApi
          .deleteAdminNotification(record.batchId)
          .then((res) => {
            if (res.status === 200) {
              message.success(t('notificationAdmin.deleted', { count: res.data?.deleted ?? 0 }));
              recordOperation({ module: '通知中心', operation: `删除通知【${record.title}】` });
              if (history.value.length === 1 && currentPage.value > 1) currentPage.value -= 1;
              refreshAll();
            }
          })
          .finally(() => {
            deletingBatchId.value = '';
          });
      },
    });
  }

  onMounted(() => {
    recordOperation({ module: '通知中心', operation: '查看通知中心' });
    refreshAll();
  });
</script>

<style lang="less" scoped>
  .nc-page {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 22px 24px 48px;
    background: var(--background-color);
    color: var(--text-color);
  }
  .nc-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .nc-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
  }
  .nc-sub {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--desc-color);
  }
  .nc-refresh {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent);
    background: var(--workbench-subcard-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
  }
  .nc-refresh:hover:not(:disabled) {
    color: var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
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
  @media (max-width: 1000px) {
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
  .nc-textarea {
    width: 100%;
    box-sizing: border-box;
    border-radius: 9px;
    padding: 9px 11px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    color: var(--text-color);
    font-family: inherit;
    font-size: 13px;
    resize: vertical;
  }
  .nc-textarea:focus {
    outline: none;
    border-color: var(--primary-color);
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
    color: #16a34a;
    background: color-mix(in srgb, #16a34a 14%, transparent);
  }
  .nc-type.t-other {
    color: #a855f7;
    background: color-mix(in srgb, #a855f7 14%, transparent);
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
    border: 1px solid color-mix(in srgb, #ef4444 45%, transparent);
    background: transparent;
    color: #ef4444;
  }
  .nc-recall-btn:hover {
    background: color-mix(in srgb, #ef4444 10%, transparent);
  }
  .nc-recalled-tag {
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .nc-delete-btn {
    min-width: 48px;
  }
</style>
