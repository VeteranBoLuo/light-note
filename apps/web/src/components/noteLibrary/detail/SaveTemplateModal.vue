<template>
  <BModal v-model:visible="visible" :title="t('note.saveAsTemplate')" :show-footer="false" width="min(480px, 92vw)">
    <div class="tpl-form">
      <div class="form-field">
        <label>{{ t('note.tplNameLabel') }}</label>
        <BInput v-model:value="draft.name" :maxlength="60" :placeholder="t('note.tplNamePlaceholder')" />
        <span class="field-counter">{{ draft.name.length }}/60</span>
      </div>
      <div class="form-field">
        <label>{{ t('note.tplTitleLabel') }}</label>
        <BInput v-model:value="draft.titleTemplate" :maxlength="255" :placeholder="t('note.tplTitlePlaceholder')" />
      </div>
      <div class="form-field">
        <label>{{ t('note.tplDescLabel') }}</label>
        <BInput v-model:value="draft.description" :maxlength="255" :placeholder="t('note.tplDescPlaceholder')" />
      </div>
      <!-- 变量 token 由代码拼出:{{date}} 这类双花括号字面量放进 i18n 会被当插值语法解析 -->
      <p class="var-hint">
        {{ t('note.tplVarHint') }}
        <code v-for="token in variableTokens" :key="token">{{ token }}</code>
      </p>
      <div class="form-actions">
        <BButton @click="close">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
          {{ t('common.confirm') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { NOTE_TEMPLATE_VARIABLES } from '@/utils/noteTemplate.ts';

  const props = defineProps<{
    /** 当前编辑中的笔记(读 title/content/type 即可,提交时取实时值) */
    note: { title?: string; content?: string; type?: string };
  }>();
  const visible = defineModel<boolean>('visible');
  const { t } = useI18n();

  const draft = reactive({ name: '', titleTemplate: '', description: '' });
  const submitting = ref(false);
  const variableTokens = NOTE_TEMPLATE_VARIABLES.map((v) => `{{${v}}}`);
  const canSubmit = computed(() => draft.name.trim().length > 0);

  // immediate:父组件用 v-if 控制挂载,挂载瞬间 visible 已为 true,普通 watch 等不到变化
  watch(
    visible,
    (open) => {
      if (open) {
        const noteTitle = String(props.note?.title || '').trim();
        draft.name = noteTitle;
        draft.titleTemplate = noteTitle;
        draft.description = '';
      }
    },
    { immediate: true },
  );

  function close() {
    if (submitting.value) return;
    visible.value = false;
  }

  async function submit() {
    if (!canSubmit.value || submitting.value) return;
    submitting.value = true;
    try {
      const res = await apiBasePost('/api/note/addNoteTemplate', {
        name: draft.name.trim(),
        titleTemplate: draft.titleTemplate.trim(),
        description: draft.description.trim(),
        type: props.note?.type || 'html',
        content: props.note?.content || '',
      });
      if (res.status === 200) {
        message.success(t('note.tplSaved'));
        recordOperation({ module: '笔记', operation: `存为模板【${draft.name.trim()}】` });
        visible.value = false;
      } else {
        message.error(res.msg);
      }
    } finally {
      submitting.value = false;
    }
  }
</script>

<style scoped lang="less">
  .tpl-form {
    display: grid;
    gap: 16px;
  }
  .form-field {
    position: relative;
    display: grid;
    gap: 8px;

    label {
      color: var(--text-color);
      font-size: 14px;
      font-weight: 650;
    }
  }
  .field-counter {
    justify-self: end;
    margin-top: -4px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .var-hint {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--desc-color);
    background: var(--menu-item-h-bg-color);
    font-size: 12px;
    line-height: 1.8;

    code {
      margin: 0 3px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--menu-item-bg-color);
      color: var(--primary-color);
      font-size: 12px;
    }
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  :deep(.b-input) {
    min-height: 38px;
  }
</style>
