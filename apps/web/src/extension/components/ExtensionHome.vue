<template>
  <section class="ln-extension-view ln-extension-home">
    <div class="ln-extension-hero">
      <span>{{ t('browserExtension.home.eyebrow') }}</span>
      <h1>{{ t('browserExtension.home.title') }}</h1>
    </div>

    <div class="ln-extension-resource-grid">
      <BButton class="ln-extension-resource-card is-bookmark" block @click="emit('select', 'bookmark')">
        <span class="ln-extension-resource-card__icon"><SvgIcon :src="icon.resource.bookmark" size="25" /></span>
        <span class="ln-extension-resource-card__copy">
          <strong>{{ t('browserExtension.bookmark.title') }}</strong>
          <small>{{ t('browserExtension.bookmark.entryDescription') }}</small>
        </span>
        <SvgIcon class="ln-extension-resource-card__arrow" :src="icon.arrow_right" size="17" aria-hidden="true" />
      </BButton>
      <BButton class="ln-extension-resource-card is-note" block @click="emit('select', 'note')">
        <span class="ln-extension-resource-card__icon"><SvgIcon :src="icon.resource.note" size="25" /></span>
        <span class="ln-extension-resource-card__copy">
          <strong>{{ t('browserExtension.note.title') }}</strong>
          <small>{{ t('browserExtension.note.entryDescription') }}</small>
        </span>
        <SvgIcon class="ln-extension-resource-card__arrow" :src="icon.arrow_right" size="17" aria-hidden="true" />
      </BButton>
      <BButton class="ln-extension-resource-card is-file" block @click="emit('select', 'file')">
        <span class="ln-extension-resource-card__icon"><SvgIcon :src="icon.resource.file" size="25" /></span>
        <span class="ln-extension-resource-card__copy">
          <strong>{{ t('browserExtension.file.title') }}</strong>
          <small>{{ t('browserExtension.file.entryDescription') }}</small>
        </span>
        <SvgIcon class="ln-extension-resource-card__arrow" :src="icon.arrow_right" size="17" aria-hidden="true" />
      </BButton>
    </div>

    <div class="ln-extension-session-card" :class="{ 'is-authenticated': authenticated }">
      <span class="ln-extension-session-card__dot" aria-hidden="true"></span>
      <div>
        <strong>{{ authenticated ? userLabel : t('browserExtension.notSignedIn') }}</strong>
        <small>{{ authenticated ? t('browserExtension.home.sessionReady') : t('browserExtension.home.loginWhenSaving') }}</small>
      </div>
      <BButton size="small" @click="authenticated ? emit('logout') : emit('login')">
        {{ authenticated ? t('browserExtension.login.logout') : t('browserExtension.login.action') }}
      </BButton>
    </div>

    <p class="ln-extension-privacy-note">
      <SvgIcon :src="icon.settings.privacy" size="15" aria-hidden="true" />
      {{ t('browserExtension.home.privacy') }}
    </p>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { ExtensionResourceType } from '../types';

  defineProps<{ authenticated: boolean; userLabel: string }>();
  const emit = defineEmits<{
    select: [type: ExtensionResourceType];
    login: [];
    logout: [];
  }>();
  const { t } = useI18n();
</script>
