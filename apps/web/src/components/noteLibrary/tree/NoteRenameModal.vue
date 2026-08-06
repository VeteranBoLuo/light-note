<template>
  <BModal
    v-model:visible="visible"
    :title="t('note.renamePage')"
    :mask-closable="false"
    :show-footer="false"
    width="min(440px, calc(100% - 24px))"
  >
    <div class="note-rename-modal">
      <label class="note-rename-modal__label" for="note-page-rename-input">{{ t('note.pageTitle') }}</label>
      <BInput
        id="note-page-rename-input"
        v-model:value="title"
        :maxlength="255"
        :placeholder="t('note.renamePlaceholder')"
        clearable
        @keydown.enter.prevent="submit"
      />
      <div class="note-rename-modal__footer">
        <BButton :disabled="saving" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" :disabled="!normalizedTitle" @click="submit">
          {{ t('common.confirm') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';

  const props = defineProps<{ note: { id: string; title?: string } | null }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ renamed: [note: { id: string; title: string }] }>();
  const { t } = useI18n();
  const title = ref('');
  const saving = ref(false);
  const normalizedTitle = computed(() => title.value.trim());

  watch(
    () => [visible.value, props.note?.id, props.note?.title] as const,
    ([isVisible]) => {
      if (isVisible) title.value = String(props.note?.title || '').slice(0, 255);
    },
    { immediate: true },
  );

  async function submit() {
    const noteId = String(props.note?.id || '').trim();
    const nextTitle = normalizedTitle.value;
    if (saving.value || !noteId || !nextTitle) return;
    if (nextTitle === String(props.note?.title || '').trim()) {
      visible.value = false;
      return;
    }
    saving.value = true;
    try {
      const response = await apiBasePost('/api/note/updateNote', { id: noteId, title: nextTitle });
      if (response.status !== 200) {
        message.error(response.msg || t('note.renameFailed'));
        return;
      }
      emit('renamed', { id: noteId, title: nextTitle });
      message.success(t('note.renameSuccess'));
      visible.value = false;
    } catch {
      message.error(t('note.renameFailed'));
    } finally {
      saving.value = false;
    }
  }
</script>

<style scoped lang="less">
  .note-rename-modal {
    display: grid;
    gap: 10px;
  }

  .note-rename-modal__label {
    color: var(--desc-color);
    font-size: 13px;
  }

  .note-rename-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;

    :deep(.b_btn) {
      min-height: 38px;
    }
  }

  @media (max-width: 767px) {
    .note-rename-modal__footer :deep(.b_btn) {
      min-height: 44px;
    }
  }
</style>
