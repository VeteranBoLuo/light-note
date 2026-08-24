<template>
  <AiSkillDialog
    :visible="visible"
    :title="t('bookmarkMg.aiSkillTitle')"
    :description="t('bookmarkMg.aiSkillDescription')"
    :skill-id="skillId"
    prompt-key="instruction"
    surface="bookmark_manage"
    :resource-refs="resourceRefs"
    :scope-label="t('bookmarkMg.aiSkillScope', { count: resourceRefs.length })"
    :actions="actions"
    :placeholder="t('bookmarkMg.aiSkillPlaceholder')"
    @update:visible="emit('update:visible', $event)"
    @result-action="handleResultAction"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResourceRef } from '@lightnote/shared/ai-skill-protocol';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { useRouter } from 'vue-router';
  import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import { createAiNoteDraftHandoff } from '@/utils/aiNoteDraft';

  const props = defineProps<{
    visible: boolean;
    bookmarks: readonly { id: string | number; name?: string; url?: string }[];
    mode?: 'analyze' | 'create_note';
  }>();
  const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
  const { t } = useI18n();
  const router = useRouter();

  const resourceRefs = computed<AiSkillResourceRef[]>(() =>
    props.bookmarks.slice(0, 10).map((bookmark) => ({ type: 'bookmark', id: String(bookmark.id) })),
  );
  const multiple = computed(() => resourceRefs.value.length > 1);
  const skillId = computed(() =>
    props.mode === 'create_note'
      ? 'bookmark.create_note_preview'
      : multiple.value
        ? 'bookmark.compare_pages'
        : 'bookmark.summarize_page',
  );
  const actions = computed(() => [
    props.mode === 'create_note'
      ? {
          id: 'create-note',
          label: t('bookmarkMg.aiCreateNote'),
          skillId: 'bookmark.create_note_preview',
          input: { instruction: t('bookmarkMg.aiCreateNoteInstruction') },
        }
      : multiple.value
      ? {
          id: 'compare',
          label: t('bookmarkMg.aiCompare'),
          skillId: 'bookmark.compare_pages',
          input: { instruction: t('bookmarkMg.aiCompareInstruction') },
        }
      : {
          id: 'summarize',
          label: t('bookmarkMg.aiSummarize'),
          skillId: 'bookmark.summarize_page',
          input: { instruction: t('bookmarkMg.aiSummarizeInstruction') },
        },
  ]);

  function handleResultAction(action: Record<string, unknown>, response: AiSkillResponse) {
    if (action.id !== 'create_note_from_preview') return;
    const handoff = createAiNoteDraftHandoff(response, t('bookmarkMg.aiGeneratedNoteTitle'));
    if (!handoff) return;
    emit('update:visible', false);
    void router.push(handoff.route);
  }
</script>
