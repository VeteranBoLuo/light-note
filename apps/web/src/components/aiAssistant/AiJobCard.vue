<template>
  <section class="ai-job-card" :class="`ai-job-card--${current.status}`" aria-live="polite">
    <header class="ai-job-card__header">
      <span class="ai-job-card__icon" aria-hidden="true">
        <SvgIcon :src="icon.bookmarkManage.healthCheck" color="currentColor" size="20" />
      </span>
      <div class="ai-job-card__heading">
        <strong>{{ t(current.titleKey) }}</strong>
        <span>{{ statusDescription }}</span>
      </div>
      <BChip :tone="statusTone" size="medium">{{ statusLabel }}</BChip>
    </header>

    <div class="ai-job-card__progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${progress}%` }"></span>
    </div>
    <div class="ai-job-card__progress-label">
      <span>{{ t('ai.artifact.bookmarkHealth.progress', { checked: current.data.checked, total: current.data.total }) }}</span>
      <span>{{ progress }}%</span>
    </div>

    <div class="ai-job-card__metrics">
      <div><span class="metric-dot metric-dot--alive"></span><strong>{{ current.data.alive }}</strong><span>{{ t('ai.artifact.bookmarkHealth.alive') }}</span></div>
      <div><span class="metric-dot metric-dot--suspect"></span><strong>{{ current.data.suspect }}</strong><span>{{ t('ai.artifact.bookmarkHealth.suspect') }}</span></div>
      <div><span class="metric-dot metric-dot--unknown"></span><strong>{{ current.data.unknown }}</strong><span>{{ t('ai.artifact.bookmarkHealth.unknown') }}</span></div>
    </div>

    <p v-if="timeLabel" class="ai-job-card__time">{{ timeLabel }}</p>
    <p v-if="errorText" class="ai-job-card__error">{{ errorText }}</p>

    <div v-if="current.data.suspects.length" class="ai-job-card__suspects">
      <strong>{{ t('ai.artifact.bookmarkHealth.suspectList') }}</strong>
      <div v-for="item in current.data.suspects.slice(0, 5)" :key="item.id" class="ai-job-card__suspect">
        <div>
          <span>{{ item.name || t('ai.artifact.bookmarkHealth.untitled') }}</span>
          <small>{{ item.url }}</small>
        </div>
        <BButton size="small" :disabled="!item.url" @click="openUrl(item.url)">
          {{ t('ai.artifact.bookmarkHealth.open') }}
        </BButton>
      </div>
    </div>

    <footer class="ai-job-card__actions">
      <span v-if="current.status === 'running'" class="ai-job-card__background-note">
        {{ t('ai.artifact.bookmarkHealth.backgroundHint') }}
      </span>
      <BButton
        :type="current.status === 'queued' ? 'primary' : undefined"
        :loading="restarting"
        :disabled="current.status === 'running' || restarting"
        @click="restart"
      >
        {{ current.status === 'queued' ? t('ai.artifact.bookmarkHealth.start') : t('ai.artifact.bookmarkHealth.recheck') }}
      </BButton>
    </footer>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BMessage from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon.ts';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { resolveBookmarkUrlInput } from '@lightnote/shared';
  import type { AiArtifact } from '@/types/aiArtifact';
  import { createBookmarkHealthArtifactFromSummary } from './bookmarkHealthArtifact';

  const props = defineProps<{ artifact: AiArtifact }>();
  const emit = defineEmits<{ updated: [artifact: AiArtifact] }>();
  const { t, locale } = useI18n();
  const current = ref<AiArtifact>(props.artifact);
  const restarting = ref(false);
  const errorText = ref('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => props.artifact,
    (artifact) => {
      current.value = artifact;
      schedulePoll();
    },
    { deep: true },
  );

  const progress = computed(() => {
    if (current.value.data.total <= 0) return current.value.status === 'succeeded' ? 100 : 0;
    return Math.min(100, Math.round((current.value.data.checked / current.value.data.total) * 100));
  });
  const statusTone = computed(() => {
    if (current.value.status === 'succeeded') return 'success' as const;
    if (current.value.status === 'failed') return 'danger' as const;
    if (current.value.status === 'running') return 'pending' as const;
    return 'neutral' as const;
  });
  const statusLabel = computed(() => t(`ai.artifact.status.${current.value.status}`));
  const statusDescription = computed(() => {
    if (current.value.status === 'running') return t('ai.artifact.bookmarkHealth.runningDescription');
    if (!current.value.data.lastCheckedAt) return t('ai.artifact.bookmarkHealth.noResult');
    return t('ai.artifact.bookmarkHealth.resultDescription');
  });
  const timeLabel = computed(() => {
    const value = current.value.data.startedAt || current.value.data.lastCheckedAt;
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return t(current.value.status === 'running' ? 'ai.artifact.bookmarkHealth.startedAt' : 'ai.artifact.bookmarkHealth.checkedAt', {
      time: new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date),
    });
  });

  function clearPoll() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedulePoll() {
    clearPoll();
    if (current.value.status !== 'running') return;
    const base = current.value.data.pollAfterMs || 2500;
    timer = setTimeout(loadStatus, typeof document !== 'undefined' && document.hidden ? Math.max(8000, base) : base);
  }

  async function loadStatus() {
    try {
      const response = await apiBaseGet('/api/bookmark/health');
      if (response?.status !== 200 || !response.data) throw new Error('BOOKMARK_HEALTH_STATUS_FAILED');
      current.value = createBookmarkHealthArtifactFromSummary(response.data);
      errorText.value = '';
      emit('updated', current.value);
    } catch {
      errorText.value = t('ai.artifact.bookmarkHealth.refreshFailed');
    } finally {
      schedulePoll();
    }
  }

  async function restart() {
    if (restarting.value || current.value.status === 'running') return;
    restarting.value = true;
    try {
      const response = await apiBasePost('/api/bookmark/health/checkAll');
      if (response?.status !== 200 || !response.data) throw new Error('BOOKMARK_HEALTH_START_FAILED');
      current.value = createBookmarkHealthArtifactFromSummary(response.data);
      errorText.value = '';
      emit('updated', current.value);
      schedulePoll();
    } catch {
      errorText.value = t('ai.artifact.bookmarkHealth.startFailed');
      BMessage.error(errorText.value);
    } finally {
      restarting.value = false;
    }
  }

  function openUrl(value: string) {
    const url = resolveBookmarkUrlInput(value, { allowTextExtraction: false }).canonicalUrl;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onMounted(schedulePoll);
  onBeforeUnmount(clearPoll);
</script>

<style scoped lang="less">
  .ai-job-card {
    width: min(100%, 620px);
    box-sizing: border-box;
    padding: 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--card-bg-color);
    color: var(--text-color);
  }
  .ai-job-card--running { border-color: var(--chip-pending-border); }
  .ai-job-card--succeeded { border-color: var(--chip-success-border); }
  .ai-job-card--failed { border-color: var(--chip-danger-border); }
  .ai-job-card__header { display: flex; align-items: center; gap: 10px; }
  .ai-job-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    border: 1px solid var(--chip-bookmark-border);
    border-radius: 10px;
    color: var(--chip-bookmark-fg);
    background: var(--chip-bookmark-bg);
  }
  .ai-job-card__heading { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .ai-job-card__heading strong { font-size: 14px; }
  .ai-job-card__heading span { font-size: 12px; color: var(--desc-color); }
  .ai-job-card__progress { height: 7px; margin-top: 14px; overflow: hidden; border-radius: 999px; background: var(--chip-neutral-bg); }
  .ai-job-card__progress > span { display: block; height: 100%; border-radius: inherit; background: var(--primary-color); transition: width 0.2s ease; }
  .ai-job-card__progress-label { display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; color: var(--desc-color); }
  .ai-job-card__metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
  .ai-job-card__metrics > div { display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 5px; min-width: 0; padding: 8px; border: 1px solid var(--card-border-color); border-radius: 8px; }
  .ai-job-card__metrics strong { font-variant-numeric: tabular-nums; }
  .ai-job-card__metrics span:last-child { min-width: 0; color: var(--desc-color); font-size: 11px; }
  .metric-dot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid currentColor; background: currentColor; }
  .metric-dot--alive { color: var(--chip-success-fg); }
  .metric-dot--suspect { color: var(--chip-danger-fg); }
  .metric-dot--unknown { color: var(--chip-pending-fg); }
  .ai-job-card__time, .ai-job-card__error { margin: 10px 0 0; font-size: 11px; color: var(--desc-color); }
  .ai-job-card__error { color: var(--chip-danger-fg); }
  .ai-job-card__suspects { margin-top: 12px; display: flex; flex-direction: column; gap: 7px; }
  .ai-job-card__suspects > strong { font-size: 12px; }
  .ai-job-card__suspect { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid var(--chip-danger-border); border-radius: 8px; }
  .ai-job-card__suspect > div { flex: 1; min-width: 0; }
  .ai-job-card__suspect span, .ai-job-card__suspect small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-job-card__suspect span { font-size: 12px; }
  .ai-job-card__suspect small { margin-top: 2px; color: var(--desc-color); font-size: 10px; }
  .ai-job-card__actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
  .ai-job-card__background-note { flex: 1; font-size: 11px; color: var(--desc-color); }

  html.light-note-mobile-rendering & {
    border-color: var(--card-border-color);
    box-shadow: none;
    .ai-job-card__metrics { grid-template-columns: 1fr; }
    .ai-job-card__suspect { align-items: flex-start; }
    .ai-job-card__actions { align-items: stretch; flex-direction: column; }
    .ai-job-card__actions :deep(.b_btn) { width: 100%; min-height: 44px; }
  }
</style>
