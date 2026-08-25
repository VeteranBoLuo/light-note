<template>
  <AiSkillDialog
    :visible="visible"
    :title="t('bookmarkMg.aiSkillTitle')"
    :description="t('bookmarkMg.aiSkillDescription')"
    skill-id="bookmark.summarize_page"
    prompt-key="instruction"
    surface="bookmark_manage"
    :resource-refs="resourceRefs"
    :scope-label="scopeLabel"
    :actions="actions"
    :show-prompt="false"
    auto-run-action-id="summarize"
    @update:visible="emit('update:visible', $event)"
  >
    <template #result-actions="{ response, result }">
      <BButton
        v-if="result?.kind === 'grounded_markdown' && response.sources.length"
        type="primary"
        :loading="creatingNote"
        :disabled="creatingNote"
        @click="createNoteFromSummary(response)"
      >
        {{ t('bookmarkMg.aiCreateNote') }}
      </BButton>
    </template>
  </AiSkillDialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import { useRouter } from 'vue-router';
  import { persistAiMarkdownResultAsNote } from '@/utils/aiNoteDraft';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const props = defineProps<{
    visible: boolean;
    bookmarks: readonly { id: string | number; name?: string; url?: string }[];
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
  const actions = computed(() => [
    {
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

  async function createNoteFromSummary(response: AiSkillResponse) {
    if (creatingNote.value) return;
    creatingNote.value = true;
    try {
      const handoff = await persistAiMarkdownResultAsNote(response, t('bookmarkMg.aiGeneratedNoteTitle'));
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
