<template>
  <BModal
    :visible="visible"
    :title="t('toolbox.project.join')"
    :show-footer="false"
    width="440px"
    :close-disabled="busy"
    @update:visible="close"
  >
    <div class="project-join" :class="{ 'is-pending': loading || failed }">
      <template v-if="joined">
        <p role="status">{{ t('toolbox.project.added') }}</p>
        <BButton type="primary" @click="openProject">{{ t('toolbox.project.open') }}</BButton>
      </template>
      <template v-else>
        <p class="project-join__summary">{{ t('toolbox.project.selected', { count: handoff.resources.length }) }}</p>
        <p v-if="failed" role="alert"
          >{{ t('toolbox.project.failed') }} <BButton @click="load">{{ t('common.retry') }}</BButton></p
        >
        <BLoading v-if="loading" inline loading />
        <template v-else-if="!failed">
          <div v-if="!createdId" class="project-join__filters">
            <BInput v-model:value="query" :placeholder="t('toolbox.project.search')" :disabled="busy" />
            <BSelect
              v-model:value="status"
              :disabled="busy"
              :options="statusOptions"
              :aria-label="t('toolbox.project.projectStatus')"
            />
          </div>
          <div class="project-join__field">
            <span class="project-join__label">{{ t('toolbox.project.choose') }}</span>
            <BSelect
              v-model:value="selectedId"
              :disabled="busy || !!createdId"
              :placeholder="t('toolbox.project.choose')"
              :options="projectOptions"
              :aria-label="t('toolbox.project.choose')"
            />
          </div>
          <p v-if="!projectOptions.length" class="project-join__empty">{{ t('toolbox.project.noMatching') }}</p>
          <div class="project-join__actions">
            <BButton v-if="!createdId" :disabled="busy" :aria-expanded="creating" @click="creating = !creating">{{
              t('toolbox.project.newProject')
            }}</BButton>
            <BButton :loading="busy" :disabled="!hasSelectedProject" type="primary" @click="add">{{
              t('toolbox.project.join')
            }}</BButton>
          </div>
          <template v-if="!createdId">
            <div v-if="creating" class="project-join__create">
              <BInput
                v-model:value="title"
                :disabled="busy"
                :maxlength="120"
                :placeholder="t('toolbox.workspace.titleLabel')"
              />
              <BSelect v-model:value="kind" :disabled="busy" :options="kindOptions" />
              <BButton type="primary" :loading="busy" :disabled="!title.trim()" @click="createAndAdd">{{
                t('toolbox.project.createThenJoin')
              }}</BButton>
            </div>
          </template>
        </template>
        <p v-if="joinFailed" role="alert">{{ t('toolbox.project.joinFailed') }}</p>
      </template>
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import {
    fetchToolboxWorkspaces,
    createToolboxWorkspace,
    addToolboxWorkspaceResources,
    type ToolboxWorkspaceSummary,
    type ToolboxWorkspaceKind,
  } from '@/api/toolbox';
  import { projectResourceHandoff, useProjectResourceAction } from '@/composables/useProjectResourceAction';
  import { useUserStore } from '@/store';
  import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  import { waitForCurrentMobileOverlayHistoryRelease } from '@/utils/mobileOverlayHistory';
  const props = defineProps<{ handoff: NonNullable<typeof projectResourceHandoff.value> }>();
  const emit = defineEmits<{ close: [token: number] }>();
  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const { canJoinProject } = useProjectResourceAction();
  const visible = ref(true),
    loading = ref(false),
    failed = ref(false),
    busy = ref(false),
    joined = ref(false),
    joinFailed = ref(false),
    creating = ref(false);
  const projects = ref<ToolboxWorkspaceSummary[]>([]);
  const query = ref(''),
    status = ref('active'),
    selectedId = ref(''),
    createdId = ref(''),
    title = ref('');
  const kind = ref<ToolboxWorkspaceKind>('research');
  const statusOptions = computed(() =>
    ['active', 'paused'].map((value) => ({ value, label: t(`toolbox.workspace.status.${value}`) })),
  );
  const kindOptions = computed(() =>
    ['research', 'learning', 'writing'].map((value) => ({ value, label: t(`toolbox.tool.${value}_workspace.name`) })),
  );
  const projectOptions = computed(() =>
    projects.value
      .filter(
        (p) =>
          p.id === createdId.value ||
          (p.status === status.value && p.title.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())),
      )
      .map((p) => ({ value: p.id, label: p.title })),
  );
  const hasSelectedProject = computed(() => projectOptions.value.some((p) => p.value === selectedId.value));
  function current() {
    return (
      canJoinProject.value &&
      props.handoff.owner === toolboxRecentUseIdentityKey(user) &&
      projectResourceHandoff.value?.token === props.handoff.token
    );
  }
  async function load() {
    loading.value = true;
    failed.value = false;
    try {
      const items = await fetchToolboxWorkspaces();
      if (current()) projects.value = items;
    } catch {
      if (current()) failed.value = true;
    } finally {
      if (current()) loading.value = false;
    }
  }
  async function link(id: string) {
    await addToolboxWorkspaceResources(id, props.handoff.resources, props.handoff.entrySource);
    if (current()) {
      selectedId.value = id;
      joined.value = true;
    }
  }
  async function add() {
    if (busy.value || !current() || !hasSelectedProject.value) return;
    busy.value = true;
    joinFailed.value = false;
    try {
      await link(selectedId.value);
    } catch {
      if (current()) joinFailed.value = true;
    } finally {
      if (current()) busy.value = false;
    }
  }
  async function createAndAdd() {
    if (busy.value || !current() || !title.value.trim()) return;
    busy.value = true;
    joinFailed.value = false;
    try {
      const project = await createToolboxWorkspace(
        { kind: kind.value, title: title.value.trim() },
        props.handoff.entrySource,
      );
      if (!current()) return;
      createdId.value = project.id;
      selectedId.value = project.id;
      projects.value.push(project);
      await link(project.id);
    } catch {
      if (current()) joinFailed.value = true;
    } finally {
      if (current()) busy.value = false;
    }
  }
  function close() {
    visible.value = false;
    emit('close', props.handoff.token);
  }
  async function openProject() {
    const id = selectedId.value;
    close();
    await waitForCurrentMobileOverlayHistoryRelease();
    await router.push({
      path: '/toolbox/research_workspace',
      query: { workspace: id, tab: 'resources', entry: props.handoff.entrySource },
    });
  }
  onMounted(load);
</script>
<style scoped lang="less">
  .project-join,
  .project-join__create {
    display: grid;
    gap: 16px;
  }
  .project-join.is-pending {
    min-height: 205px;
    align-content: start;
  }
  .project-join__filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px;
    gap: 10px;
  }
  .project-join__field {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .project-join__label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }
  .project-join__actions {
    display: flex;
    gap: 10px;
    padding-top: 4px;
  }
  .project-join__actions > .b_btn,
  .project-join__create > .b_btn {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    height: auto;
    white-space: normal;
    line-height: 1.4;
    padding: 8px 12px;
  }
  .project-join__empty {
    padding: 12px 0;
    font-size: 13px;
    text-align: center;
  }
  .project-join__summary {
    font-size: 13px;
  }
  .project-join p {
    margin: 0;
    color: var(--desc-color);
  }
  .project-join [role='alert'] {
    color: var(--danger-color);
  }
  .project-join__create {
    border-top: 1px solid var(--surface-border-color);
    padding-top: 16px;
  }
</style>
