<template>
  <section class="project-versions" :aria-label="t('toolboxProject.versions.title')">
    <div class="project-versions__create">
      <BInput
        v-model:value="versionName"
        :maxlength="80"
        :placeholder="t('toolboxProject.versions.namePlaceholder')"
        submit-on-enter
        @enter="createNamedVersion"
      />
      <BButton type="primary" :loading="naming" :disabled="!versionName.trim()" @click="createNamedVersion">
        {{ t('toolboxProject.versions.create') }}
      </BButton>
    </div>

    <div v-if="loading" class="project-versions__state">
      <BLoading inline loading :title="t('toolboxProject.versions.loading')" />
    </div>
    <div v-else-if="error" class="project-versions__state is-error" role="alert">
      <span>{{ t('toolboxProject.versions.loadFailed') }}</span>
      <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="items.length === 0" class="project-versions__state">
      <SvgIcon :src="icon.noteDetail.history" size="22" />
      <span>{{ t('toolboxProject.versions.empty') }}</span>
    </div>
    <div v-else class="project-versions__list">
      <article v-for="revision in items" :key="revision.id" class="project-version">
        <span class="project-version__marker" aria-hidden="true"></span>
        <div class="project-version__copy">
          <strong>{{
            revision.label || t('toolboxProject.versions.autoVersion', { number: revision.revision })
          }}</strong>
          <small>{{ formatDate(revision.createdAt) }}</small>
        </div>
        <BChip v-if="revision.revision === currentRevision" tone="success">
          {{ t('toolboxProject.versions.current') }}
        </BChip>
        <BButton
          v-else
          size="small"
          :loading="restoringRevision === revision.revision"
          :disabled="restoringRevision !== null"
          @click="emit('restore', revision)"
        >
          {{ t('toolboxProject.versions.restore') }}
        </BButton>
      </article>
      <div v-if="hasMore" class="project-versions__more">
        <BButton size="small" :loading="loadingMore" @click="emit('loadMore')">
          {{ t('common.loadMore') }}
        </BButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { ToolboxProjectRevisionSummary } from '@/api/toolboxProjects';

  defineProps<{
    items: ToolboxProjectRevisionSummary[];
    loading: boolean;
    hasMore: boolean;
    loadingMore: boolean;
    error: boolean;
    naming: boolean;
    currentRevision: number;
    restoringRevision: number | null;
  }>();

  const emit = defineEmits<{
    retry: [];
    loadMore: [];
    name: [name: string];
    restore: [revision: ToolboxProjectRevisionSummary];
  }>();

  const { t, locale } = useI18n();
  const versionName = ref('');

  function formatDate(value: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value);
  }

  function createNamedVersion() {
    const name = versionName.value.trim();
    if (!name) return;
    emit('name', name);
    versionName.value = '';
  }
</script>

<style scoped lang="less">
  .project-versions {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 14px;
  }
  .project-versions__create {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }
  .project-versions__create :deep(.input-container),
  .project-versions__create :deep(.b-input) {
    width: 100%;
  }
  .project-versions__state {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    text-align: center;
  }
  .project-versions__state.is-error {
    color: var(--error-color, #d9363e);
  }
  .project-versions__list {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 4px;
  }
  .project-versions__more {
    display: flex;
    justify-content: center;
    padding: 14px 0 4px;
  }
  .project-version {
    position: relative;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 13px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .project-version__marker {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary-color);
  }
  .project-version__copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .project-version__copy strong,
  .project-version__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-version__copy strong {
    font-size: 13px;
  }
  .project-version__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }
  @media (max-width: 767px) {
    .project-versions :deep(.b_btn.small_btn) {
      height: 44px;
      min-height: 44px;
      line-height: 44px;
    }
  }
  @media (max-width: 480px) {
    .project-versions__create {
      grid-template-columns: 1fr;
    }
    .project-versions__create :deep(.b_btn) {
      width: 100%;
    }
  }
</style>
