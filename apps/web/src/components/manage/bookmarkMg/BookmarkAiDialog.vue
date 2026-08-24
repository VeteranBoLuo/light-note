<template>
  <AiSkillDialog
    :visible="visible"
    :title="t('bookmarkMg.aiSkillTitle')"
    :description="t('bookmarkMg.aiSkillDescription')"
    :skill-id="skillId"
    prompt-key="instruction"
    surface="bookmark_manage"
    :resource-refs="resourceRefs"
    :scope-label="scopeLabel"
    :actions="actions"
    :show-prompt="false"
    :auto-run-action-id="props.mode === 'create_note' ? '' : 'summarize'"
    @update:visible="emit('update:visible', $event)"
    @result-action="handleResultAction"
  />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResourceRef } from '@lightnote/shared/ai-skill-protocol';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { useRouter } from 'vue-router';
  import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import { persistAiNotePreview } from '@/utils/aiNoteDraft';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const props = defineProps<{
    visible: boolean;
    bookmarks: readonly { id: string | number; name?: string; url?: string }[];
    mode?: 'analyze' | 'create_note';
  }>();
  const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
  const { t } = useI18n();
  const router = useRouter();
  const creatingNote = ref(false);

  const resourceRefs = computed<AiSkillResourceRef[]>(() =>
    props.bookmarks.slice(0, 1).map((bookmark) => ({ type: 'bookmark', id: String(bookmark.id) })),
  );
  const activeBookmark = computed(() => props.bookmarks[0] || null);
  const scopeLabel = computed(() =>
    activeBookmark.value
      ? `${t('bookmarkMg.resourceTypeBookmark')} · ${activeBookmark.value.name || activeBookmark.value.url || t('bookmarkMg.untitled')}`
      : '',
  );
  const skillId = computed(() =>
    props.mode === 'create_note' ? 'bookmark.create_note_preview' : 'bookmark.summarize_page',
  );
  const actions = computed(() => [
    props.mode === 'create_note'
      ? {
          id: 'create-note',
          label: t('bookmarkMg.aiCreateNote'),
          skillId: 'bookmark.create_note_preview',
          input: { instruction: t('bookmarkMg.aiCreateNoteInstruction') },
        }
      : {
          id: 'summarize',
          label: t('bookmarkMg.aiSummarize'),
          skillId: 'bookmark.summarize_page',
          input: {
            instruction: t('bookmarkMg.aiSummarizeCurrentInstruction', {
              name: activeBookmark.value?.name || activeBookmark.value?.url || t('bookmarkMg.untitled'),
            }),
          },
        },
  ]);

  async function handleResultAction(action: Record<string, unknown>, response: AiSkillResponse) {
    if (action.id !== 'create_note_from_preview' || creatingNote.value) return;
    creatingNote.value = true;
    try {
      const handoff = await persistAiNotePreview(response, t('bookmarkMg.aiGeneratedNoteTitle'));
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
