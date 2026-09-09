<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.snapshotTitle')" :show-footer="false" width="auto">
    <div class="bsnap">
      <p v-if="draftContext" class="bsnap-time">{{ $t('organizeWorkspace.archiveReadyHint') }}</p>
      <div class="bsnap-bar">
        <span v-if="snap?.update_time" class="bsnap-time">{{
          $t(draftContext ? 'organizeWorkspace.archiveGeneratedAt' : 'bookmarkMg.snapshotUpdatedAt', {
            t: fmtTime(snap.update_time),
          })
        }}</span>
        <span v-else class="bsnap-time"></span>
        <BSpace v-if="!isGuest && !draftContext">
          <BButton
            v-if="!isReadonlyAdminContext"
            class="bsnap-generate-button"
            size="small"
            :loading="archiving || taskActive"
            :disabled="busy || loading"
            @click="generateArchive"
          >
            <SvgIcon :src="icon.bookmarkManage.snapshot" size="15" />
            {{
              archiving || taskActive
                ? $t('bookmarkMg.snapshotArchiving')
                : snap?.archiveTask?.status === 'failed'
                  ? $t('organizeWorkspace.archiveRetryCurrent')
                  : snap?.content
                    ? $t('bookmarkMg.snapshotArchive')
                    : $t('bookmarkMg.snapshotCreateArchive')
            }}
          </BButton>
          <BButton
            class="bsnap-generate-button"
            size="small"
            type="primary"
            :loading="summarizing"
            :disabled="busy || loading || !snap?.content"
            @click="generateSummary"
          >
            <SvgIcon :src="icon.ai.summary" size="15" />
            {{
              summarizing
                ? $t('bookmarkMg.aiSummaryGenerating')
                : snap?.summary
                  ? $t('bookmarkMg.aiSummaryRefresh')
                  : $t('bookmarkMg.aiSummaryGenerate')
            }}
          </BButton>
        </BSpace>
      </div>

      <div
        v-if="snap?.archiveTask"
        class="bsnap-task"
        :class="{ 'bsnap-task--failed': snap.archiveTask.status === 'failed' }"
        role="status"
      >
        <strong>{{ $t(`bookmarkMg.archiveState_${snap.archiveTask.status}`) }}</strong>
        <span v-if="snap.archiveTask.attempts">{{
          $t('bookmarkMg.archiveAttempts', { count: snap.archiveTask.attempts })
        }}</span>
        <p v-if="snap.archiveTask.msg">{{ snap.archiveTask.msg }}</p>
        <p v-if="snap.content && snap.archiveTask.status !== 'succeeded'">{{ $t('bookmarkMg.archivePreserved') }}</p>
      </div>
      <div v-if="!isGuest && !isReadonlyAdminContext && snap?.failedCount" class="bsnap-retry">
        <span>{{ $t('bookmarkMg.archiveFailedCount', { count: snap.failedCount }) }}</span>
        <BButton size="small" :disabled="busy || retrying" @click="retryFailures">{{
          $t('bookmarkMg.archiveRetryFailed')
        }}</BButton>
      </div>
      <div v-if="loadError" class="bsnap-task bsnap-task--failed" role="alert"
        >{{ $t('bookmarkMg.archiveLoadError') }}
        <BButton size="small" @click="loadSnap()">{{ $t('common.retry') }}</BButton>
      </div>
      <div v-if="snap?.content" class="bsnap-time"
        >{{
          $t(draftContext ? 'organizeWorkspace.archiveGeneratedCharacters' : 'bookmarkMg.archiveCharacters', {
            count: snap.char_count || snap.content.length,
          })
        }}<template v-if="snap.source">
          ·
          {{
            $t(snap.source === 'rendered_dom' ? 'bookmarkMg.archiveSourceRendered' : 'bookmarkMg.archiveSourceStatic')
          }}</template
        ></div
      >
      <div v-if="snap?.summary" class="bsnap-summary">
        <div class="bsnap-summary-head">
          <span class="bsnap-heading-icon bsnap-heading-icon--summary"
            ><SvgIcon :src="icon.ai.summary" size="15"
          /></span>
          <span>{{ $t('bookmarkMg.aiSummaryTitle') }}</span>
          <span class="bsnap-tag">{{ $t('bookmarkMg.aiSummaryHint') }}</span>
        </div>
        <div class="bsnap-summary-body">{{ snap.summary }}</div>
      </div>
      <div v-if="loading" class="bsnap-empty">…</div>
      <div v-else-if="snap?.content" class="bsnap-content">
        <div class="bsnap-content-label">
          <span class="bsnap-heading-icon bsnap-heading-icon--snapshot"
            ><SvgIcon :src="icon.bookmarkManage.snapshot" size="14"
          /></span>
          <span>{{ $t(draftContext ? 'organizeWorkspace.archiveDraftText' : 'bookmarkMg.snapshotFullText') }}</span>
        </div>
        <div v-if="snap.title" class="bsnap-doc-title">{{ snap.title }}</div>
        <div class="bsnap-text">{{ snap.content }}</div>
      </div>
      <div v-else-if="taskActive" class="bsnap-empty">{{ $t('organizeWorkspace.archiveWaitingPreview') }}</div>
      <div v-else-if="!loadError && snap?.archiveTask?.status !== 'failed'" class="bsnap-empty">{{
        $t('bookmarkMg.snapshotEmpty')
      }}</div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { getOrganizeArchiveDraft } from '@/api/organizeSuggestionApi';
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { getAiQuotaErrorPresentation } from '@/utils/aiQuotaErrorPresentation';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import { useUserStore } from '@/store';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const props = defineProps<{ bookmarkId?: string; draftContext?: { runId: string; suggestionId: string } }>();
  const visible = defineModel<boolean>('visible');

  // 游客(共享 visitor 账号)可查看快照,但「归档 / AI 摘要」是写/消耗操作,对游客隐藏,避免点了被后端拦。
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
  const isReadonlyAdminContext = computed(() => user.adminContext?.mode === 'readonly');

  const snap = ref<any>(null);
  const loading = ref(false);
  const archiving = ref(false);
  const summarizing = ref(false);
  const taskActive = computed(() => ['pending', 'running', 'retry_wait'].includes(snap.value?.archiveTask?.status));
  const busy = computed(() => archiving.value || summarizing.value || taskActive.value);
  const retrying = ref(false);
  const loadError = ref(false);
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let contextVersion = 0;
  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
  onBeforeUnmount(() => {
    contextVersion++;
    loadSequence++;
    stopPolling();
  });
  let loadSequence = 0;

  function fmtTime(v: string) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v || '');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function loadSnap(background = false) {
    const bookmarkId = props.bookmarkId;
    if (!bookmarkId || !visible.value) return null;
    const current = ++loadSequence;
    stopPolling();
    if (!background) loading.value = true;
    try {
      const res = props.draftContext
        ? await getOrganizeArchiveDraft(props.draftContext.runId, props.draftContext.suggestionId)
        : await apiBasePost('/api/bookmark/snapshot', { id: bookmarkId });
      if (current !== loadSequence || bookmarkId !== props.bookmarkId || !visible.value) return null;
      loadError.value = res?.status !== 200;
      if (res?.status === 200) snap.value = res.data;
      if (!loadError.value && taskActive.value)
        pollTimer = setTimeout(() => {
          void loadSnap(true);
        }, 2500);
      return snap.value;
    } catch {
      if (current === loadSequence) loadError.value = true;
      return null;
    } finally {
      if (current === loadSequence) loading.value = false;
    }
  }

  async function generateArchive() {
    if (!props.bookmarkId || busy.value || isReadonlyAdminContext.value) return;
    const bookmarkId = props.bookmarkId;
    const version = contextVersion;
    archiving.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/archive', { id: bookmarkId });
      if (bookmarkId !== props.bookmarkId || version !== contextVersion || !visible.value) return;
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('bookmarkMg.archiveQueued'));
        await loadSnap();
      } else {
        message.info(res?.data?.msg || t('bookmarkMg.snapshotFail'));
      }
    } catch {
      if (version === contextVersion) message.info(t('bookmarkMg.snapshotFail'));
    } finally {
      if (version === contextVersion) archiving.value = false;
    }
  }

  function retryFailures() {
    if (busy.value || retrying.value || isGuest.value || isReadonlyAdminContext.value) return;
    const version = contextVersion;
    Alert.alert({
      title: t('bookmarkMg.archiveRetryFailed'),
      content: t('bookmarkMg.archiveRetryConfirm', { count: Math.min(20, snap.value?.failedCount || 0) }),
      async onOk() {
        if (version !== contextVersion || !visible.value) return;
        retrying.value = true;
        try {
          const res = await apiBasePost('/api/bookmark/archive/retry-failed', {});
          if (version !== contextVersion) return;
          if (res?.status === 200 && res.data?.ok) {
            message.success(t('bookmarkMg.archiveRetryQueued', { count: res.data.queued }));
            await loadSnap();
          } else message.info(t('bookmarkMg.snapshotFail'));
        } catch {
          if (version === contextVersion) message.info(t('bookmarkMg.snapshotFail'));
        } finally {
          if (version === contextVersion) retrying.value = false;
        }
      },
    });
  }

  async function generateSummary() {
    if (!props.bookmarkId || !snap.value?.content || busy.value) return;
    const bookmarkId = props.bookmarkId;
    const version = contextVersion;
    summarizing.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/summarize', { id: bookmarkId, force: true }, { silent: true });
      if (bookmarkId !== props.bookmarkId || version !== contextVersion || !visible.value) return;
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('bookmarkMg.aiSummaryGenerated'));
        recordOperation({
          module: '书签详情',
          operation: `生成网页存档 AI 摘要成功【${snap.value?.title || bookmarkId}】`,
        });
        await loadSnap();
      } else {
        const quotaFailure = getAiQuotaErrorPresentation(res?.data, (key, params) => t(key, params));
        if (quotaFailure) message.warning(quotaFailure.message);
        else message.info(res?.data?.msg || t('bookmarkMg.aiSummaryFail'));
      }
    } catch (error: any) {
      if (version !== contextVersion) return;
      const quotaFailure = getAiQuotaErrorPresentation(error, (key, params) => t(key, params));
      if (quotaFailure) {
        message.warning(quotaFailure.message);
      } else {
        message.info(error?.message || t('bookmarkMg.aiSummaryFail'));
      }
    } finally {
      if (version === contextVersion) summarizing.value = false;
    }
  }

  watch(
    [() => visible.value, () => props.bookmarkId, () => props.draftContext],
    async ([isVisible, bookmarkId]) => {
      loadSequence += 1;
      contextVersion++;
      stopPolling();
      archiving.value = false;
      summarizing.value = false;
      retrying.value = false;
      loadError.value = false;
      if (!isVisible || !bookmarkId) return;
      snap.value = null;
      await loadSnap();
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  /* 固定宽度:约束 BModal 的 min-width:max-content,否则长文本会把弹框撑到整行宽 */
  .bsnap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(600px, calc(90vw - 40px));
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  .bsnap-task {
    padding: 12px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-color);
    overflow-wrap: anywhere;
    strong {
      color: var(--primary-color);
      margin-right: 8px;
    }
    p {
      margin: 6px 0 0;
    }
  }
  .bsnap-task--failed {
    border-color: var(--danger-color, #d43845);
    strong {
      color: var(--danger-color, #d43845);
    }
  }
  .bsnap-retry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .bsnap-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    min-width: 0;
  }
  .bsnap-time {
    min-width: 0;
    font-size: 11.5px;
    color: var(--desc-color);
    overflow-wrap: anywhere;
  }
  .bsnap-bar :deep(.space-body) {
    width: auto;
    max-width: 100%;
    flex-wrap: wrap;
  }
  .bsnap-generate-button {
    gap: 6px;
  }
  .bsnap-summary {
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
  }
  .bsnap-summary-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
    margin-bottom: 6px;
  }
  .bsnap-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    margin-left: 4px;
  }
  .bsnap-content-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--desc-color);
    margin-bottom: 8px;
  }
  .bsnap-heading-icon {
    display: inline-flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex: none;
  }
  .bsnap-heading-icon--summary {
    color: var(--primary-color);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 15%, transparent),
      color-mix(in srgb, var(--resource-tag-color) 10%, transparent)
    );
  }
  .bsnap-heading-icon--snapshot {
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 12%, transparent);
  }
  .bsnap-summary,
  .bsnap-content {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
  }
  .bsnap-summary-body {
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-color);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .bsnap-content {
    max-height: 52vh;
    width: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .bsnap-doc-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--text-color);
  }
  .bsnap-text {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-color);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .bsnap-empty {
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
    padding: 28px 10px;
  }
  @media (max-width: 767px) {
    .bsnap {
      width: calc(90vw - 32px);
    }
    .bsnap-bar {
      align-items: flex-start;
    }
    .bsnap-bar :deep(.space-body) {
      width: 100%;
    }
    .bsnap-bar :deep(.b_btn) {
      flex: 1 1 auto;
      min-height: 44px;
    }
    .bsnap-retry :deep(.b_btn),
    .bsnap-task :deep(.b_btn) {
      min-height: 44px;
    }
    .bsnap-content {
      max-height: 56vh;
      max-height: 56dvh;
      padding: 11px 12px;
    }
  }
</style>
