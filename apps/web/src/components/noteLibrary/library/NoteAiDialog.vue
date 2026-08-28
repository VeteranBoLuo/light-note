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
    :show-grounding="false"
    :auto-run-action-id="resourceRefs.length ? 'summarize' : ''"
    @update:visible="emit('update:visible', $event)"
  >
    <template #result-actions="{ response, result }">
      <BButton
        v-if="result?.kind === 'grounded_markdown' && response.sources.length"
        type="primary"
        :loading="creatingNote"
        :disabled="creatingNote"
        @click="createNoteFromAnalysis(response)"
      >
        {{ t('aiSkills.saveAsNote') }}
      </BButton>
    </template>
  </AiSkillDialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { persistAiMarkdownResultAsNote } from '@/utils/aiNoteDraft';
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
  const actions = computed(() => [
    {
      id: 'summarize',
      label: t('note.aiSummarize'),
      skillId: 'note.batch_summarize',
      input: { instruction: t('note.aiSummarizeInstruction') },
    },
  ]);
  const generatedNoteTitle = computed(() =>
    resourceRefs.value.length === 1
      ? t('note.aiGeneratedSingleNoteTitle', {
          title: props.notes[0]?.title || t('note.aiGeneratedNoteTitle'),
        })
      : t('note.aiGeneratedMultiNoteTitle', {
          title: props.notes[0]?.title || t('note.aiGeneratedNoteTitle'),
          count: props.notes.length,
        }),
  );

  async function createNoteFromAnalysis(response: AiSkillResponse) {
    if (creatingNote.value) return;
    creatingNote.value = true;
    try {
      const handoff = await persistAiMarkdownResultAsNote(response, generatedNoteTitle.value);
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
