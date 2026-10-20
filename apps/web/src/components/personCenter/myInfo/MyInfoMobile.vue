<template>
  <CommonContainer class="mobile-profile-page" :title="t('myInfo.title')" @backClick="form?.requestClose()">
    <template #navigation>
      <BButton
        type="text"
        icon-only
        class="mobile-profile-back"
        :aria-label="t('common.back')"
        @click="form?.requestClose()"
      >
        <SvgIcon :src="icon.toolbox.back" size="23" />
      </BButton>
      <h1>{{ t('myInfo.title') }}</h1>
    </template>
    <div class="mobile-profile-editor"
      ><ProfileEditorForm ref="form" @close="leave" @saved="saved" @navigate="navigate"
    /></div>
  </CommonContainer>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useRouter, onBeforeRouteLeave } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import ProfileEditorForm from './ProfileEditorForm.vue';
  const form = ref<InstanceType<typeof ProfileEditorForm>>();
  const { t } = useI18n();
  const router = useRouter();
  let leaving = false;
  let resolveLeave: ((value: boolean) => void) | null = null;
  function navigate(path: string) {
    leaving = true;
    void router.push(path);
  }
  function saved() {
    window.dispatchEvent(new CustomEvent('light-note:profile-saved'));
  }
  function leave() {
    leaving = true;
    if (resolveLeave) {
      resolveLeave(true);
      resolveLeave = null;
    } else router.back();
  }
  onBeforeRouteLeave(() => {
    if (leaving || !form.value?.dirty) return true;
    if (form.value?.saving) return false;
    return new Promise<boolean>((resolve) => {
      resolveLeave = resolve;
      form.value?.requestClose(() => {
        resolveLeave = null;
        resolve(false);
      });
    });
  });
</script>
<style scoped>
  .mobile-profile-page {
    width: 100%;
    height: 100%;
  }
  .mobile-profile-page :deep(.phone-container) {
    padding: 0;
  }
  .mobile-profile-page :deep(.phone-navigation) {
    box-sizing: border-box;
    position: relative;
    top: auto;
    flex: 0 0 var(--ui-layout-56, 56px);
    width: 100%;
    height: var(--ui-layout-56, 56px);
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .mobile-profile-page h1 {
    margin: 0;
    font-size: var(--ui-font-18, 18px);
    line-height: 1.44;
    font-weight: 700;
  }
  .mobile-profile-back.b_btn {
    position: absolute;
    top: var(--ui-space-6, 6px);
    left: var(--ui-space-8, 8px);
    width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
    padding: 0;
    color: var(--text-color);
  }
  .mobile-profile-page :deep(.phone-body) {
    position: relative;
    top: auto;
    flex: 1;
    width: 100%;
    height: auto;
    min-height: 0;
    padding-top: 0;
  }
  .mobile-profile-editor {
    box-sizing: border-box;
    max-width: var(--ui-layout-560, 560px);
    margin-inline: auto;
    padding: var(--ui-space-18, 18px) var(--ui-space-20, 20px);
    padding-bottom: calc(var(--ui-space-108, 108px) + env(safe-area-inset-bottom));
  }
</style>
