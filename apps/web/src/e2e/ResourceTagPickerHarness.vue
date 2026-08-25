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

    <section v-else-if="view === 'inline'" class="picker-harness__inline-shell">
      <ResourcePickerPanel
        :allowed-types="['bookmark', 'note', 'file']"
        :show-search="false"
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
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import TagIconPicker from '@/components/manage/tagEditMg/TagIconPicker.vue';

  defineProps<{ view: 'resource' | 'inline' | 'tag' }>();
  const { t } = useI18n();
  const resourceVisible = ref(true);
  const tagIcon = ref('');
  const noop = () => undefined;
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
