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
    :show-prompt="false"
    @update:visible="emit('update:visible', $event)"
    @result-action="handleResultAction"
  />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { persistAiNotePreview } from '@/utils/aiNoteDraft';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const props = defineProps<{
    visible: boolean;
    notes: readonly { id: string | number; title?: string }[];
  }>();
  const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
  const { t } = useI18n();
  const router = useRouter();
  const creatingNote = ref(false);

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
    items.push({
      id: 'create-note',
      label: t('note.aiCreateNote'),
      skillId: 'note.create_from_sources',
      input: {
        instruction: t('note.aiCreateNoteInstruction'),
        title:
          props.notes.length === 1
            ? t('note.aiGeneratedSingleNoteTitle', {
                title: props.notes[0]?.title || t('note.aiGeneratedNoteTitle'),
              })
            : t('note.aiGeneratedMultiNoteTitle', {
                title: props.notes[0]?.title || t('note.aiGeneratedNoteTitle'),
                count: props.notes.length,
              }),
      },
    });
    return items;
  });

  async function handleResultAction(action: Record<string, unknown>, response: AiSkillResponse) {
    if (action.id !== 'create_note_from_preview' || creatingNote.value) return;
    creatingNote.value = true;
    try {
      const handoff = await persistAiNotePreview(response, t('note.aiGeneratedNoteTitle'));
      if (!handoff) return;
      message.success(t('aiSkills.noteCreated'));
      emit('update:visible', false);
      await router.push(handoff.route);
    } catch (error: any) {
      message.error(String(error?.message || t('aiSkills.noteCreateFailed')));
    } finally {
      creatingNote.value = false;
    }
  }
</script>
