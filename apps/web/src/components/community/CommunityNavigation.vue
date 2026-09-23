<template>
  <nav class="community-navigation" :aria-label="t('community.title')">
    <template v-if="!isMobile">
      <p class="community-navigation-title">{{ t('community.title') }}</p>
      <BButton
        v-for="item in items"
        :key="item.key"
        class="community-destination"
        :aria-current="currentPath === item.key ? 'page' : undefined"
        @click="select(item.key)"
      >
        <SvgIcon :src="item.icon" size="20" />
        <span>{{ item.label }}</span>
        <span v-if="item.key === '/community/chat' && unread.totalUnread.value" class="community-navigation-badge">{{
          unread.totalUnread.value > 99 ? '99+' : unread.totalUnread.value
        }}</span>
      </BButton>
    </template>
    <template v-else>
      <BButton
        class="community-mobile-switch"
        :aria-label="t('community.feed.switchModule', { name: currentLabel })"
        :aria-expanded="mobileOpen"
        aria-haspopup="dialog"
        @click="mobileOpen = true"
      >
        <span class="community-mobile-label">{{ currentLabel }}</span>
        <SvgIcon :src="icon.noteTree.chevron" size="16" />
      </BButton>
      <MobilePageActionsDrawer
        v-model:open="mobileOpen"
        :title="t('community.title')"
        :actions="mobileActions"
        @action="select($event.key)"
      />
    </template>
    <div v-if="authenticated && !isMobile" class="community-navigation-footer">
      <BButton class="community-navigation-profile" @click="select('/community/profile')">
        <img
          v-if="user.headPicture && user.headPicture !== icon.navigation.user"
          :src="user.headPicture"
          alt=""
          width="28"
          height="28"
        />
        <span v-else class="community-navigation-avatar" aria-hidden="true">{{
          Array.from(user.alias || t('community.feed.profile'))[0]
        }}</span>
        <span
          ><strong>{{ user.alias || t('community.feed.profile') }}</strong></span
        >
      </BButton>
    </div>
  </nav>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useRouter, useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import MobilePageActionsDrawer from '@/components/mobile/MobilePageActionsDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  const props = defineProps<{ active: 'chat' | 'feed'; label?: string }>();
  const user = useUserStore();
  const route = useRoute();
  const authenticated = computed(() => Boolean(user.id && user.role !== 'visitor' && !user.adminContext));
  const currentPath = computed(() =>
    ['/community/manage', '/community/preferences', '/community/moderation', '/community/profile'].includes(route.path)
      ? route.path
      : props.active === 'chat'
        ? '/community/chat'
        : '/community/feed',
  );
  const router = useRouter(),
    { t } = useI18n(),
    unread = useCommunityChatUnread();
  const isMobile = useMobileLayout();
  const items = computed(() => [
    { key: '/community/chat', label: t('community.chat'), icon: icon.ai.conversations },
    { key: '/community/feed', label: t('community.feed.title'), icon: icon.navigation.portal },
    ...(authenticated.value
      ? [
          { key: '/community/manage', label: t('community.feed.manage'), icon: icon.resource.note },
          { key: '/community/preferences', label: t('community.feed.settings'), icon: icon.userCenter.settingsGear },
          ...(user.role === 'root'
            ? [
                {
                  key: '/community/moderation',
                  label: t('community.feed.moderation'),
                  icon: icon.navigation.permissions,
                },
              ]
            : []),
          ...(isMobile.value
            ? [{ key: '/community/profile', label: t('community.feed.myProfile'), icon: icon.navigation.user }]
            : []),
        ]
      : []),
  ]);
  const mobileOpen = ref(false);
  const currentLabel = computed(
    () => props.label || items.value.find((item) => item.key === currentPath.value)?.label || t('community.title'),
  );
  const mobileActions = computed(() =>
    items.value.map((item, index) => ({
      ...item,
      selected: item.key === currentPath.value,
      dividerBefore: index === 2,
      description:
        item.key === '/community/chat' && unread.totalUnread.value
          ? t('community.feed.unreadMessages', { count: unread.totalUnread.value })
          : undefined,
    })),
  );
  watch([isMobile, authenticated], () => {
    mobileOpen.value = false;
  });
  function select(value: string) {
    void router.push(value);
  }
</script>
<style scoped lang="less">
  .community-navigation {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    height: 100%;
    min-height: var(--ui-layout-300, 300px);
  }
  .community-navigation-title {
    margin: var(--ui-space-6, 6px) var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .community-destination {
    position: relative;
    width: 100%;
    justify-content: flex-start;
    gap: var(--ui-space-10, 10px);
    min-height: var(--ui-layout-44, 44px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-color);
  }
  .community-destination[aria-current='page'] {
    color: var(--workspace-purple-text);
    background: var(--workspace-hover);
    font-weight: 600;
  }
  .community-destination[aria-current='page']::before {
    content: '';
    position: absolute;
    left: 0;
    top: var(--ui-space-13, 13px);
    bottom: var(--ui-space-13, 13px);
    width: 3px;
    border-radius: 2px;
    background: var(--workspace-purple-text);
  }
  .community-navigation-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    flex: 0 0 auto;
    height: var(--ui-layout-18, 18px);
    line-height: 1;
    padding: 0 var(--ui-space-5, 5px);
    box-sizing: border-box;
    white-space: nowrap;
    margin-left: auto;
    font-size: var(--ui-font-11, 11px);
    min-width: var(--ui-layout-18, 18px);
    border-radius: 10px;
    background: var(--workspace-hover);
  }
  .community-navigation-footer {
    flex-shrink: 0;
    margin: auto calc(-1 * var(--ui-space-20, 20px)) 0;
    padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    border-top: 1px solid var(--workspace-divider);
  }
  .community-navigation-profile {
    height: var(--ui-layout-44, 44px);
    min-height: var(--ui-layout-44, 44px);
    padding: var(--ui-space-6, 6px) var(--ui-space-8, 8px);
    border: 0;
    border-radius: 8px;
    background: transparent;
    width: 100%;
    justify-content: flex-start;
    gap: var(--ui-space-10, 10px);
    text-align: left;
  }
  .community-navigation-profile:hover {
    background: var(--workspace-hover);
  }
  .community-navigation-profile img {
    width: var(--ui-layout-28, 28px);
    height: var(--ui-layout-28, 28px);
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .community-navigation-profile span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5, 5px);
  }
  .community-navigation-profile .community-navigation-avatar {
    width: var(--ui-layout-28, 28px);
    height: var(--ui-layout-28, 28px);
    flex-shrink: 0;
    border-radius: 50%;
    align-items: center;
    justify-content: center;
    background: var(--workspace-hover);
    color: var(--workspace-purple-text);
  }
  .community-navigation-profile strong {
    font-size: var(--ui-font-13, 13px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .community-navigation-profile small {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  @media (max-width: 767px) {
    .community-navigation {
      height: auto;
      min-height: 0;
    }
    .community-navigation {
      min-width: 0;
    }
    .community-mobile-switch {
      max-width: 100%;
      height: 32px;
      min-height: 32px;
      padding: 0 4px;
      justify-content: flex-start;
      gap: 6px;
      border: 0;
      background: transparent;
      color: var(--text-color);
      font-size: 15px;
      font-weight: 600;
    }
    .community-mobile-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
