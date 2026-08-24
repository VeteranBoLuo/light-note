<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.snapshotTitle')" :show-footer="false" width="auto">
    <div class="bsnap">
      <p class="bsnap-hint">{{ $t('bookmarkMg.snapshotHint') }}</p>
      <div class="bsnap-bar">
        <span v-if="snap?.update_time" class="bsnap-time">{{
          $t('bookmarkMg.snapshotUpdatedAt', { t: fmtTime(snap.update_time) })
        }}</span>
        <span v-else class="bsnap-time"></span>
        <BSpace v-if="!isGuest">
          <BButton
            v-if="!isReadonlyAdminContext"
            class="bsnap-generate-button"
            size="small"
            :loading="archiving"
            :disabled="busy || loading"
            @click="generateArchive"
          >
            <SvgIcon :src="icon.bookmarkManage.snapshot" size="15" />
            {{
              archiving
                ? $t('bookmarkMg.snapshotArchiving')
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
          <span>{{ $t('bookmarkMg.snapshotFullText') }}</span>
        </div>
        <div v-if="snap.title" class="bsnap-doc-title">{{ snap.title }}</div>
        <div class="bsnap-text">{{ snap.content }}</div>
      </div>
      <div v-else class="bsnap-empty">{{ $t('bookmarkMg.snapshotEmpty') }}</div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import { useUserStore } from '@/store';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const props = defineProps<{ bookmarkId?: string }>();
  const visible = defineModel<boolean>('visible');

  // 游客(共享 visitor 账号)可查看快照,但「归档 / AI 摘要」是写/消耗操作,对游客隐藏,避免点了被后端拦。
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
  const isReadonlyAdminContext = computed(() => user.adminContext?.mode === 'readonly');

  const snap = ref<any>(null);
  const loading = ref(false);
  const archiving = ref(false);
  const summarizing = ref(false);
  const busy = computed(() => archiving.value || summarizing.value);
  let loadSequence = 0;

  function fmtTime(v: string) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v || '');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function loadSnap() {
    const bookmarkId = props.bookmarkId;
    if (!bookmarkId) return null;
    const current = ++loadSequence;
    loading.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/snapshot', { id: bookmarkId });
      if (current !== loadSequence || bookmarkId !== props.bookmarkId) return null;
      if (res?.status === 200) snap.value = res.data;
      return snap.value;
    } finally {
      if (current === loadSequence) loading.value = false;
    }
  }

  async function generateArchive() {
    if (!props.bookmarkId || busy.value || isReadonlyAdminContext.value) return;
    const bookmarkId = props.bookmarkId;
    const isUpdate = Boolean(snap.value?.content);
    archiving.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/archive', { id: bookmarkId });
      if (bookmarkId !== props.bookmarkId) return;
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('bookmarkMg.snapshotGenerated'));
        recordOperation({
          module: '书签详情',
          operation: `${isUpdate ? '更新' : '生成'}网页存档成功【${snap.value?.title || bookmarkId}】`,
        });
        await loadSnap();
      } else {
        message.info(res?.data?.msg || t('bookmarkMg.snapshotFail'));
      }
    } finally {
      archiving.value = false;
    }
  }

  async function generateSummary() {
    if (!props.bookmarkId || !snap.value?.content || busy.value) return;
    const bookmarkId = props.bookmarkId;
    summarizing.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/summarize', { id: bookmarkId, force: true });
      if (bookmarkId !== props.bookmarkId) return;
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('bookmarkMg.aiSummaryGenerated'));
        recordOperation({
          module: '书签详情',
          operation: `生成网页存档 AI 摘要成功【${snap.value?.title || bookmarkId}】`,
        });
        await loadSnap();
      } else if (res?.data?.reason === 'quota_exceeded') {
        message.warning(t('bookmarkMg.aiSummaryQuotaExceeded'));
      } else {
        message.info(res?.data?.msg || t('bookmarkMg.aiSummaryFail'));
      }
    } catch (error: any) {
      if (error?.status === 429 || error?.data?.code === 'AI_QUOTA_EXCEEDED') {
        message.warning(t('bookmarkMg.aiSummaryQuotaExceeded'));
      } else {
        message.info(error?.message || t('bookmarkMg.aiSummaryFail'));
      }
    } finally {
      summarizing.value = false;
    }
  }

  watch(
    [() => visible.value, () => props.bookmarkId],
    async ([isVisible, bookmarkId]) => {
      loadSequence += 1;
      if (!isVisible || !bookmarkId) {
        archiving.value = false;
        summarizing.value = false;
        return;
      }
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
  .bsnap-hint {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
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
    }
    .bsnap-content {
      max-height: 56vh;
      max-height: 56dvh;
      padding: 11px 12px;
    }
  }
</style>
