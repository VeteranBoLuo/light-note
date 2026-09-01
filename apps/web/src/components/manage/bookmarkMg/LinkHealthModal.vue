<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.healthCheck')" :show-footer="false" width="480px">
    <div class="lh">
      <p class="lh-desc">{{ $t('bookmarkMg.healthDesc') }}</p>

      <div class="lh-bar">
        <div class="lh-stats">
          <span>{{ $t('bookmarkMg.healthProgress', { checked: progressChecked, total: progressTotal }) }}</span>
          <span v-if="summary.suspect.length" class="lh-dead-n"
            >· {{ $t('bookmarkMg.healthSuspectCount', { n: summary.suspect.length }) }}</span
          >
          <small v-if="running">{{ $t('bookmarkMg.healthContinueInBackground') }}</small>
        </div>
        <b-space>
          <b-button
            size="small"
            :disabled="running || starting || resetting || summary.checked === 0"
            @click="resetCheck"
          >
            {{ $t('bookmarkMg.healthReset') }}
          </b-button>
          <b-button
            size="small"
            type="primary"
            :loading="running || starting"
            :disabled="running || starting"
            @click="startCheck"
          >
            {{
              running
                ? $t('bookmarkMg.healthChecking')
                : allChecked
                  ? $t('bookmarkMg.healthRecheck')
                  : $t('bookmarkMg.healthStartAll')
            }}
          </b-button>
        </b-space>
      </div>

      <BProgress
        v-if="running"
        :percent="progressPercent"
        :aria-label="$t('bookmarkMg.healthProgress', { checked: progressChecked, total: progressTotal })"
        show-info
      />

      <div v-if="!running && !summary.suspect.length && summary.checked > 0" class="lh-empty"
        >✅ {{ $t('bookmarkMg.healthNoDead') }}</div
      >

      <template v-if="summary.suspect.length">
        <p class="lh-hint">{{ $t('bookmarkMg.healthSuspectHint') }}</p>
        <div v-auto-scrollbar class="lh-list">
          <div v-for="d in summary.suspect" :key="d.id" class="lh-item">
            <div class="lh-item-main">
              <a class="lh-item-name" :href="normalizeUrl(d.url) || undefined" target="_blank" rel="noopener"
                >🔗 {{ d.name }}</a
              >
              <div class="lh-item-url">{{ d.url }}</div>
            </div>
            <div class="lh-item-actions">
              <BButton size="small" class="lh-act" :disabled="ignoring === d.id" @click="markNormal(d.id)">
                {{ $t('bookmarkMg.healthMarkNormal') }}
              </BButton>
              <BButton
                size="small"
                class="lh-act snap"
                @click="viewSnapshot(d.id)"
                v-click-log="{ module: '书签管理', operation: `从死链体检查看网页存档【${d.name}】` }"
              >
                {{ d.hasSnapshot ? $t('bookmarkMg.healthViewSnapshot') : $t('bookmarkMg.snapshot') }}
              </BButton>
            </div>
          </div>
        </div>
      </template>
    </div>
  </BModal>

  <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapId" />
</template>

<script lang="ts" setup>
  import { computed, ref, watch, onUnmounted } from 'vue';
  import { apiBaseGet, apiBasePost } from '@/http/request.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { resolveBookmarkUrlInput } from '@lightnote/shared';

  const visible = defineModel<boolean>('visible');

  interface SuspectItem {
    id: string;
    name: string;
    url: string;
    note: string;
    hasSnapshot: boolean;
  }
  interface HealthScan {
    status: 'queued' | 'running' | 'succeeded' | 'completed_with_errors' | 'failed';
    running: boolean;
    total: number;
    processed: number;
  }
  interface HealthSummary {
    total: number;
    checked: number;
    running: boolean;
    runStatus?: string;
    scan: HealthScan | null;
    suspect: SuspectItem[];
  }
  const summary = ref<HealthSummary>({
    total: 0,
    checked: 0,
    running: false,
    scan: null,
    suspect: [],
  });
  const starting = ref(false);
  const resetting = ref(false);
  const ignoring = ref('');
  const snapVisible = ref(false);
  const snapId = ref('');
  let poller: ReturnType<typeof setInterval> | null = null;

  const running = computed(() => Boolean(summary.value.scan?.running || summary.value.running));
  const progressTotal = computed(() => Number(summary.value.scan?.total ?? summary.value.total));
  const progressChecked = computed(() => Number(summary.value.scan?.processed ?? summary.value.checked));
  const progressPercent = computed(() =>
    progressTotal.value > 0 ? (progressChecked.value / progressTotal.value) * 100 : 0,
  );
  const allChecked = computed(
    () =>
      ['succeeded', 'completed_with_errors', 'failed'].includes(String(summary.value.scan?.status || '')) ||
      (summary.value.total > 0 && summary.value.checked >= summary.value.total),
  );

  function normalizeUrl(u: string) {
    return resolveBookmarkUrlInput(u, { allowTextExtraction: false }).canonicalUrl;
  }
  function applySummary(d: any) {
    summary.value = {
      total: Number(d.total || 0),
      checked: Number(d.checked || 0),
      running: Boolean(d.running),
      runStatus: d.runStatus,
      scan: d.scan || null,
      suspect: d.suspect || [],
    };
  }
  async function loadSummary() {
    const res = await apiBaseGet('/api/bookmark/health');
    if (res?.status === 200 && res.data) applySummary(res.data);
  }
  function stopPoll() {
    if (poller) {
      clearInterval(poller);
      poller = null;
    }
  }
  // 全量检测：创建或复用持久任务；弹窗只轮询进度，关闭弹窗不会中止 Worker。
  async function startCheck() {
    if (starting.value || running.value) return;
    const isRecheck = allChecked.value;
    starting.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/health/checkAll');
      if (res?.status === 200) {
        recordOperation({ module: '书签管理', operation: isRecheck ? '重新开始死链体检' : '开始死链体检' });
        await loadSummary();
        startPolling();
      }
    } finally {
      starting.value = false;
    }
  }
  // 重置:清空体检记录,回到 0/total,从头重新检测
  async function resetCheck() {
    if (resetting.value || running.value) return;
    resetting.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/health/reset');
      if (res?.status === 200 && res.data) {
        applySummary(res.data);
        recordOperation({ module: '书签管理', operation: '重置死链体检记录成功' });
      }
    } finally {
      resetting.value = false;
    }
  }
  // 标记正常:消除误报(SPA/需登录等浏览器能开的),本地即时移除 + 后端置 alive
  async function markNormal(id: string) {
    if (ignoring.value) return;
    const bookmarkName = summary.value.suspect.find((item) => item.id === id)?.name || id;
    ignoring.value = id;
    try {
      const res = await apiBasePost('/api/bookmark/health/ignore', { id });
      if (res?.status === 200) {
        summary.value.suspect = summary.value.suspect.filter((s) => s.id !== id);
        recordOperation({ module: '书签管理', operation: `死链体检标记正常成功【${bookmarkName}】` });
      }
    } finally {
      ignoring.value = '';
    }
  }
  function viewSnapshot(id: string) {
    snapId.value = id;
    snapVisible.value = true;
  }

  watch(visible, (v) => {
    if (v) {
      loadSummary().then(() => {
        if (summary.value.running && !poller) startPolling(); // 打开时若后台仍在跑,接着轮询
      });
    } else {
      stopPoll();
    }
  });
  function startPolling() {
    stopPoll();
    poller = setInterval(async () => {
      await loadSummary();
      if (!summary.value.running) stopPoll();
    }, 2500);
  }
  onUnmounted(stopPoll);
</script>

<style scoped lang="less">
  /* 固定宽度:约束 BModal 的 min-width:max-content,否则长 URL(nowrap)会把弹框撑到整行宽 */
  .lh {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 88vw;
    box-sizing: border-box;
  }
  .lh-desc {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .lh-hint {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.6;
    color: #d97706;
    background: color-mix(in srgb, #f59e0b 8%, transparent);
    border: 1px solid color-mix(in srgb, #f59e0b 22%, transparent);
    border-radius: 8px;
    padding: 8px 10px;
  }
  a.lh-item-name {
    text-decoration: none;
    color: var(--text-color);
  }
  a.lh-item-name:hover {
    color: var(--primary-color);
    text-decoration: underline;
  }
  .lh-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--card-border-color) 14%, transparent);
  }
  .lh-stats {
    display: grid;
    gap: 2px;
    font-size: 13px;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .lh-stats small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .lh-dead-n {
    color: #dc2626;
    font-weight: 700;
  }
  .lh-empty {
    text-align: center;
    padding: 20px 0;
    font-size: 14px;
    color: #16a34a;
    font-weight: 600;
  }
  .lh-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .lh-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, #dc2626 22%, transparent);
    background: color-mix(in srgb, #dc2626 5%, transparent);
  }
  .lh-item-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .lh-item-name {
    display: block;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lh-item-url {
    font-size: 11px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lh-item-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 10px;
  }
  .lh-act {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
    cursor: pointer;
  }
  .lh-act.snap {
    border-color: transparent;
    background: linear-gradient(135deg, var(--primary-color), #22d3ee);
    color: #fff;
    font-weight: 600;
  }

  @media (max-width: 767px) {
    .lh {
      width: 100%;
      max-width: none;
      gap: 14px;
    }
    .lh-bar {
      flex-direction: column;
      align-items: stretch;
    }
    .lh-bar :deep(.space-body) {
      width: 100%;
    }
    .lh-bar :deep(.b_btn) {
      flex: 1 1 0;
      min-width: 0;
      min-height: 44px;
    }
    .lh-list {
      max-height: 48vh;
      gap: 8px;
    }
    .lh-item {
      flex-direction: column;
      align-items: stretch;
      border-color: var(--danger-color);
      border-left-width: 3px;
    }
    .lh-item-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .lh-act {
      width: 100%;
      min-height: 44px;
      padding: 8px 10px;
    }
  }
</style>
