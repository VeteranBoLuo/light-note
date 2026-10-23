<template>
  <section class="publication-reading-pane" :class="{ 'is-compact': compact }">
    <header class="reading-heading">
      <div
        ><h2 v-if="item" :title="item.title">{{ item.title }}</h2
        ><small v-else>{{ t('publicResources.workspace.previewLabel') }}</small></div
      >
      <BButton
        v-if="item && !compact"
        type="text"
        :disabled="disabled || item.sourceUnavailable"
        @click="emit('source')"
        >{{ t('publicResources.openSource') }}</BButton
      >
      <BButton v-if="compact" type="text" :disabled="disabled" @click="emit('expand')">{{
        t('publicResources.workspace.expandPreview')
      }}</BButton>
    </header>
    <PublicationInspector
      v-if="item?.publication"
      :item="item"
      integrated
      :compact="compact"
      :disabled="disabled || unresolved"
      @submit="emit('submit')"
      @source="emit('source')"
      @withdraw="emit('withdraw')"
      @refresh="emit('refresh')"
      @changed="(key, changed) => emit('changed', key, changed)"
      @material="(key, fingerprint) => emit('material', key, fingerprint)"
    />
    <OriginalPreview
      v-else-if="item"
      :item="item"
      :compact="compact"
      @material="(key, fingerprint) => emit('material', key, fingerprint)"
    />
    <div v-else class="reading-empty"
      ><SvgIcon :src="icon.share" size="30" /><h3>{{ t('publicResources.workspace.noSelection') }}</h3
      ><p>{{ t('publicResources.workspace.selectHint') }}</p></div
    >
  </section>
</template>
<script setup lang="ts">
  import { computed, defineComponent, h, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { PublicationWorkspaceItem } from '@lightnote/shared/public-resources';
  import { usePublicationPreview } from '@/composables/usePublicationPreview';
  import { publicResourceErrorKey } from '@/utils/publicResourceErrors';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import PublicationContent from './PublicationContent.vue';
  import PublicationInspector from './PublicationInspector.vue';
  defineProps<{ item: PublicationWorkspaceItem | null; compact?: boolean; disabled?: boolean; unresolved?: boolean }>();
  const emit = defineEmits<{
    source: [];
    submit: [];
    withdraw: [];
    refresh: [];
    expand: [];
    changed: [key: string, changed: boolean | null];
    material: [key: string, fingerprint: string];
  }>();
  const { t } = useI18n();
  const OriginalPreview = defineComponent({
    props: { item: { type: Object as () => PublicationWorkspaceItem, required: true }, compact: Boolean },
    emits: ['material'],
    setup(props, { emit }) {
      const preview = usePublicationPreview(computed(() => props.item));
      watch(preview.material, (value) => {
        if (value) emit('material', `${props.item.kind}:${props.item.sourceId}`, value.fingerprint);
      });
      return () =>
        h('div', { class: 'original-preview' }, [
          preview.loading.value
            ? h(BLoading, { inline: true, loading: true, title: t('publicResources.loading') })
            : preview.error.value
              ? h('div', { class: 'reading-error', role: 'alert' }, [
                  h('p', t(publicResourceErrorKey(preview.error.value))),
                  h(BButton, { onClick: preview.retry }, () => t('publicResources.retry')),
                ])
              : preview.material.value
                ? props.compact
                  ? h(
                      'p',
                      { class: 'reading-excerpt' },
                      preview.material.value.body || preview.material.value.description || preview.material.value.url,
                    )
                  : h(PublicationContent, { material: preview.material.value })
                : null,
          !props.compact && preview.material.value
            ? h('p', { class: 'reading-note' }, t('publicResources.noChanges'))
            : null,
        ]);
    },
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .publication-reading-pane {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
  }
  .reading-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: .ui-space(12px) [];
    padding: .ui-space(10px) [] .ui-space(20px) [];
    border-bottom: 1px solid var(--workspace-divider);
  }
  .reading-heading > div {
    flex: 1;
    min-width: 0;
  }
  .reading-heading small {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .reading-heading h2 {
    margin: 0;
    font-size: .ui-font(14px) [];
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reading-heading .b_btn {
    flex-shrink: 0;
  }
  .original-preview {
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding: .ui-space(16px) [] .ui-space(24px) [];
  }
  .original-preview > :deep(.publication-content) {
    max-width: .ui-layout(740px) [];
    margin: 0 auto;
  }
  .original-preview :deep(.publication-content h2) {
    font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', serif;
    font-size: .ui-font(30px) [];
    line-height: 1.5;
  }
  .original-preview :deep(.publication-content__text) {
    line-height: 2;
  }
  :deep(.reading-note) {
    max-width: .ui-layout(740px) [];
    margin: .ui-space(16px) [] auto 0;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.7;
  }
  .reading-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: .ui-space(32px) [];
    text-align: center;
    color: var(--desc-color);
  }
  .reading-empty :deep(.svg-icon) {
    color: var(--workspace-purple-text);
  }
  .reading-empty h3 {
    font-size: .ui-font(18px) [];
    color: var(--text-color);
    margin: .ui-space(20px) [] 0 .ui-space(8px) [];
  }
  .reading-empty p,
  :deep(.reading-error) {
    font-size: .ui-font(13px) [];
    line-height: 1.8;
  }
  :deep(.reading-error) {
    color: var(--warning-color);
  }
  .is-compact {
    height: auto;
  }
  .is-compact .reading-heading {
    padding: .ui-space(12px) [] .ui-space(16px) [];
    border-bottom: 0;
  }
  .is-compact .reading-heading h2 {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .is-compact .original-preview {
    padding: 0 .ui-space(16px) [] .ui-space(12px) [];
    flex: initial;
  }
  :deep(.reading-excerpt) {
    font-size: .ui-font(13px) [];
    color: var(--desc-color);
    line-height: 1.7;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 767px) {
    .reading-heading {
      padding: .ui-space(8px) [] .ui-space(16px) [];
    }
    .original-preview {
      padding: .ui-space(16px) [];
    }
    .original-preview :deep(.publication-content h2) {
      font-size: .ui-font(24px) [];
    }
  }
</style>
