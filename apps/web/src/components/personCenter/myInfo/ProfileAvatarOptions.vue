<template>
  <section class="profile-avatar-options" :aria-label="t('myInfo.builtinAvatars')">
    <div class="profile-avatar-options__heading">
      <div class="profile-avatar-options__label">
        <strong>{{ t('myInfo.builtinAvatars') }}</strong>
        <span>{{ t('myInfo.avatarCount', { count: BUILTIN_AVATARS.length }) }}</span>
      </div>
      <div class="profile-avatar-options__tools">
        <BUpload
          accept="image/*"
          :multiple="false"
          :max-total-size="5000 * 1024"
          raw-file
          :disabled="disabled"
          @change="upload"
        >
          <BButton
            class="profile-avatar-options__upload"
            :disabled="disabled"
            :loading="preparing && sourceKind === 'custom'"
          >
            <SvgIcon :src="icon.file_upload" size="16" aria-hidden="true" />{{ t('profileAppearance.uploadAvatar') }}
          </BButton>
        </BUpload>
        <BButton :disabled="disabled" @click="$emit('restore')">
          <SvgIcon :src="icon.navigation.user" size="16" aria-hidden="true" />{{
            t('profileAppearance.action.restoreDefault')
          }}
        </BButton>
      </div>
    </div>
    <p v-if="preparing" class="profile-avatar-options__status" role="status">{{ t('myInfo.avatarPreparing') }}</p>
    <p v-if="prepareError" class="profile-avatar-options__status" role="alert">{{
      t('myInfo.imageProcessingFailed')
    }}</p>
    <div class="profile-avatar-options__grid">
      <BButton
        v-for="avatar in BUILTIN_AVATARS"
        :key="avatar.id"
        class="profile-avatar-option"
        :class="{ 'is-selected': selectedId === avatar.id }"
        :aria-label="t(avatar.nameKey)"
        :aria-pressed="selectedId === avatar.id"
        :disabled="disabled"
        @click="$emit('select', avatar.id)"
      >
        <span class="profile-avatar-option__art" :style="builtinAvatarPreviewStyle(avatar)" aria-hidden="true" />
        <span class="profile-avatar-option__copy"
          ><strong>{{ t(avatar.nameKey) }}</strong
          ><small>{{ t(avatar.descriptionKey) }}</small></span
        >
        <span v-if="selectedId === avatar.id" class="profile-avatar-option__check" aria-hidden="true">
          <SvgIcon :src="icon.filterPanel.check" size="12" />
        </span>
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { BUILTIN_AVATARS, builtinAvatarPreviewStyle, type BuiltinAvatarId } from '@/config/builtinAvatars';
  import icon from '@/config/icon';
  defineProps<{
    selectedId: BuiltinAvatarId | null;
    sourceKind: string;
    disabled: boolean;
    preparing: boolean;
    prepareError: boolean;
  }>();
  const emit = defineEmits<{ select: [id: BuiltinAvatarId]; upload: [file: File]; restore: [] }>();
  const { t } = useI18n();
  function upload(files: File[]) {
    if (files[0]) emit('upload', files[0]);
  }
</script>

<style scoped lang="less">
  .profile-avatar-options__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px);
    margin-bottom: var(--ui-space-14, 14px);
  }
  .profile-avatar-options__label,
  .profile-avatar-options__tools {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .profile-avatar-options__label strong {
    font-size: var(--ui-font-14, 14px);
  }
  .profile-avatar-options__label span,
  .profile-avatar-options__status {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .profile-avatar-options__tools .b_btn {
    height: var(--ui-control-32, 32px);
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
    border: 1px solid var(--surface-border-color);
    background: var(--surface-card-bg);
  }
  .profile-avatar-options__tools .profile-avatar-options__upload {
    color: var(--primary-color);
    border-color: var(--primary-color);
  }
  .profile-avatar-options__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-10, 10px);
  }
  .profile-avatar-option.b_btn {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: var(--ui-layout-92, 92px);
    justify-content: flex-start;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-10, 10px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--surface-card-bg);
    text-align: left;
    white-space: normal;
  }
  .profile-avatar-option.b_btn:hover,
  .profile-avatar-option.b_btn:focus-visible,
  .profile-avatar-option.b_btn.is-selected {
    border-color: var(--primary-color);
  }
  .profile-avatar-option.b_btn.is-selected {
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .profile-avatar-option__art {
    width: var(--ui-layout-64, 64px);
    height: var(--ui-layout-64, 64px);
    flex: 0 0 var(--ui-layout-64, 64px);
    border: 2px solid var(--surface-border-color);
    border-radius: 50%;
    background-color: var(--surface-panel-bg);
  }
  .profile-avatar-option__copy {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-6, 6px);
  }
  .profile-avatar-option__copy strong {
    font-size: var(--ui-font-13, 13px);
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .profile-avatar-option__copy small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .profile-avatar-option__check {
    position: absolute;
    top: var(--ui-space-6, 6px);
    right: var(--ui-space-6, 6px);
    display: grid;
    place-items: center;
    width: var(--ui-layout-20, 20px);
    height: var(--ui-layout-20, 20px);
    border: 2px solid var(--surface-card-bg);
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
  }
  @media (max-width: 767px) {
    .profile-avatar-options__label {
      width: 100%;
      justify-content: flex-start;
    }
    .profile-avatar-options__tools {
      width: 100%;
      gap: var(--ui-space-8, 8px);
    }
    .profile-avatar-options__tools > :deep(.b-upload-trigger),
    .profile-avatar-options__tools > .b_btn {
      flex: 1;
    }
    .profile-avatar-options__tools :deep(.b_btn) {
      width: 100%;
    }
    .profile-avatar-options__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .profile-avatar-option.b_btn {
      flex-direction: column;
      justify-content: center;
      text-align: center;
      gap: var(--ui-space-8, 8px);
    }
    .profile-avatar-option__copy small {
      display: none;
    }
  }
</style>
