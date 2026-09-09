<template>
  <div v-if="item.warnings.length" class="import-warnings">
    <p v-for="code in notices" :key="code" class="import-warnings__notice">{{ t(`noteTransfer.warning.${code}`) }}</p>
    <template v-if="issues.length">
      <BButton class="import-warnings__toggle" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ t('noteTransfer.issues', { count: issues.length }) }} ·
        {{ t(expanded ? 'noteTransfer.collapse' : 'noteTransfer.details') }}
      </BButton>
      <div v-if="expanded" class="import-warnings__details">
        <p v-if="!item.warningDetails">{{ t('noteTransfer.legacyWarning') }}</p>
        <p v-for="code in issues" :key="code">
          {{ t(`noteTransfer.warning.${code}`)
          }}<template v-if="detail(code)">
            · {{ detail(code)?.count
            }}<span v-if="detail(code)?.sources.length"> · {{ detail(code)?.sources.join('、') }}</span></template
          >
        </p>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { NoteImportItem } from '@lightnote/shared/note-transfer';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const props = defineProps<{ item: NoteImportItem }>();
  const { t } = useI18n();
  const expanded = ref(false);
  const notices = computed(() =>
    props.item.warnings.filter((code) => ['format_simplified', 'external_image'].includes(code)),
  );
  const issues = computed(() => props.item.warnings.filter((code) => !notices.value.includes(code)));
  const detail = (code: string) => props.item.warningDetails?.find((entry) => entry.code === code);
</script>
<style scoped lang="less">
  .import-warnings {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.6;
  }
  .import-warnings p {
    margin: 0;
  }
  .import-warnings__notice {
    color: var(--desc-color);
  }
  .import-warnings__toggle {
    color: var(--warning-color);
    padding: 3px 0;
    background: transparent;
  }
  .import-warnings__details {
    padding: 8px 10px;
    margin-top: 6px;
    border-left: 2px solid var(--warning-color);
    color: var(--desc-color);
    overflow-wrap: anywhere;
  }
</style>
