<template>
  <BModal
    :key="modalKey"
    :visible="true"
    :title="title"
    width="580px"
    fullscreen-mobile
    :show-footer="false"
    :close-disabled="busy"
    @close="requestClose"
  >
    <div class="board-editor">
      <p v-if="hint" class="board-editor__hint">{{ hint }}</p>
      <p v-if="state" class="board-editor__hint">{{ state }}</p>
      <BButton v-if="sourceTitle" class="board-editor__source" @click="$emit('source')">{{
        t('toolbox.board.from', { title: sourceTitle })
      }}</BButton>
      <label
        ><span>{{ t('toolbox.workspace.itemTitleLabel') }}</span
        ><BInput v-model:value="form.title" :disabled="readonly || busy" :maxlength="255" class="board-editor-title"
      /></label>
      <label
        ><span>{{ t('toolbox.workspace.itemNoteLabel') }}</span
        ><BInput v-model:value="form.content" :disabled="readonly || busy" type="textarea" :rows="6" :maxlength="5000"
      /></label>
      <label
        ><span>{{ t('toolbox.workspace.itemDueLabel') }}</span
        ><BDateTimePicker v-model:value="form.dueOn" :disabled="readonly || busy" :show-time="false"
      /></label>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="board-editor__footer"
        ><BButton :disabled="busy" @click="requestClose">{{ t(readonly ? 'common.close' : 'common.cancel') }}</BButton
        ><BButton
          v-if="!readonly"
          type="primary"
          :loading="busy"
          :disabled="!form.title.trim()"
          @click="$emit('save', { ...form, dueOn: form.dueOn || null })"
          >{{ t('common.save') }}</BButton
        ></div
      >
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { reactive, ref, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  const props = defineProps<{
    title: string;
    hint?: string;
    state?: string;
    sourceTitle?: string;
    initial: { title: string; content: string; dueOn: string | null };
    readonly?: boolean;
    busy: boolean;
    error?: string;
  }>();
  const emit = defineEmits<{
    close: [];
    save: [data: { title: string; content: string; dueOn: string | null }];
    source: [];
  }>();
  const { t } = useI18n();
  const form = reactive({ ...props.initial, dueOn: props.initial.dueOn || '' });
  const original = JSON.stringify(form);
  const modalKey = ref(0);
  const dirty = computed(() => !props.readonly && JSON.stringify(form) !== original);
  function requestClose() {
    if (props.busy) return;
    if (!dirty.value) {
      emit('close');
      return;
    }
    modalKey.value++;
    Alert.alert({
      title: t('toolbox.board.unsaved'),
      content: t('toolbox.board.discardHint'),
      okText: t('toolbox.board.discard'),
      cancelText: t('common.cancel'),
      onOk: () => emit('close'),
    });
  }
</script>
<style scoped>
  .board-editor {
    display: grid;
    gap: 16px;
  }
  .board-editor label {
    display: grid;
    gap: 7px;
    font-size: 13px;
  }
  .board-editor__hint {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.6;
    font-size: 12px;
  }
  .board-editor__footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .board-editor__source.b_btn {
    height: auto;
    white-space: normal;
    background: transparent;
    color: var(--workspace-purple-text, var(--primary-color));
    justify-content: flex-start;
    text-align: left;
    line-height: 1.5;
  }
</style>
