<template>
  <main class="profile-prototype-stage">
    <header class="profile-prototype-caption">
      <strong>轻笺 · 编辑资料 V3</strong>
      <span>交互原型 · 示例资料，不发送真实邮件</span>
      <BButton @click="open = true">查看原型</BButton>
    </header>
    <BModal
      :visible="open"
      title="编辑资料"
      content-class="profile-prototype-scroll"
      width="min(var(--ui-layout-640, 640px), 94vw)"
      :mask-closable="false"
      :history-closable="false"
      fullscreen-mobile
      @close="requestClose"
    >
      <template #mobileHeader>
        <div class="profile-prototype-mobile-header">
          <BButton type="text" icon-only aria-label="返回" @click="requestClose">
            <SvgIcon :src="icon.arrow_left" size="22" />
          </BButton>
          <h1>编辑资料</h1>
        </div>
      </template>
      <div class="profile-prototype-form">
        <ProfileBackgroundSurface
          class="profile-prototype-identity"
          :background-id="backgroundId"
          aria-label="个人形象"
        >
          <div class="profile-prototype-person">
            <BButton
              type="text"
              icon-only
              class="profile-prototype-avatar"
              :class="{ 'is-unframed': !frameId }"
              :style="{ '--profile-prototype-avatar-slot': `${avatarSlot}px` }"
              aria-label="更换头像"
              @click="previewAppearance"
            >
              <AvatarFramePreview
                v-if="frameId"
                :src="avatar"
                :frame-id="frameId"
                :size="avatarSize"
                layout-mode="slot"
                pause-when-offscreen
              />
              <SvgIcon v-else :src="avatar" :size="avatarSize" :density-aware="false" />
            </BButton>
            <div class="profile-prototype-person-copy">
              <strong :title="name">{{ name.trim() || '社区成员' }}</strong>
              <div class="profile-prototype-person-meta"><span>@ln_DEMO</span><span>Lv.15 文圣</span></div>
            </div>
          </div>
          <BButton size="small" class="profile-prototype-appearance" @click="previewAppearance">
            <SvgIcon :src="icon.common.magicWand" size="15" />个人装扮
          </BButton>
        </ProfileBackgroundSurface>

        <section class="profile-prototype-public">
          <label class="profile-prototype-field" for="profile-prototype-name">
            <span class="profile-prototype-field-heading">昵称<small>在社区展示</small></span>
            <BInput id="profile-prototype-name" v-model:value="name" height="40px" />
          </label>
          <label class="profile-prototype-field" for="profile-prototype-bio">
            <span class="profile-prototype-field-heading"
              >社区简介<small>{{ Array.from(bio).length }}/60</small></span
            >
            <BInput id="profile-prototype-bio" v-model:value="bio" type="textarea" :rows="2" :maxlength="60" />
          </label>
        </section>

        <section class="profile-prototype-account" aria-labelledby="profile-prototype-account-title">
          <header><h2 id="profile-prototype-account-title">账号与安全</h2><span>仅自己可见</span></header>
          <div class="profile-prototype-account-panel">
            <div class="profile-prototype-account-row">
              <div class="profile-prototype-account-copy"><span>登录邮箱</span><strong>demo@example.com</strong></div>
              <BButton type="text" @click="emailOpen = true">更换邮箱</BButton>
            </div>
            <div class="profile-prototype-account-row">
              <div class="profile-prototype-account-copy"><span>登录密码</span><strong>已设置</strong></div>
              <BButton type="text" @click="feedback = '修改密码继续使用现有安全弹框。'">修改密码</BButton>
            </div>
          </div>
        </section>
      </div>
      <template #footer>
        <footer class="profile-prototype-footer">
          <span role="status">{{ feedback || (dirty ? '有未保存的修改' : '') }}</span>
          <BButton @click="requestClose">取消</BButton>
          <BButton type="primary" :disabled="!dirty || !name.trim()" @click="save">保存修改</BButton>
        </footer>
      </template>
    </BModal>
    <AccountEmailDialog v-model:visible="emailOpen" />
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ProfileBackgroundSurface from '@/components/growth/ProfileBackgroundSurface.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import AccountEmailDialog from '@/components/settings/AccountEmailDialog.vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { avatarFrameStableSlot } from '@/config/avatarFrameArtwork';
  import icon from '@/config/icon';
  import avatar from '@/assets/img/head.webp';

  const params = new URLSearchParams(location.search);
  const { dimension } = useUiDensity();
  const avatarSize = computed(() => dimension(54, 'layout'));
  const avatarSlot = computed(() => avatarFrameStableSlot(avatarSize.value));
  const backgroundId = params.has('empty') ? null : 'background_coast';
  const frameId = params.has('empty') ? null : 'frame_dragon';
  const open = ref(true);
  const emailOpen = ref(false);
  const name = ref(params.has('empty') ? '' : '山间拾光');
  const bio = ref(params.has('empty') ? '' : '记录生活与灵感，让喜欢的事物慢慢生长。');
  const baseline = ref(JSON.stringify([name.value, bio.value]));
  const dirty = computed(() => JSON.stringify([name.value, bio.value]) !== baseline.value);
  const feedback = ref('');
  function previewAppearance() {
    feedback.value = '个人装扮继续使用现有面板，昵称与简介草稿保留。';
  }
  function save() {
    baseline.value = JSON.stringify([name.value, bio.value]);
    feedback.value = '原型演示：修改仅保存在本页内存。';
  }
  function requestClose() {
    if (!dirty.value) {
      open.value = false;
      return;
    }
    Alert.alert({
      title: '放弃资料修改？',
      content: '昵称和简介还有未保存的修改。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: () => {
        open.value = false;
      },
    });
  }
</script>

<style scoped lang="less">
  .profile-prototype-stage {
    min-height: 100vh;
    color: var(--text-color);
    background: var(--workspace-canvas);
  }
  .profile-prototype-caption {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-20, 20px) var(--ui-space-28, 28px);
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }
  .profile-prototype-caption span {
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
  }
  .profile-prototype-form {
    padding: var(--ui-space-4, 4px);
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
  .profile-prototype-identity {
    position: relative;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .profile-prototype-identity .profile-prototype-appearance.b_btn {
    position: absolute;
    top: var(--ui-space-12, 12px);
    right: var(--ui-space-12, 12px);
    height: var(--ui-control-32, 32px);
    padding-inline: var(--ui-space-10, 10px);
    gap: var(--ui-space-5, 5px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    font-size: var(--ui-font-13, 13px);
    background: var(--card-background);
  }
  .profile-prototype-person {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    box-sizing: border-box;
    min-height: var(--ui-layout-160, 160px);
    padding: var(--ui-space-16, 16px);
    min-width: 0;
  }
  .profile-prototype-avatar.b_btn {
    position: relative;
    width: var(--profile-prototype-avatar-slot);
    height: var(--profile-prototype-avatar-slot);
    flex: 0 0 var(--profile-prototype-avatar-slot);
    padding: 0;
    border-radius: 50%;
  }
  .profile-prototype-avatar.is-unframed :deep(img) {
    border-radius: 50%;
    object-fit: cover;
  }
  .profile-prototype-person-copy {
    display: grid;
    gap: var(--ui-space-5, 5px);
    flex: 1;
    min-width: 0;
  }
  .profile-prototype-person-copy > strong {
    font-size: var(--ui-font-19, 19px);
    line-height: 1.4;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .profile-prototype-person-meta {
    display: grid;
    gap: var(--ui-space-4, 4px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    color: var(--text-color);
  }
  .profile-prototype-person-meta > span {
    overflow-wrap: anywhere;
  }
  .profile-prototype-public {
    display: grid;
    gap: var(--ui-space-16, 16px);
    padding-block: var(--ui-space-20, 20px);
  }
  .profile-prototype-field {
    display: grid;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    line-height: 1.5;
  }
  .profile-prototype-field-heading {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .profile-prototype-field-heading > small {
    font-weight: 400;
  }
  .profile-prototype-field small,
  .profile-prototype-account header > span,
  .profile-prototype-footer > span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .profile-prototype-field :deep(textarea) {
    height: var(--ui-layout-80, 80px);
    min-height: var(--ui-layout-80, 80px);
    padding-block: var(--ui-space-10, 10px);
    font-size: var(--ui-font-14, 14px);
    resize: vertical;
  }
  .profile-prototype-account {
    border-top: 1px solid var(--surface-divider-color);
    padding-top: var(--ui-space-16, 16px);
  }
  .profile-prototype-account-panel {
    margin-top: var(--ui-space-12, 12px);
    padding-inline: var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-panel-bg);
  }
  .profile-prototype-account header,
  .profile-prototype-account-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .profile-prototype-account h2 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
  }
  .profile-prototype-account-row {
    min-height: var(--ui-layout-54, 54px);
    padding-block: var(--ui-space-8, 8px);
    box-sizing: border-box;
  }
  .profile-prototype-account-row + .profile-prototype-account-row {
    border-top: 1px solid var(--surface-border-color);
  }
  .profile-prototype-account-copy {
    display: flex;
    align-items: center;
    flex: 1;
    gap: var(--ui-space-16, 16px);
    min-width: 0;
  }
  .profile-prototype-account-copy > span {
    flex: 0 0 var(--ui-layout-72, 72px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-prototype-account-copy > strong {
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .profile-prototype-account-row > .b_btn {
    flex-shrink: 0;
    padding-inline: var(--ui-space-4, 4px);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-prototype-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-16, 16px) var(--ui-space-24, 24px);
    border-top: 1px solid var(--surface-border-color);
  }
  .profile-prototype-footer > .b_btn {
    min-width: var(--ui-layout-80, 80px);
    height: var(--ui-control-36, 36px);
    line-height: var(--ui-control-36, 36px);
  }
  .profile-prototype-footer > span {
    flex: 1;
    min-width: 0;
    line-height: 1.5;
  }
  .profile-prototype-mobile-header {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--ui-layout-56, 56px);
    padding-inline: var(--ui-space-8, 8px);
    gap: var(--ui-space-8, 8px);
  }
  .profile-prototype-mobile-header > .b_btn {
    width: var(--ui-control-40, 40px);
    height: var(--ui-control-40, 40px);
    padding: 0;
  }
  .profile-prototype-mobile-header h1 {
    margin: 0;
    font-size: var(--ui-font-18, 18px);
    font-weight: 700;
  }
  html.light-note-mobile-rendering .profile-prototype-form {
    padding: var(--ui-space-20, 20px);
  }
  :global(html.light-note-mobile-rendering .modal-view.is-mobile-fullscreen .profile-prototype-scroll) {
    overflow-y: auto;
  }
  html.light-note-mobile-rendering .profile-prototype-account-copy {
    display: grid;
    gap: var(--ui-space-3, 3px);
  }
  html.light-note-mobile-rendering .profile-prototype-footer {
    padding-inline: var(--ui-space-20, 20px);
    padding-bottom: calc(var(--ui-space-16, 16px) + env(safe-area-inset-bottom));
  }
  html.light-note-mobile-rendering .profile-prototype-footer > .b_btn {
    height: var(--ui-control-44, 44px);
    line-height: var(--ui-control-44, 44px);
  }
  html.light-note-mobile-rendering .profile-prototype-footer > span {
    display: none;
  }
  html.light-note-mobile-rendering .profile-prototype-footer > .b_btn:last-child {
    flex: 1;
  }
</style>
