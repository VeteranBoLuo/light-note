<template>
  <div class="settings-index">
    <section v-for="group in groups" :key="group.group" class="settings-index-group">
      <h2 class="settings-index-group-title">{{ groupTitle(group.group) }}</h2>
      <div class="settings-index-card">
        <BButton v-for="row in group.items" :key="row.id" class="settings-index-row" @click="emit('select', row.id)">
          <span class="settings-index-icon" :class="`settings-index-icon--${row.tone}`">
            <SvgIcon :src="row.icon" size="20" aria-hidden="true" />
          </span>
          <span class="settings-index-copy">
            <span class="settings-index-title">{{ row.title }}</span>
            <span class="settings-index-summary">{{ row.summary }}</span>
          </span>
          <SvgIcon class="settings-index-chevron" :src="icon.arrow_right" size="16" aria-hidden="true" />
        </BButton>
      </div>
    </section>

    <p class="settings-index-foot">{{ t('settings.mobileIndex.footHint') }}</p>
  </div>
</template>

<script setup lang="ts">
  /**
   * 移动端设置目录。只负责「找到设置」：一行一个分类 + 当前状态摘要，
   * 点进去才修改：常规分类进入 Settings.vue 的 ?section= 子页，AI 用量进入独立页面。
   *
   * 刻意不做折叠：展开会把后面的分类整体推下去，人容易丢位置；
   * 而且分类越多越会变成「反复开关面板」。这里用右箭头表示「进入子页」，
   * 不用下箭头，避免读成「展开」。
   */
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { groupSettingsSections, type SettingsIndexSectionId, type SettingsSectionGroup } from './settingsRegistry';

  export type SettingsIndexRow = {
    id: SettingsIndexSectionId;
    group: SettingsSectionGroup;
    title: string;
    summary: string;
    icon: string;
    tone: 'purple' | 'green';
  };

  const props = defineProps<{ sections: SettingsIndexRow[] }>();
  const emit = defineEmits<{ select: [SettingsIndexSectionId] }>();

  const { t } = useI18n();

  const groups = computed(() => groupSettingsSections(props.sections));

  const GROUP_TITLE_KEY: Record<SettingsSectionGroup, string> = {
    preferences: 'settings.mobileIndex.groupPreferences',
    account: 'settings.mobileIndex.groupAccount',
    rules: 'settings.mobileIndex.groupRules',
  };
  function groupTitle(group: SettingsSectionGroup) {
    return t(GROUP_TITLE_KEY[group]);
  }
</script>

<style scoped lang="less">
  .settings-index {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .settings-index-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .settings-index-group-title {
    margin: 0 4px;
    font-size: 12px;
    font-weight: 700;
    color: var(--desc-color);
  }

  /* 一个分组 = 一张卡，一个分类 = 卡内一行。
     只有卡最外层有圆角/边框/阴影，行之间用 1px 分割线 ——
     比「一个分类一张大卡」省掉大量外层留白和重复阴影，纵向短得多。 */
  .settings-index-card {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    border-radius: 16px;
    background: var(--workbench-subcard-bg);
    overflow: hidden;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      0 12px 28px -22px rgba(30, 35, 70, 0.35);
  }

  /* 用两级选择器压过 BButton 自己的 .b_btn / .default_btn（等特异度时才靠源码顺序，
     那个顺序不该被依赖）。整行可点，最小高度 72px 已远超 48px 触控下限。 */
  .settings-index-card .settings-index-row {
    width: 100%;
    min-height: 72px;
    height: auto;
    line-height: 1.35;
    padding: 12px 14px;
    gap: 12px;
    border: 0;
    border-radius: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 42%, transparent);
    background: transparent;
    color: var(--text-color);
    text-align: left;
    justify-content: flex-start;
    white-space: normal;
  }
  .settings-index-card .settings-index-row:last-child {
    border-bottom: 0;
  }
  /* 只在真正的交互反馈上用主色：目录行没有「当前选中」态，
     常驻描边会被读成已选中/已展开。 */
  .settings-index-card .settings-index-row:hover {
    background: color-mix(in srgb, var(--primary-color) 5%, transparent);
  }
  .settings-index-card .settings-index-row:active {
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }
  .settings-index-card .settings-index-row:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }

  .settings-index-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  /* 图标底色是分类着色、不表达状态。混向 transparent 而不是混向卡片底色：
     前者在 APK 里会被构建期换成稳定 RGBA(见 androidColorMixFallback)，色调还在；
     后者会回退成卡片实色，把整块 tint 抹平。同时透明底色天然适配深浅两套主题。 */
  .settings-index-icon--purple {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }
  .settings-index-icon--green {
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, transparent);
  }

  .settings-index-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .settings-index-title {
    font-size: 15px;
    font-weight: 600;
  }
  /* 摘要恒为一行:超出省略而不是把行撑高,目录才能保持等高、好扫 */
  .settings-index-summary {
    font-size: 12px;
    color: var(--desc-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .settings-index-chevron {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .settings-index-foot {
    margin: 2px 0 0;
    text-align: center;
    font-size: 12px;
    color: var(--desc-color);
  }
</style>
