<template>
  <main class="appearance-prototype">
    <div class="prototype-heading"
      ><strong>轻笺 · 个人装扮</strong><span>交互原型 · 示例数据，不扣真实积分</span
      ><BButton @click="open = true">打开原型</BButton></div
    >
    <BModal
      :visible="open"
      :title="editing ? '编辑资料' : '个人装扮'"
      :width="editing ? 'var(--ui-layout-560, 560px)' : 'var(--ui-layout-880, 880px)'"
      :height="editing ? 'auto' : 'var(--ui-layout-560, 560px)'"
      :content-class="editing ? '' : 'appearance-picker-content'"
      :show-footer="false"
      :mask-closable="false"
      @close="open = false"
    >
      <template #title
        ><span v-if="editing">编辑资料</span
        ><div v-else class="appearance-title"
          ><BButton size="small" @click="editing = true">返回资料</BButton><span>个人装扮</span></div
        ></template
      >
      <div v-if="editing" class="editor-prototype">
        <div
          class="appearance-hero editor-hero"
          :class="{ 'is-dark': usedBackground === 'background_stars', 'is-default': !usedBackground }"
        >
          <ProfileBackgroundArt :background-id="usedBackground" />
          <div class="hero-person"
            ><div class="hero-avatar-slot"
              ><AvatarFramePreview
                :src="avatar"
                :frame-id="usedFrame"
                :size="dimension(72, 'layout')"
                layout-mode="slot" /></div
            ><div
              ><strong>{{ nickname }}</strong
              ><span>Lv.15 文圣</span></div
            ></div
          >
          <BButton
            class="hero-avatar-action"
            size="small"
            @click="feedback = '头像更换沿用现有头像选择器；此原型聚焦装扮。'"
            >更换头像</BButton
          >
        </div>
        <section class="appearance-entry"
          ><div
            ><strong>个人装扮</strong
            ><p>{{ nameOf(usedFrame, 'frame') }} · {{ nameOf(usedBackground, 'background') }}</p></div
          ><BButton @click="enterAppearance">更换装扮</BButton></section
        >
        <div class="editor-role"
          ><span>角色 <strong>管理员</strong></span
          ><BButton type="text" @click="feedback = '修改密码入口沿用现有流程。'">修改密码</BButton></div
        >
        <label>昵称<BInput v-model:value="nickname" /></label>
        <label>社区简介<BInput v-model:value="bio" type="textarea" :rows="2" /></label>
        <div class="private-fields"
          ><p>邮箱仅用于账号管理，不会公开展示</p><label>邮箱<BInput value="demo@example.com" /></label
        ></div>
        <footer
          ><span role="status">{{ feedback }}</span
          ><BButton type="primary" @click="feedback = '资料已保留在本页原型中。'">保存资料</BButton></footer
        >
      </div>
      <div v-else class="appearance-picker">
        <div class="appearance-toolbar"
          ><BTabs
            v-model:active-tab="category"
            variant="solid"
            :options="[
              { key: 'background', label: '个人背景' },
              { key: 'frame', label: '头像框' },
            ]"
            @change="resetSelection"
          /><span
            >我的积分 <strong>{{ points.toLocaleString() }}</strong></span
          ></div
        >
        <div class="appearance-workspace">
          <section class="appearance-options">
            <div class="appearance-filter"
              ><BTabs
                v-model:active-tab="filter"
                variant="pill"
                :options="[
                  { key: 'all', label: '全部' },
                  { key: 'owned', label: '已拥有' },
                ]"
              /><BButton type="text" @click="selectDefault">{{
                category === 'background' ? '默认背景' : '不戴头像框'
              }}</BButton></div
            >
            <p v-if="!visibleItems.length">还没有拥有此类装扮，可切换到「全部」预览。</p>
            <div class="appearance-grid" :class="{ 'frame-grid': category === 'frame' }">
              <BButton
                v-for="item in visibleItems"
                :key="item.id"
                class="appearance-item"
                :class="{ 'is-selected': selected === item.id }"
                :aria-pressed="selected === item.id"
                @click="
                  selected = item.id;
                  feedback = '';
                "
              >
                <div v-if="category === 'background'" class="appearance-thumbnail"
                  ><ProfileBackgroundArt :background-id="item.id" thumbnail
                /></div>
                <div v-else class="appearance-frame"
                  ><div class="frame-item-slot"
                    ><AvatarFramePreview
                      :frame-id="item.id"
                      :src="avatar"
                      :size="dimension(48, 'layout')"
                      layout-mode="slot"
                      pause-when-offscreen /></div
                ></div>
                <div class="appearance-item-copy"
                  ><strong>{{ item.name }} <small v-if="item.dynamic" class="motion-label">动态</small></strong
                  ><span>{{
                    isUsed(item.id)
                      ? '✓ 使用中'
                      : owned.includes(item.id)
                        ? '已拥有'
                        : `${item.cost.toLocaleString()} 积分`
                  }}</span></div
                >
              </BButton>
            </div>
          </section>
          <aside class="appearance-detail">
            <div class="preview-title"
              ><strong>搭配预览</strong><span>{{ isUsed(selected) ? '当前装扮' : '试搭 · 未使用' }}</span></div
            >
            <div
              class="appearance-hero preview-hero"
              :class="{ 'is-dark': previewBackground === 'background_stars', 'is-default': !previewBackground }"
              ><ProfileBackgroundArt :background-id="previewBackground" /><div class="hero-person"
                ><div class="hero-avatar-slot"
                  ><AvatarFramePreview
                    :src="avatar"
                    :frame-id="previewFrame"
                    :size="dimension(48, 'layout')"
                    layout-mode="slot" /></div
                ><div
                  ><strong>{{ nickname }}</strong
                  ><span>Lv.15 文圣</span></div
                ></div
              ></div
            >
            <div class="preview-summary">
              <div class="detail-copy">
                <h3>{{ nameOf(selected) }}</h3>
                <span v-if="selected">{{
                  owned.includes(selected) ? '永久拥有' : `${selectedItem?.cost.toLocaleString()} 积分 · 永久拥有`
                }}</span>
                <span v-else>免费 · 随时恢复</span>
              </div>
              <BButton type="primary" :disabled="isUsed(selected)" @click="applySelection">{{
                isUsed(selected) ? '使用中' : !selected || owned.includes(selected) ? '使用此装扮' : '兑换此装扮'
              }}</BButton>
            </div>
            <p class="preview-caption" role="status">{{
              feedback ||
              (category === 'background' ? '资料页、社区名片与公开主页共用。' : '与当前背景搭配，使用后立即同步。')
            }}</p>
          </aside>
        </div>
      </div>
    </BModal>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import ProfileBackgroundArt from '@/components/growth/ProfileBackgroundArt.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  import avatar from '@/assets/img/head.webp';
  const { dimension } = useUiDensity();
  const params = new URLSearchParams(location.search);
  const editing = ref(params.get('view') !== 'appearance');
  const open = ref(true);
  const nickname = ref('山间拾光');
  const bio = ref('记录生活与灵感，让喜欢的事物慢慢生长。');
  const category = ref('background');
  const filter = ref('all');
  const usedBackground = ref<string | null>(params.get('state') === 'empty' ? null : 'background_coast');
  const usedFrame = ref<string | null>('frame_dragon');
  const selected = ref<string | null>(usedBackground.value);
  const points = ref(2652);
  const feedback = ref('');
  const owned = ref(
    params.get('state') === 'empty'
      ? ['frame_dragon']
      : ['frame_dragon', 'frame_mint', 'frame_moonstone', 'background_mountains', 'background_coast'],
  );
  const backgrounds = [
    { id: 'background_mountains', name: '纸上青山', cost: 600, dynamic: false },
    { id: 'background_sky', name: '晴空来信', cost: 800, dynamic: false },
    { id: 'background_coast', name: '落日海岸', cost: 1000, dynamic: true },
    { id: 'background_stars', name: '灵感之泉', cost: 1500, dynamic: true },
  ];
  const frames = [
    { id: 'frame_mint', name: '薄荷', cost: 80, dynamic: false },
    { id: 'frame_ink', name: '墨韵', cost: 160, dynamic: false },
    { id: 'frame_moonstone', name: '月白', cost: 240, dynamic: false },
    { id: 'frame_gold', name: '鎏金', cost: 700, dynamic: true },
    { id: 'frame_sakura', name: '樱绯', cost: 1000, dynamic: true },
    { id: 'frame_dragon', name: '龙曜', cost: 12000, dynamic: true },
  ];
  const items = computed(() => (category.value === 'background' ? backgrounds : frames));
  const visibleItems = computed(() => items.value.filter((x) => filter.value === 'all' || owned.value.includes(x.id)));
  const selectedItem = computed(() => items.value.find((x) => x.id === selected.value));
  const previewBackground = computed(() => (category.value === 'background' ? selected.value : usedBackground.value));
  const previewFrame = computed(() => (category.value === 'frame' ? selected.value : usedFrame.value));
  function nameOf(id: string | null, kind = category.value) {
    return [...backgrounds, ...frames].find((x) => x.id === id)?.name || (kind === 'frame' ? '不戴头像框' : '默认背景');
  }
  function isUsed(id: string | null) {
    return id === (category.value === 'background' ? usedBackground.value : usedFrame.value);
  }
  function resetSelection() {
    selected.value = category.value === 'background' ? usedBackground.value : usedFrame.value;
    feedback.value = '';
  }
  function enterAppearance() {
    category.value = 'background';
    resetSelection();
    editing.value = false;
  }
  function selectDefault() {
    selected.value = null;
    feedback.value = '';
  }
  function applySelection() {
    const item = selectedItem.value;
    if (item && !owned.value.includes(item.id)) {
      if (points.value < item.cost) {
        feedback.value = '积分不足，可先选择已拥有的装扮。';
        return;
      }
      points.value -= item.cost;
      owned.value.push(item.id);
      feedback.value = '模拟兑换成功，可点击使用。';
      return;
    }
    if (category.value === 'background') usedBackground.value = selected.value;
    else usedFrame.value = selected.value;
    feedback.value = '已在原型中使用，返回资料即可看到效果。';
  }
</script>

<style lang="less">
  html,
  body,
  #app {
    margin: 0;
    min-height: 100%;
  }
  body {
    font-family: var(--app-font-family);
    background: var(--surface-panel-bg);
    color: var(--text-color);
  }
  .appearance-prototype {
    padding: var(--ui-space-24, 24px);
  }
  .prototype-heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    font-size: var(--ui-font-13, 13px);
  }
  .prototype-heading span {
    color: var(--desc-color);
  }
  .modal-content.appearance-picker-content {
    display: flex;
    overflow: hidden;
  }
</style>
<style scoped lang="less">
  .appearance-title,
  .appearance-toolbar,
  .appearance-entry,
  .editor-role,
  .appearance-filter,
  .preview-title,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
  }
  .appearance-title {
    justify-content: flex-start;
  }
  .editor-prototype {
    display: grid;
    gap: var(--ui-space-16, 16px);
  }
  .appearance-hero {
    position: relative;
    overflow: hidden;
    border-radius: 14px;
    background: var(--surface-panel-bg);
    isolation: isolate;
    color: #253831;
  }
  .appearance-hero.is-dark {
    color: #fff;
  }
  .appearance-hero::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(90deg, #ffffffa6, #ffffff52 48%, transparent 78%);
  }
  .appearance-hero.is-dark::after {
    background: linear-gradient(90deg, #10142399, #10142333 48%, transparent 78%);
  }
  .appearance-hero.is-default {
    color: var(--text-color);
  }
  .appearance-hero.is-default::after {
    display: none;
  }
  .editor-hero {
    min-height: var(--ui-layout-160, 160px);
  }
  .hero-person {
    box-sizing: border-box;
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    padding: var(--ui-space-24, 24px);
    min-height: inherit;
  }
  .hero-avatar-slot {
    width: var(--ui-layout-144, 144px);
    height: var(--ui-layout-144, 144px);
    flex: 0 0 auto;
  }
  .hero-person > div:last-child {
    display: grid;
    gap: var(--ui-space-10, 10px);
  }
  .hero-person strong {
    font-size: var(--ui-font-20, 20px);
  }
  .hero-person span {
    font-size: var(--ui-font-12, 12px);
  }
  .hero-avatar-action {
    position: absolute;
    z-index: 2;
    right: var(--ui-space-12, 12px);
    bottom: var(--ui-space-12, 12px);
  }
  .appearance-entry {
    padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
  }
  p {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .appearance-entry p {
    margin-top: var(--ui-space-4, 4px);
    font-size: var(--ui-font-13, 13px);
  }
  .editor-role {
    justify-content: flex-start;
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
  }
  .editor-role strong {
    margin-left: var(--ui-space-12, 12px);
    font-weight: 500;
  }
  label {
    display: grid;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-14, 14px);
  }
  .private-fields {
    border-top: 1px solid var(--surface-border-color);
    padding-top: var(--ui-space-16, 16px);
  }
  .private-fields p {
    font-size: var(--ui-font-12, 12px);
    margin-bottom: var(--ui-space-12, 12px);
  }
  footer span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .appearance-picker {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .appearance-toolbar {
    flex-shrink: 0;
    padding-bottom: var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-border-color);
  }
  .appearance-toolbar :deep(.is-solid .tab) {
    min-width: var(--ui-layout-80, 80px);
    min-height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-12, 12px);
    font-size: var(--ui-font-13, 13px);
  }
  .appearance-toolbar > span {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .appearance-toolbar strong {
    margin-left: var(--ui-space-8, 8px);
    color: var(--text-color);
    font-size: var(--ui-font-18, 18px);
  }
  .appearance-workspace {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    align-items: stretch;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: var(--ui-space-20, 20px);
    padding-top: var(--ui-space-14, 14px);
  }
  .appearance-options,
  .appearance-detail {
    min-width: 0;
    min-height: 0;
  }
  .appearance-options {
    overflow: auto;
    scrollbar-gutter: stable;
    padding-right: var(--ui-space-8, 8px);
    overscroll-behavior: contain;
  }
  .appearance-filter {
    margin-bottom: var(--ui-space-12, 12px);
  }
  .appearance-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .appearance-item {
    width: 100%;
    height: auto;
    padding: 0;
    display: block;
    text-align: left;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    background: var(--surface-card-bg);
    border-radius: 12px;
    color: var(--text-color);
    white-space: normal;
    line-height: 1.45;
  }
  .appearance-item.is-selected {
    border-color: var(--primary-color);
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .appearance-thumbnail {
    position: relative;
    width: 100%;
    aspect-ratio: 2.6;
    overflow: hidden;
  }
  .appearance-item-copy {
    display: grid;
    gap: var(--ui-space-4, 4px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
  }
  .appearance-item-copy strong {
    font-size: var(--ui-font-14, 14px);
  }
  .appearance-item-copy > span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .motion-label {
    font-size: var(--ui-font-11, 11px);
    font-weight: 400;
    color: var(--primary-color);
    margin-left: var(--ui-space-4, 4px);
  }
  .frame-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .frame-grid .appearance-item {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px);
  }
  .frame-grid .appearance-item-copy {
    min-width: 0;
    padding: 0;
    text-align: left;
  }
  .appearance-frame {
    flex: 0 0 auto;
  }
  .frame-item-slot {
    width: var(--ui-layout-96, 96px);
    height: var(--ui-layout-96, 96px);
  }
  .appearance-detail {
    display: grid;
    grid-template-rows: auto minmax(var(--ui-layout-128, 128px), 1fr) auto auto;
    overflow: visible;
    border-left: 1px solid var(--surface-border-color);
    padding-left: var(--ui-space-20, 20px);
  }
  .preview-title {
    margin-bottom: var(--ui-space-8, 8px);
  }
  .preview-title span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .preview-hero {
    min-height: 0;
    border-radius: 12px 12px 0 0;
  }
  .preview-hero::after {
    background: linear-gradient(90deg, #ffffff6b, #ffffff4d 55%, transparent);
  }
  .preview-hero.is-dark::after {
    background: linear-gradient(90deg, #10142399, #10142366 55%, transparent);
  }
  .preview-hero .hero-avatar-slot {
    width: var(--ui-layout-96, 96px);
    height: var(--ui-layout-96, 96px);
  }
  .preview-hero .hero-person {
    height: 100%;
    min-height: 0;
    padding: var(--ui-space-20, 20px);
    gap: var(--ui-space-24, 24px);
    align-items: center;
    justify-content: flex-start;
  }
  .preview-hero .hero-person > div:last-child {
    min-width: 0;
    gap: var(--ui-space-6, 6px);
  }
  .preview-hero .hero-person strong {
    font-size: var(--ui-font-16, 16px);
  }
  .preview-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-top: 0;
    border-radius: 0 0 12px 12px;
    background: var(--surface-card-bg);
  }
  .preview-summary > .b_btn {
    flex-shrink: 0;
  }
  .detail-copy {
    display: grid;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--ui-font-15, 15px);
  }
  .detail-copy > span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .preview-caption {
    min-height: var(--ui-layout-32, 32px);
    padding-top: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  @media (max-width: 767px) {
    .prototype-heading {
      flex-wrap: wrap;
    }
    .appearance-workspace {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow: auto;
    }
    .appearance-options,
    .appearance-detail {
      overflow: visible;
      flex-shrink: 0;
    }
    .appearance-detail {
      display: block;
      position: static;
      order: -1;
      flex-shrink: 0;
      border-left: 0;
      padding-left: 0;
    }
    .appearance-options {
      padding-right: 0;
    }
    .preview-hero {
      height: var(--ui-layout-200, 200px);
    }
    .appearance-toolbar {
      flex-wrap: wrap;
    }
    .hero-person {
      padding: var(--ui-space-20, 20px);
    }
    .frame-grid .appearance-item {
      flex-direction: column;
      gap: var(--ui-space-8, 8px);
    }
    .frame-grid .appearance-item-copy {
      text-align: center;
    }
    .appearance-entry {
      gap: var(--ui-space-8, 8px);
    }
  }
</style>
