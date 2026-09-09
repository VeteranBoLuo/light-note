<template>
  <section
    v-if="visible"
    ref="root"
    class="workshop-entry"
    :class="{ 'is-inline': inline, 'is-tab-panel': tabPanel, 'is-empty': !data?.projects.length }"
  >
    <div v-if="!eligible" class="workshop-entry__row">
      <div
        ><strong>{{ t('toolbox.project.myProjects') }}</strong
        ><p>{{ t('toolbox.project.guestHint') }}</p></div
      >
      <div class="workshop-entry__actions">
        <BButton type="primary" @click="router.push({ name: 'login' })">{{ t('toolbox.home.guestAction') }}</BButton>
        <BButton @click="openProjects(false)">{{ t('toolbox.project.learn') }}</BButton>
      </div>
    </div>
    <p v-else-if="loading">{{ t('toolbox.project.loading') }}</p>
    <div v-else-if="failed" class="workshop-entry__row" role="alert"
      ><span>{{ t('toolbox.project.failed') }}</span
      ><BButton @click="load(true)">{{ t('common.retry') }}</BButton></div
    >
    <template v-else-if="data">
      <header v-if="!tabPanel || !data.projects.length" class="workshop-entry__row">
        <div
          ><strong>{{ t(data.hasProjects ? 'toolbox.project.continueTitle' : 'toolbox.project.intro') }}</strong
          ><p v-if="!data.hasProjects">{{ t('toolbox.project.introHint') }}</p></div
        >
        <div class="workshop-entry__actions">
          <BButton v-if="!data.projects.length && user.role !== 'visitor'" type="primary" @click="openProjects(true)">{{
            t('toolbox.project.newProject')
          }}</BButton>
          <BButton @click="openProjects(false)">{{
            t(data.hasProjects ? 'toolbox.project.allProjects' : 'toolbox.project.learn')
          }}</BButton>
        </div>
      </header>
      <div v-if="data.projects.length" class="workshop-entry__projects">
        <BButton
          v-for="project in data.projects.slice(0, 3)"
          :key="project.id"
          class="workshop-entry__project"
          @click="openProject(project.id)"
        >
          <SvgIcon class="project-row__icon" :src="projectIcons[project.kind]" size="20" />
          <strong class="project-row__title">{{ project.title }}</strong>
          <span class="project-row__type">{{ t(`toolbox.tool.${project.kind}_workspace.name`) }}</span>
          <SvgIcon class="project-row__arrow" :src="icon.toolbox.arrow" size="15" />
          <small class="project-row__next">{{
            project.nextStep
              ? t('toolbox.workspace.nextStep') + '：' + project.nextStep
              : t('toolbox.workspace.noNextStep')
          }}</small>
        </BButton>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useToolboxProjectEntry } from '@/composables/useToolboxProjectEntry';
  import { recordAiProductEvent } from '@/api/aiTelemetry';
  import { useUserStore } from '@/store';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineProps<{ inline?: boolean; tabPanel?: boolean }>();
  const emit = defineEmits<{ state: [value: { visible: boolean; count: number }] }>();
  const { t } = useI18n();
  const router = useRouter();
  const mobile = useMobileLayout();
  const { data, loading, failed, eligible, owner, load } = useToolboxProjectEntry();
  const user = useUserStore();
  const visible = computed(() => !user.adminContext);
  watch(
    [visible, data, failed, loading],
    () =>
      emit('state', {
        visible: visible.value,
        count: visible.value && !failed.value && !loading.value ? Math.min(data.value?.projects.length || 0, 3) : 0,
      }),
    { immediate: true },
  );
  const projectIcons = {
    research: icon.toolbox.research,
    learning: icon.toolbox.study,
    writing: icon.toolbox.materialNote,
  };
  const root = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | undefined;
  let seen = false;
  watch(owner, () => {
    seen = false;
  });
  function event(name: 'workshop_entry_impression' | 'workshop_entry_opened') {
    void recordAiProductEvent(name, { surface: mobile.value ? 'mobile' : 'desktop', entrySource: 'workbench' });
  }
  watch([root, data, loading, failed], ([element]) => {
    observer?.disconnect();
    if (!element || seen || loading.value || failed.value || !data.value) return;
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !seen) {
        seen = true;
        event('workshop_entry_impression');
        observer?.disconnect();
      }
    });
    observer.observe(element);
  });
  onBeforeUnmount(() => observer?.disconnect());
  function openProjects(create: boolean) {
    event('workshop_entry_opened');
    void router.push(
      create
        ? '/toolbox/research_workspace?create=1&entry=workbench'
        : data.value?.hasProjects
          ? '/toolbox/research_workspace?entry=workbench'
          : '/toolbox',
    );
  }
  function openProject(id: string) {
    event('workshop_entry_opened');
    void router.push({
      path: '/toolbox/research_workspace',
      query: { workspace: id, entry: 'workbench' },
    });
  }
</script>
<style scoped lang="less">
  .workshop-entry {
    margin: 16px 0;
    padding: 16px 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    color: var(--text-color);
  }
  .workshop-entry__row,
  .workshop-entry__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .workshop-entry p {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 13px;
  }
  .workshop-entry__projects {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .workshop-entry__project.b_btn {
    width: 100%;
    height: auto;
    min-height: 64px;
    text-align: left;
    justify-content: flex-start;
    gap: 12px;
    padding: 12px;
    white-space: normal;
    background: var(--workspace-panel-bg-color);
  }
  .workshop-entry__project small {
    color: var(--desc-color);
  }
  @media (max-width: 767px) {
    .workshop-entry {
      padding: 14px;
    }
    .workshop-entry__row {
      flex-wrap: wrap;
    }
    .workshop-entry__projects {
      grid-template-columns: 1fr;
    }
    .workshop-entry__actions {
      flex-wrap: wrap;
    }
    .workshop-entry :deep(.b_btn) {
      min-height: 44px;
    }
  }
  .workshop-entry.is-inline {
    margin: 0 0 10px;
    padding: 0 0 10px;
    border: 0;
    border-bottom: 1px solid var(--surface-divider-color);
    border-radius: 0;
    background: transparent;
    .workshop-entry__row {
      gap: 6px;
      flex-wrap: wrap;
    }
    .workshop-entry__row strong {
      font-size: 12px;
      color: var(--desc-color);
    }
    .workshop-entry__actions {
      gap: 4px;
      flex-wrap: wrap;
    }
    .workshop-entry__actions .b_btn {
      font-size: 12px;
      min-height: 30px;
      padding: 4px 7px;
    }
    .workshop-entry__projects {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
      margin-top: 4px;
    }
    .workshop-entry__project.b_btn {
      min-height: 50px;
      padding: 6px;
      gap: 8px;
      background: transparent;
    }
    .workshop-entry__project.b_btn:hover {
      background: var(--hover-background);
    }
    .workshop-entry__project strong {
      font-size: 13px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .workshop-entry__project small {
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  @media (max-width: 767px) {
    .workshop-entry.is-inline .workshop-entry__actions .b_btn {
      height: 32px;
      min-height: 32px;
      padding: 0 10px;
      line-height: normal;
    }
  }
  .workshop-entry.is-tab-panel {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .workshop-entry.is-tab-panel .workshop-entry__projects {
    margin-top: 0;
  }
  .workshop-entry.is-tab-panel.is-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .workshop-entry.is-tab-panel.is-empty > .workshop-entry__row {
    flex-direction: column;
    justify-content: center;
  }
  .workshop-entry.is-tab-panel.is-empty .workshop-entry__actions {
    justify-content: center;
  }
  .workshop-entry .workshop-entry__project.b_btn,
  .workshop-entry.is-inline .workshop-entry__project.b_btn {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto 15px;
    grid-template-rows: 20px 16px;
    column-gap: 8px;
    row-gap: 4px;
    align-content: center;
    align-items: center;
    height: auto;
    min-height: 60px;
    padding: 8px;
    line-height: 20px;
    background: transparent;
  }
  .workshop-entry .project-row__icon {
    grid-column: 1;
    grid-row: 1;
  }
  .workshop-entry .workshop-entry__project .project-row__title {
    grid-column: 2;
    grid-row: 1;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .workshop-entry .workshop-entry__project .project-row__type {
    grid-column: 3;
    grid-row: 1;
    color: var(--desc-color);
    font-size: 11px;
  }
  .workshop-entry .project-row__arrow {
    grid-column: 4;
    grid-row: 1;
    color: var(--desc-color);
  }
  .workshop-entry .workshop-entry__project .project-row__next {
    line-height: 16px;
    grid-column: 2 / -1;
    grid-row: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--desc-color);
    font-size: 11px;
    text-align: left;
  }
  .workshop-entry .workshop-entry__project.b_btn:hover {
    background: var(--hover-background);
  }
</style>
