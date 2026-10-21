<template>
  <ProfileBackgroundSurface class="profile-editor-identity" :background-id="profile.backgroundId">
    <header class="profile-editor-identity__person">
      <component
        :is="avatarEditable ? BButton : 'span'"
        v-bind="
          avatarEditable
            ? { type: 'text', iconOnly: true, 'aria-label': t('myInfo.chooseAvatar') }
            : { 'aria-hidden': true }
        "
        class="profile-editor-identity__avatar"
        :style="{ '--profile-editor-avatar-slot': `${avatarSlot}px` }"
        @click="avatarEditable && $emit('edit-avatar')"
      >
        <AvatarFramePreview
          v-if="frameId"
          :frame-id="frameId"
          :src="avatar"
          :size="avatarSize"
          layout-mode="slot"
          pause-when-offscreen
        />
        <SvgIcon v-else :src="avatar" :size="avatarSize" :density-aware="false" />
      </component>
      <div class="profile-editor-identity__copy">
        <strong :title="profile.name">{{ profile.name || t('communityChat.memberFallback') }}</strong>
        <span v-if="profile.communityId" class="profile-editor-identity__id">@{{ profile.communityId }}</span>
        <div class="profile-editor-identity__meta">
          <span>Lv.{{ profile.level }} {{ profile.levelName }}</span>
          <span v-if="profile.role !== 'member'" class="profile-editor-identity__role">{{
            t(`communityChat.authorRole.${profile.role}`)
          }}</span>
        </div>
        <small v-if="profile.title" class="profile-editor-identity__title">{{ profile.title }}</small>
      </div>
    </header>
    <footer v-if="$slots.actions" class="profile-editor-identity__actions"><slot name="actions" /></footer>
  </ProfileBackgroundSurface>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import ProfileBackgroundSurface from '@/components/growth/ProfileBackgroundSurface.vue';
  import { avatarFrameStableSlot } from '@/config/avatarFrameArtwork';
  import { frameVariant } from '@/config/growthFrames';
  import icon from '@/config/icon';
  import { useUiDensity } from '@/composables/useUiDensity';

  const props = defineProps<{ profile: CommunityChatAuthorProfile; avatarEditable?: boolean }>();
  defineEmits<{ 'edit-avatar': [] }>();
  const { t } = useI18n();
  const { dimension } = useUiDensity();
  const frameId = computed(() => (frameVariant(props.profile.frameId) ? props.profile.frameId : null));
  const avatar = computed(() => props.profile.avatar || icon.communityChat.defaultAvatar);
  const avatarSize = computed(() => dimension(58, 'layout'));
  // 始终给最大头像框留槽位，装扮切换时不挤动昵称；框体仍由共享组件独立分层渲染。
  const avatarSlot = computed(() => avatarFrameStableSlot(avatarSize.value));
</script>

<style scoped lang="less">
  .profile-editor-identity {
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }
  .profile-editor-identity__person {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-16, 16px) var(--ui-space-16, 16px) var(--ui-space-12, 12px);
    min-width: 0;
  }
  .is-decorated .profile-editor-identity__person {
    box-sizing: border-box;
    min-height: var(--ui-layout-180, 180px);
    align-items: center;
    padding-block: var(--ui-space-16, 16px);
  }
  .profile-editor-identity__avatar,
  .profile-editor-identity__avatar.b_btn {
    position: relative;
    width: var(--profile-editor-avatar-slot);
    height: var(--ui-layout-84, 84px);
    flex: 0 0 var(--profile-editor-avatar-slot);
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
  }
  .is-decorated .profile-editor-identity__avatar {
    height: var(--profile-editor-avatar-slot);
  }
  .profile-editor-identity__avatar > :deep(img) {
    border-radius: 50%;
    object-fit: cover;
  }
  .profile-editor-identity__copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--ui-space-5, 5px);
    padding-top: var(--ui-space-12, 12px);
  }
  .profile-editor-identity__copy > strong {
    overflow: hidden;
    font-size: var(--ui-font-19, 19px);
    line-height: 1.32;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .is-decorated .profile-editor-identity__copy {
    padding-top: 0;
  }
  .profile-editor-identity__id,
  .profile-editor-identity__meta,
  .profile-editor-identity__title {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .profile-editor-identity__id {
    overflow-wrap: anywhere;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .profile-editor-identity__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) 0;
  }
  .profile-editor-identity__role {
    display: inline-flex;
    align-items: center;
  }
  .profile-editor-identity__role::before {
    content: '';
    width: var(--ui-space-3, 3px);
    height: var(--ui-space-3, 3px);
    margin: 0 var(--ui-space-8, 8px);
    border-radius: 50%;
    background: var(--desc-color);
  }
  .profile-editor-identity__title {
    overflow-wrap: anywhere;
  }
  .profile-editor-identity__actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-22, 22px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border-top: 1px solid var(--surface-border-color);
  }
  .is-decorated .profile-editor-identity__actions {
    isolation: isolate;
    border-radius: 0 0 15px 15px;
  }
  .is-decorated .profile-editor-identity__actions::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    background: var(--card-background);
    opacity: 0.86;
    pointer-events: none;
  }
  .is-decorated .profile-editor-identity__actions > :slotted(*) {
    position: relative;
    z-index: 1;
  }
</style>
