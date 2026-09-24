<template>
  <div class="document-summary-entry">
    <BButton
      type="primary"
      :disabled="(!current.content && !availability.available.value) || !hasText"
      :loading="current.loading"
      @click="openSummary"
    >
      <SvgIcon v-if="!current.loading" :src="icon.ai.summary" size="16" />
      {{
        t(
          current.loading
            ? 'toolbox.documentSummary.generating'
            : current.content
              ? 'toolbox.documentSummary.view'
              : 'toolbox.documentSummary.generate',
        )
      }}
    </BButton>
    <small>{{ t('toolbox.documentSummary.privacy') }}</small>
    <small v-if="!availability.available.value">{{ t('aiSkills.unavailableTitle') }}</small>
  </div>
  <BModal
    v-model:visible="visible"
    :title="t('toolbox.documentSummary.title')"
    width="min(var(--ui-layout-720, 720px), calc(100vw - var(--ui-space-24, 24px)))"
    fullscreen-mobile
  >
    <template #mobileHeader="{ close }">
      <div class="document-summary-mobile-head">
        <BButton :aria-label="t('toolbox.documentSummary.back')" @click="close"
          ><SvgIcon :src="icon.toolbox.back" size="20"
        /></BButton>
        <strong>{{ t('toolbox.documentSummary.title') }}</strong>
      </div>
    </template>
    <div class="document-summary-body">
      <p class="document-summary-filename" :title="file.name">{{ file.name }}</p>
      <BButton v-if="current.jobId" type="text" @click="openTask">{{ t('toolbox.documentSummary.retained') }}</BButton>
      <p v-if="warning" class="document-summary-notice">{{ warning }}</p>
      <p v-if="current.loading" class="document-summary-notice" role="status">{{
        t('toolbox.documentSummary.generating')
      }}</p>
      <p v-if="current.error" class="document-summary-error" role="alert">{{ current.error }}</p>
      <AiSkillResultContent v-if="current.content" :result="{ kind: 'grounded_markdown', content: current.content }" />
    </div>
    <template #footer>
      <div class="document-summary-footer">
        <BButton
          type="text"
          :disabled="current.loading || !availability.available.value"
          @click="summary.generate(file, text)"
        >
          {{ t(current.content ? 'toolbox.documentSummary.regenerate' : 'toolbox.documentSummary.retry') }}
        </BButton>
        <div class="document-summary-footer-actions">
          <BButton :disabled="!current.content" @click="copySummary">{{ t('toolbox.documentSummary.copy') }}</BButton>
          <BButton type="primary" :disabled="!current.artifactId || saving" @click="saveSummary">{{
            t('aiSkills.saveAsNote')
          }}</BButton>
        </div>
      </div>
    </template>
  </BModal>
</template>
<script setup lang="ts">
  import { saveToolboxNote } from '@/utils/saveToolboxNote';
  import { computed, onDeactivated, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { useUserStore } from '@/store';
  import { useDocumentSummary } from '@/composables/useDocumentSummary';
  import { useAiSkillAvailability } from '@/composables/useAiSkillAvailability';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AiSkillResultContent from '@/components/aiSkills/AiSkillResultContent.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  const props = defineProps<{ file: File; text: string; hasText: boolean; warning: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const summary = useDocumentSummary(t);
  const availability = useAiSkillAvailability('toolbox.summarize_text');
  const current = computed(() => summary.state(props.file));
  const visible = ref(false);
  const saving = ref(false);
  function openSummary() {
    visible.value = true;
    if (!current.value.content && !current.value.loading) void summary.generate(props.file, props.text);
  }
  async function openTask() {
    const jobId = current.value.jobId;
    if (!jobId) return;
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => router.push(`/toolbox/task/${jobId}`),
    );
  }
  async function copySummary() {
    const copied = await copyTextToClipboard(current.value.content);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }
  async function saveSummary() {
    if (!current.value.artifactId || saving.value) return;
    const artifactId = current.value.artifactId;
    saving.value = true;
    try {
      const result = await saveToolboxNote({ artifactId, version: 1, title: `${props.file.name.replace(/\.[^.]+$/, '')} · ${t('toolbox.documentSummary.title')}`,
        isCurrent: () => current.value.artifactId === artifactId,
      });
      if (result?.openAfterSave) await closeCurrentMobileOverlayThen(() => { visible.value = false; }, () => router.push(`/noteLibrary/${encodeURIComponent(result.noteId)}`));
    } finally { saving.value = false; }
  }
  watch(
    () => buildNoteDetailRequestScope(user),
    () => {
      visible.value = false;
      summary.reset();
    },
  );
  watch(
    () => props.file,
    () => {
      visible.value = false;
    },
  );
  onDeactivated(() => {
    visible.value = false;
  });
</script>
<style scoped lang="less">
  .document-summary-entry {
    display: grid;
    justify-items: end;
    gap: var(--ui-space-5, 5px);
  }
  .document-summary-entry small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .document-summary-body {
    min-width: 0;
  }
  .document-summary-body :deep(h1),
  .document-summary-body :deep(h2) {
    font-size: var(--ui-font-20, 20px);
    line-height: 1.4;
  }
  .document-summary-filename {
    margin: 0 0 var(--ui-space-18, 18px);
    color: var(--desc-color);
    overflow-wrap: anywhere;
  }
  .document-summary-notice {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .document-summary-error {
    color: var(--danger-color);
  }
  .document-summary-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
    border-top: 1px solid var(--surface-border-color);
  }
  .document-summary-footer-actions {
    display: flex;
    gap: var(--ui-space-8, 8px);
  }
  .document-summary-mobile-head {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  @media (max-width: 767px) {
    .document-summary-mobile-head {
      padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    }
    .document-summary-body {
      padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
    }
    .document-summary-entry {
      justify-items: stretch;
    }
    .document-summary-footer {
      padding-bottom: calc(var(--ui-space-16, 16px) + env(safe-area-inset-bottom, 0px));
    }
    .document-summary-footer-actions {
      width: 100%;
    }
    .document-summary-footer-actions > * {
      flex: 1;
      min-height: var(--ui-control-44, 44px);
      line-height: var(--ui-control-44, 44px);
    }
  }
</style>
