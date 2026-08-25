<template>
  <main class="picker-harness">
    <BModal
      v-if="view === 'resource'"
      v-model:visible="resourceVisible"
      :title="t('inbox.todoAddResource')"
      width="460px"
      :show-footer="false"
    >
      <ResourcePickerPanel :allowed-types="['bookmark', 'note', 'file']" @select="noop" />
    </BModal>

    <BDrawer
      v-else-if="view === 'todo'"
      :open="todoOpen"
      title="创建待办"
      width="min(760px, 94vw)"
      @close="todoOpen = false"
    >
      <section class="picker-harness__todo">
        <label>
          <strong>说明</strong>
          <TodoResourceMentionInput
            v-model:value="todoDescription"
            :rows="4"
            placeholder="输入 @ 可关联书签、笔记或文件"
            @select="selectTodoResource"
          />
        </label>
        <div class="picker-harness__todo-actions">
          <BButton size="small" @click="todoResourceVisible = true">@ 添加资源</BButton>
          <span v-if="selectedResourceTitle">已关联：{{ selectedResourceTitle }}</span>
        </div>
        <BModal v-model:visible="todoResourceVisible" title="添加资源" width="460px" :show-footer="false">
          <ResourcePickerPanel
            :allowed-types="['bookmark', 'note', 'file']"
            @select="selectTodoResource"
            @close="todoResourceVisible = false"
          />
        </BModal>
      </section>
    </BDrawer>

    <section v-else-if="view === 'inline'" class="picker-harness__inline-shell">
      <ResourcePickerPanel
        :allowed-types="['bookmark', 'note', 'file']"
        :show-search="false"
        inline
        keyword=""
        @select="noop"
      />
    </section>

    <section v-else class="picker-harness__tag-card">
      <h1>{{ t('tagManage.editorEditTitle') }}</h1>
      <TagIconPicker v-model:value="tagIcon" tag-name="中文阅读资料" />
    </section>
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import TagIconPicker from '@/components/manage/tagEditMg/TagIconPicker.vue';
  import TodoResourceMentionInput from '@/components/todo/TodoResourceMentionInput.vue';
  import type { ResourcePickerItem } from '@/composables/useResourcePickerSearch';

  defineProps<{ view: 'resource' | 'inline' | 'tag' | 'todo' }>();
  const { t } = useI18n();
  const resourceVisible = ref(true);
  const todoOpen = ref(true);
  const todoResourceVisible = ref(false);
  const todoDescription = ref('');
  const selectedResourceTitle = ref('');
  const tagIcon = ref('');
  const noop = () => undefined;
  function selectTodoResource(item: ResourcePickerItem) {
    selectedResourceTitle.value = item.title;
    todoResourceVisible.value = false;
  }
</script>

<style lang="less">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }

  body {
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .picker-harness {
    display: grid;
    min-height: 100vh;
    padding: 40px;
    place-items: start center;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent 48%),
      var(--background-color);
  }

  .picker-harness__tag-card {
    width: min(760px, 100%);
    margin-top: 10vh;
    padding: 24px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .picker-harness__inline-shell {
    margin-top: 10vh;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--menu-body-bg-color, var(--card-background));
    box-shadow: 0 14px 36px rgb(0 0 0 / 20%);
  }

  .picker-harness__todo {
    display: grid;
    gap: 12px;
    padding: 20px;
  }

  .picker-harness__todo label {
    display: grid;
    gap: 8px;
  }

  .picker-harness__todo-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--desc-color);
    font-size: 13px;
  }

  .picker-harness__tag-card h1 {
    margin: 0 0 20px;
    font-size: 22px;
  }

  html.light-note-mobile-rendering .picker-harness {
    padding: 16px;
    background: var(--background-color);
  }

  html.light-note-mobile-rendering .picker-harness__tag-card {
    margin-top: 6vh;
    padding: 16px;
  }
</style>
