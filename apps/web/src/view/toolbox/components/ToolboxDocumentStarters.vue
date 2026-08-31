<template>
  <section class="document-starters" :aria-label="t('toolboxProject.starters.title')">
    <header>
      <div>
        <strong>{{ t('toolboxProject.starters.title') }}</strong>
        <p>{{ t('toolboxProject.starters.description') }}</p>
      </div>
    </header>
    <div class="document-starters__choices">
      <BButton
        class="document-starter"
        :loading="creatingBlank"
        :disabled="importing || Boolean(creatingStarterId)"
        @click="emit('blank')"
      >
        <span class="document-starter__icon"><SvgIcon :src="icon.toolbox.documentStudio" size="20" /></span>
        <span class="document-starter__copy">
          <strong>{{ t('toolboxProject.starters.blankTitle') }}</strong>
          <small>{{ t('toolboxProject.starters.blankDescription') }}</small>
        </span>
      </BButton>

      <BButton
        class="document-starter"
        :disabled="creatingBlank || importing || Boolean(creatingStarterId)"
        @click="templateOpen = true"
      >
        <span class="document-starter__icon"><SvgIcon :src="icon.toolbox.materialNote" size="20" /></span>
        <span class="document-starter__copy">
          <strong>{{ t('toolboxProject.starters.templateTitle') }}</strong>
          <small>{{ t('toolboxProject.starters.templateDescription', { count: starters.length }) }}</small>
        </span>
      </BButton>

      <BUpload
        raw-file
        :multiple="false"
        :max-total-size="20 * 1024 * 1024"
        accept=".md,.markdown,.docx,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        block
        :disabled="creatingBlank || importing || Boolean(creatingStarterId)"
        @change="onImportFiles"
      >
        <BButton
          class="document-starter"
          block
          :loading="importing"
          :disabled="creatingBlank || Boolean(creatingStarterId)"
        >
          <span class="document-starter__icon"><SvgIcon :src="icon.file_upload" size="20" /></span>
          <span class="document-starter__copy">
            <strong>{{ t('toolboxProject.starters.importTitle') }}</strong>
            <small>{{ t('toolboxProject.starters.importDescription') }}</small>
          </span>
        </BButton>
      </BUpload>
    </div>

    <BModal
      v-model:visible="templateOpen"
      :title="t('toolboxProject.starters.templateDialogTitle')"
      width="720px"
      :show-footer="false"
      fullscreen-mobile
      :close-disabled="Boolean(creatingStarterId)"
      @close="templateOpen = false"
    >
      <div class="document-template-grid">
        <BButton
          v-for="starter in starters"
          :key="starter.id"
          class="document-template-card"
          :loading="creatingStarterId === starter.id"
          :disabled="Boolean(creatingStarterId) && creatingStarterId !== starter.id"
          @click="chooseTemplate(starter)"
        >
          <span class="document-template-card__icon">
            <SvgIcon :src="icon.toolbox.documentStudio" size="22" />
          </span>
          <span class="document-template-card__copy">
            <strong>{{ starterCopy(starter).title }}</strong>
            <small>{{ starterCopy(starter).description }}</small>
          </span>
          <span class="document-template-card__action">{{ t('toolboxProject.starters.useTemplate') }}</span>
        </BButton>
      </div>
    </BModal>
  </section>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { productionProjectStarterCopy, type ProductionProjectStarter } from '@/config/productionProjectStarters';

  defineProps<{
    starters: readonly ProductionProjectStarter[];
    creatingBlank: boolean;
    creatingStarterId: string;
    importing: boolean;
  }>();
  const emit = defineEmits<{
    blank: [];
    template: [starter: ProductionProjectStarter];
    import: [file: File];
  }>();
  const { t, locale } = useI18n();
  const templateOpen = ref(false);

  function starterCopy(starter: ProductionProjectStarter) {
    return productionProjectStarterCopy(starter, locale.value);
  }

  function chooseTemplate(starter: ProductionProjectStarter) {
    emit('template', starter);
  }

  function onImportFiles(files: File[]) {
    const file = files[0];
    if (file) emit('import', file);
  }
</script>

<style scoped lang="less">
  .document-starters {
    margin-top: 18px;
    padding: 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  .document-starters > header strong {
    font-size: 17px;
  }
  .document-starters > header p {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 13px;
  }
  .document-starters__choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .document-starter {
    width: 100%;
    height: auto;
    min-height: 82px;
    padding: 14px;
    justify-content: flex-start;
    gap: 12px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 13px;
    background: var(--surface-page-bg, var(--background-color));
    text-align: left;
  }
  .document-starter:hover,
  .document-starter:focus-visible {
    border-color: var(--primary-color) !important;
    background: var(--surface-hover-bg, var(--primary-btn-bg-color));
  }
  .document-starter__icon,
  .document-template-card__icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--surface-selected-bg, var(--primary-btn-bg-color));
  }
  .document-starter__copy,
  .document-template-card__copy {
    min-width: 0;
    display: grid;
    gap: 5px;
    line-height: 1.35;
  }
  .document-starter__copy small,
  .document-template-card__copy small {
    color: var(--desc-color);
    white-space: normal;
  }
  .document-template-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .document-template-card {
    width: 100%;
    height: auto;
    min-height: 128px;
    padding: 16px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    align-items: start;
    gap: 10px 13px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 14px;
    background: var(--surface-page-bg, var(--background-color));
    text-align: left;
  }
  .document-template-card:hover,
  .document-template-card:focus-visible {
    border-color: var(--primary-color) !important;
  }
  .document-template-card__action {
    grid-column: 2;
    color: var(--primary-color);
    font-size: 12px;
  }

  @media (max-width: 767px) {
    .document-starters {
      margin-top: 12px;
      padding: 14px;
      border-radius: 16px;
    }
    .document-starters__choices {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }
    .document-starter {
      min-height: 78px;
      padding: 9px 6px;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 7px;
      text-align: center;
    }
    .document-starter__icon {
      width: 32px;
      height: 32px;
    }
    .document-starter__copy small {
      display: none;
    }
    .document-template-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
