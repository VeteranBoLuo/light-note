<template>
  <NewNotePickerModal
    v-model:visible="visible"
    :builtin-templates="orderedBuiltinTemplates"
    :my-templates="orderedMyTemplates"
    :my-templates-state="myTemplatesState"
    :template-icons="templateIcons"
    @select-blank="selectBlank"
    @select-builtin="selectBuiltin"
    @select-mine="selectMine"
    @manage="openTemplateManager"
    @retry="loadMyTemplates"
  />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import NewNotePickerModal from '@/components/noteLibrary/library/NewNotePickerModal.vue';
  import { apiBasePost } from '@/http/request';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import icon from '@/config/icon';
  import { BUILTIN_NOTE_TEMPLATES, sortBuiltinNoteTemplates } from '@/config/noteTemplates';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  type NoteEditorType = 'html' | 'markdown' | 'drawing';
  type TemplateLoadState = 'idle' | 'loading' | 'success' | 'error';

  interface MyTemplate {
    id: string;
    name: string;
    description?: string;
    type: string;
  }

  const visible = defineModel<boolean>('visible', { default: false });
  const router = useRouter();
  const myTemplates = ref<MyTemplate[]>([]);
  const myTemplatesState = ref<TemplateLoadState>('idle');
  const templateUsage = ref<Record<string, number>>(readTemplateUsage());
  let templatesRequestSequence = 0;

  const templateIcons: Record<string, string> = {
    daily: icon.noteTemplate.daily,
    weekly: icon.noteTemplate.weekly,
    meeting: icon.noteTemplate.meeting,
    reading: icon.noteTemplate.reading,
    project: icon.noteTemplate.project,
    review: icon.noteTemplate.review,
    knowledge: icon.noteTemplate.knowledge,
    mindmap: icon.noteTemplate.mindmap,
  };
  const orderedBuiltinTemplates = computed(() => sortBuiltinNoteTemplates(BUILTIN_NOTE_TEMPLATES, templateUsage.value));
  const orderedMyTemplates = computed(() =>
    [...myTemplates.value].sort(
      (left, right) =>
        Number(templateUsage.value[`mine:${right.id}`] || 0) - Number(templateUsage.value[`mine:${left.id}`] || 0),
    ),
  );

  watch(
    visible,
    (open) => {
      if (open) void loadMyTemplates();
    },
    { immediate: true },
  );

  function readTemplateUsage(): Record<string, number> {
    try {
      const parsed = JSON.parse(localStorage.getItem('note-template-recent-usage') || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  async function loadMyTemplates() {
    const sequence = ++templatesRequestSequence;
    if (myTemplatesState.value !== 'success') myTemplatesState.value = 'loading';
    try {
      const response = await apiBasePost('/api/note/queryNoteTemplates');
      if (sequence !== templatesRequestSequence) return;
      if (response.status === 200) {
        myTemplates.value = Array.isArray(response.data) ? response.data : [];
        myTemplatesState.value = 'success';
      } else {
        myTemplatesState.value = 'error';
      }
    } catch {
      if (sequence === templatesRequestSequence) myTemplatesState.value = 'error';
    }
  }

  function rememberTemplate(query: Record<string, string>) {
    const key = query.builtin ? `builtin:${query.builtin}` : query.templateId ? `mine:${query.templateId}` : '';
    if (!key) return;
    templateUsage.value = { ...templateUsage.value, [key]: Date.now() };
    localStorage.setItem('note-template-recent-usage', JSON.stringify(templateUsage.value));
  }

  async function openNote(query: Record<string, string>) {
    if (blockGuestWrite('add-note')) {
      visible.value = false;
      return;
    }
    rememberTemplate(query);
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => router.push({ path: '/noteLibrary/add', query }),
    );
  }

  function selectBlank(type: NoteEditorType) {
    void openNote({ type });
  }

  function selectBuiltin(template: { key: string; type: NoteEditorType }) {
    void openNote({ type: template.type, builtin: template.key });
  }

  function selectMine(template: MyTemplate) {
    void openNote({ type: template.type, templateId: template.id });
  }

  async function openTemplateManager() {
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => router.push('/noteLibrary/templates'),
    );
  }
</script>
