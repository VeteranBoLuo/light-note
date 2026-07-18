<template>
  <BModal
    v-model:visible="visible"
    :title="t('bookmarkMeta.overwritePreviewTitle')"
    :show-footer="false"
    :mask-closable="false"
    width="min(720px, 92vw)"
    @close="finish(null)"
  >
    <div class="bookmark-meta-overwrite">
      <p class="bookmark-meta-overwrite__description">
        {{ t('bookmarkMeta.overwritePreviewDescription') }}
      </p>

      <div class="bookmark-meta-overwrite__fields">
        <section v-for="field in fields" :key="field.id" class="bookmark-meta-overwrite__field">
          <BCheckbox
            :checked="selected[field.id]"
            @update:checked="selected[field.id] = $event"
          >
            <strong>{{ fieldLabel(field.id) }}</strong>
          </BCheckbox>

          <div class="bookmark-meta-overwrite__comparison">
            <div class="bookmark-meta-overwrite__value bookmark-meta-overwrite__value--current">
              <span>{{ t('bookmarkMeta.currentValue') }}</span>
              <p>{{ field.currentValue || t('bookmarkMeta.notFilled') }}</p>
            </div>
            <div class="bookmark-meta-overwrite__value bookmark-meta-overwrite__value--generated">
              <span>{{ t('bookmarkMeta.generatedValue') }}</span>
              <p>{{ field.generatedValue }}</p>
            </div>
          </div>
        </section>
      </div>

      <div class="bookmark-meta-overwrite__footer">
        <BButton @click="finish(null)">{{ t('bookmarkEditor.keepExisting') }}</BButton>
        <BButton type="primary" :disabled="selectedIds.length === 0" @click="finish(selectedIds)">
          {{ t('bookmarkMeta.applySelected', { count: selectedIds.length }) }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import type {
    BookmarkMetaOverwriteField,
    BookmarkMetaOverwriteFieldId,
  } from '@/utils/bookmarkMetaOverwriteDecision';

  const props = defineProps<{ fields: BookmarkMetaOverwriteField[] }>();
  const emit = defineEmits<{ resolve: [value: BookmarkMetaOverwriteFieldId[] | null] }>();
  const { t } = useI18n();
  const visible = ref(true);
  const selected = reactive<Record<BookmarkMetaOverwriteFieldId, boolean>>({
    name: props.fields.some((field) => field.id === 'name'),
    description: props.fields.some((field) => field.id === 'description'),
  });
  const selectedIds = computed(() =>
    props.fields.filter((field) => selected[field.id]).map((field) => field.id),
  );
  let settled = false;

  function fieldLabel(id: BookmarkMetaOverwriteFieldId) {
    return t(id === 'name' ? 'bookmarkMeta.nameField' : 'bookmarkMeta.descriptionField');
  }

  function finish(value: BookmarkMetaOverwriteFieldId[] | null) {
    if (settled) return;
    settled = true;
    visible.value = false;
    emit('resolve', value);
  }
</script>

<style scoped lang="less">
  .bookmark-meta-overwrite {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 16px;
  }

  .bookmark-meta-overwrite__description {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.65;
  }

  .bookmark-meta-overwrite__fields {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 12px;
  }

  .bookmark-meta-overwrite__field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .bookmark-meta-overwrite__comparison {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .bookmark-meta-overwrite__value {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--surface-border-color) 74%, transparent);
    border-radius: 8px;
    background: var(--card-background);

    span {
      display: block;
      margin-bottom: 6px;
      color: var(--desc-color);
      font-size: 12px;
      font-weight: 600;
    }

    p {
      max-height: 112px;
      margin: 0;
      overflow: auto;
      color: var(--text-color);
      line-height: 1.6;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  }

  .bookmark-meta-overwrite__value--generated {
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 32%, var(--surface-border-color));
    background: color-mix(in srgb, var(--resource-bookmark-color) 7%, var(--card-background));
  }

  .bookmark-meta-overwrite__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 767px) {
    .bookmark-meta-overwrite__comparison {
      grid-template-columns: minmax(0, 1fr);
    }

    .bookmark-meta-overwrite__value p {
      max-height: 88px;
    }

    .bookmark-meta-overwrite__footer {
      flex-direction: column-reverse;

      :deep(.b_btn) {
        width: 100%;
        min-height: 42px;
      }
    }
  }
</style>
