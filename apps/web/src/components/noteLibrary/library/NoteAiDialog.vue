<template>
  <AiSkillDialog
    :visible="visible"
    :title="t('note.aiSkillTitle')"
    :description="t('note.aiSkillDescription')"
    skill-id="note.batch_summarize"
    prompt-key="instruction"
    surface="note_library"
    :resource-refs="resourceRefs"
    :scope-label="t('note.aiSkillScope', { count: resourceRefs.length })"
    :actions="actions"
    :placeholder="t('note.aiSkillPlaceholder')"
    @update:visible="emit('update:visible', $event)"
    @result-action="handleResultAction"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { createAiNoteDraftHandoff } from '@/utils/aiNoteDraft';

  const props = defineProps<{
    visible: boolean;
    notes: readonly { id: string | number; title?: string }[];
  }>();
  const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
  const { t } = useI18n();
  const router = useRouter();

  const resourceRefs = computed<AiSkillResourceRef[]>(() =>
    props.notes.slice(0, 20).map((note) => ({ type: 'note', id: String(note.id) })),
  );
  const actions = computed(() => {
    const items = [
      {
        id: 'summarize',
        label: t('note.aiSummarize'),
        skillId: 'note.batch_summarize',
        input: { instruction: t('note.aiSummarizeInstruction') },
      },
    ];
    if (resourceRefs.value.length >= 2 && resourceRefs.value.length <= 10) {
      items.push({
        id: 'compare',
        label: t('note.aiCompare'),
        skillId: 'note.batch_compare',
        input: { instruction: t('note.aiCompareInstruction') },
      });
    }
    items.push(
      {
        id: 'create-note',
        label: t('note.aiCreateNote'),
        skillId: 'note.create_from_sources',
        input: { instruction: t('note.aiCreateNoteInstruction') },
      },
      {
        id: 'extract-todos',
        label: t('note.aiExtractTodos'),
        skillId: 'note.extract_todos',
        input: { instruction: t('note.aiExtractTodosInstruction') },
      },
    );
    return items;
  });

  function handleResultAction(action: Record<string, unknown>, response: AiSkillResponse) {
    if (action.id !== 'create_note_from_preview') return;
    const handoff = createAiNoteDraftHandoff(response, t('note.aiGeneratedNoteTitle'));
    if (!handoff) return;
    emit('update:visible', false);
    void router.push(handoff.route);
  }
</script>
