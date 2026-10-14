<template>
  <section class="audit-result">
    <div v-if="sections.length" class="audit-result__toolbar">
      <BChip tone="neutral" interactive :selected="view === 'review'" @click="view = 'review'">{{
        t('toolbox.auditResult.review')
      }}</BChip>
      <BChip tone="neutral" interactive :selected="view === 'full'" @click="view = 'full'">{{
        t('toolbox.auditResult.full')
      }}</BChip>
      <BButton size="small" @click="$emit('sources')">{{ t('toolbox.task.viewMaterials') }}</BButton>
      <span>{{ t('toolbox.auditResult.progress', { done: checked.length, total: sections.length }) }}</span>
    </div>
    <template v-if="sections.length && view === 'review'">
      <p class="audit-result__hint">{{ t('toolbox.auditResult.hint') }}</p>
      <article
        v-for="section in sections"
        :key="section.id"
        class="audit-result__section"
        :class="{ 'is-checked': checked.includes(section.id) }"
      >
        <header
          ><strong>{{ section.title }}</strong
          ><BCheckbox :checked="checked.includes(section.id)" controlled @update:checked="toggle(section.id, $event)">{{
            t('toolbox.auditResult.checked')
          }}</BCheckbox></header
        >
        <CommunityMarkdown :body="section.content" />
      </article>
    </template>
    <slot v-else />
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import CommunityMarkdown from '@/components/community/CommunityMarkdown.vue';
  import { parseToolboxAuditSections } from '@/utils/toolboxAuditSections';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { useUserStore } from '@/store';
  const props = defineProps<{ artifactId: string; version: number; content: string }>();
  defineEmits<{ sources: [] }>();
  const { t } = useI18n(),
    user = useUserStore();
  const view = ref('review'),
    checked = ref<string[]>([]);
  const sections = computed(() => parseToolboxAuditSections(props.content));
  const storageKey = computed(
    () => `lightnote:audit-review:${buildNoteDetailRequestScope(user)}:${props.artifactId}:${props.version}`,
  );
  watch(
    storageKey,
    (key) => {
      checked.value = [];
      try {
        const value = localStorage.getItem(key);
        const saved = value && value.length < 10000 ? JSON.parse(value) : [];
        if (Array.isArray(saved))
          checked.value = sections.value.map((section) => section.id).filter((id) => saved.includes(id));
      } catch {
        /* Local review markers are optional; the report remains available. */
      }
    },
    { immediate: true },
  );
  function toggle(id: string, value: boolean) {
    checked.value = value ? [...new Set([...checked.value, id])] : checked.value.filter((item) => item !== id);
    try {
      localStorage.setItem(storageKey.value, JSON.stringify(checked.value));
    } catch {
      /* Storage may be disabled. */
    }
  }
</script>
<style scoped lang="less">
  .audit-result {
    display: grid;
    gap: var(--ui-space-14, 14px);
  }
  .audit-result__toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .audit-result__toolbar > span {
    margin-left: auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .audit-result__hint {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .audit-result__section {
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    padding: var(--ui-space-16, 16px);
  }
  .audit-result__section.is-checked {
    border-color: var(--success-color);
  }
  .audit-result__section header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    flex-wrap: wrap;
    margin-bottom: var(--ui-space-12, 12px);
  }
  .audit-result__section header strong {
    font-size: var(--ui-font-15, 15px);
  }
</style>
