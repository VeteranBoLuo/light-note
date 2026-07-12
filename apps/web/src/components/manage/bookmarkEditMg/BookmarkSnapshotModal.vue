<template>
  <BModal v-model:visible="visible" :title="$t('bookmarkMg.snapshotTitle')" :show-footer="false" width="auto">
    <div class="bsnap">
      <p class="bsnap-hint">{{ $t('bookmarkMg.snapshotHint') }}</p>
      <div class="bsnap-bar">
        <span v-if="snap?.update_time" class="bsnap-time">{{ $t('bookmarkMg.snapshotUpdatedAt', { t: fmtTime(snap.update_time) }) }}</span>
        <span v-else class="bsnap-time"></span>
        <b-space>
          <b-button size="small" :loading="summarizing" :disabled="summarizing || !snap?.content" @click="aiSummarize">
            🤖 {{ summarizing ? $t('bookmarkMg.aiSummarizing') : snap?.summary ? $t('bookmarkMg.aiResummary') : $t('bookmarkMg.aiSummary') }}
          </b-button>
          <b-button size="small" type="primary" :loading="archiving" :disabled="archiving" @click="archive">
            {{ archiving ? $t('bookmarkMg.snapshotArchiving') : $t('bookmarkMg.snapshotArchive') }}
          </b-button>
        </b-space>
      </div>

      <div v-if="snap?.summary" class="bsnap-summary">
        <div class="bsnap-summary-head">🤖 {{ $t('bookmarkMg.aiSummaryTitle') }}</div>
        <div class="bsnap-summary-body">{{ snap.summary }}</div>
      </div>
      <div v-if="loading" class="bsnap-empty">…</div>
      <div v-else-if="snap?.content" class="bsnap-content">
        <div v-if="snap.title" class="bsnap-doc-title">{{ snap.title }}</div>
        <div class="bsnap-text">{{ snap.content }}</div>
      </div>
      <div v-else class="bsnap-empty">{{ $t('bookmarkMg.snapshotEmpty') }}</div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';

  const { t } = useI18n();
  const props = defineProps<{ bookmarkId?: string }>();
  const visible = defineModel<boolean>('visible');

  const snap = ref<any>(null);
  const loading = ref(false);
  const archiving = ref(false);
  const summarizing = ref(false);

  function fmtTime(v: string) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v || '');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function loadSnap() {
    if (!props.bookmarkId) return;
    loading.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/snapshot', { id: props.bookmarkId });
      if (res?.status === 200) snap.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function archive() {
    if (!props.bookmarkId || archiving.value) return;
    archiving.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/archive', { id: props.bookmarkId });
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('bookmarkMg.snapshotOk', { n: res.data.charCount }));
        await loadSnap();
      } else {
        message.info(t('bookmarkMg.snapshotFail'));
      }
    } finally {
      archiving.value = false;
    }
  }

  async function aiSummarize() {
    if (!props.bookmarkId || summarizing.value) return;
    summarizing.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/summarize', { id: props.bookmarkId, force: !!snap.value?.summary });
      if (res?.status === 200 && res.data?.ok) {
        if (snap.value) snap.value.summary = res.data.summary;
        else await loadSnap();
      } else {
        message.info(res?.data?.msg || t('bookmarkMg.snapshotFail'));
      }
    } finally {
      summarizing.value = false;
    }
  }

  watch(visible, (v) => {
    if (v) {
      snap.value = null;
      loadSnap();
    }
  });
</script>

<style scoped lang="less">
  /* 固定宽度:约束 BModal 的 min-width:max-content,否则长文本会把弹框撑到整行宽 */
  .bsnap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 600px;
    max-width: 86vw;
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
    gap: 12px;
  }
  .bsnap-time {
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .bsnap-summary {
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
  }
  .bsnap-summary-head {
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
    margin-bottom: 6px;
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
    overflow-y: auto;
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
</style>
