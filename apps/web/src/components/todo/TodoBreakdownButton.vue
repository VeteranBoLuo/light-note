<template>
  <BButton size="small" :disabled="disabled" @click="visible = true">
    {{ t('aiSkills.todo.breakdownAction') }}
  </BButton>
  <AiSkillDialog
    :visible="visible"
    :title="t('aiSkills.todo.breakdownDialogTitle')"
    :description="t('aiSkills.todo.breakdownDialogDescription')"
    skill-id="todo.breakdown"
    prompt-key="instruction"
    surface="todo_editor"
    :resource-refs="resourceRefs"
    :scope-label="scopeLabel"
    :actions="actions"
    :show-prompt="false"
    @update:visible="visible = $event"
    @result-action="applyResult"
  />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import type { TodoChecklistItem } from '@/api/todoApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { mergeTodoBreakdownChecklist } from './todoBreakdown';

  const props = withDefaults(
    defineProps<{
      todoId?: string | null;
      title?: string;
      description?: string;
      checklist?: readonly TodoChecklistItem[];
      disabled?: boolean;
    }>(),
    { todoId: null, title: '', description: '', checklist: () => [], disabled: false },
  );
  const emit = defineEmits<{ apply: [items: TodoChecklistItem[]] }>();
  const { t } = useI18n();
  const visible = ref(false);
  const resourceRefs = computed<AiSkillResourceRef[]>(() =>
    props.todoId ? [{ type: 'todo', id: String(props.todoId) }] : [],
  );
  const scopeLabel = computed(() =>
    props.todoId ? t('aiSkills.todo.breakdownExistingScope') : t('aiSkills.todo.breakdownDraftScope'),
  );
  function currentInstruction(detailLevel: 'concise' | 'detailed') {
    const blocks = [
      t('aiSkills.todo.breakdownDefaultInstruction'),
      t(
        detailLevel === 'concise'
          ? 'aiSkills.todo.breakdownConciseInstruction'
          : 'aiSkills.todo.breakdownDetailedInstruction',
      ),
      props.title.trim() ? `${t('aiSkills.todo.currentTitle')}：${props.title.trim()}` : '',
      props.description.trim() ? `${t('aiSkills.todo.currentDescription')}：${props.description.trim()}` : '',
      props.checklist.some((item) => item.text.trim())
        ? `${t('aiSkills.todo.currentChecklist')}：${props.checklist
            .map((item) => item.text.trim())
            .filter(Boolean)
            .join('；')}`
        : '',
    ].filter(Boolean);
    return blocks.join('\n').slice(0, 1000);
  }
  const actions = computed(() =>
    props.title.trim() || props.description.trim() || props.checklist.some((item) => item.text.trim())
      ? [
          {
            id: 'breakdown-concise',
            label: t('aiSkills.todo.breakdownConcise'),
            input: { instruction: currentInstruction('concise'), detailLevel: 'concise' },
          },
          {
            id: 'breakdown-detailed',
            label: t('aiSkills.todo.breakdownDetailed'),
            input: { instruction: currentInstruction('detailed'), detailLevel: 'detailed' },
          },
        ]
      : [],
  );

  function applyResult(action: Record<string, unknown>, response: AiSkillResponse) {
    if (action.id !== 'apply_todo_breakdown') return;
    const result = response.result;
    if (result?.kind !== 'structured_draft' || result.draftType !== 'todo_breakdown') return;
    const items = mergeTodoBreakdownChecklist(props.checklist, Array.isArray(result.checklist) ? result.checklist : []);
    if (!items.length) return;
    emit('apply', items);
    visible.value = false;
  }
</script>
