<template>
  <section class="motion-review">
    <h2>初光 · 同心珐琅框</h2>
    <div class="motion-review__frames">
      <figure v-for="(size, i) in [32, 40, 64, 86]" :key="size">
        <AvatarFramePreview
          frame-id="frame_first_light"
          :src="portraits[i % portraits.length]"
          :size="dimension(size, 'layout')"
        />
        <figcaption>{{ size }} px</figcaption>
      </figure>
      <figure v-for="frame in ['frame_streak_seed', 'frame_mint']" :key="frame">
        <AvatarFramePreview :frame-id="frame" :src="portraits[0]" :size="dimension(64, 'layout')" />
        <figcaption>{{ frame === 'frame_mint' ? '积分基础 · 对照' : '成就进阶 · 对照' }}</figcaption>
      </figure>
    </div>
    <h2>八枚顶级成就 · 连续动效</h2>
    <div class="motion-review__grid">
      <figure v-for="[key, name, description] in awards" :key="key">
        <AchievementEmblem :achievement-key="key" :size="dimension(140, 'layout')" :animated="animated" />
        <figcaption
          ><strong>{{ name }}</strong
          ><span>{{ description }}</span></figcaption
        >
      </figure>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useUiDensity } from '@/composables/useUiDensity';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  defineProps<{ portraits: string[]; animated: boolean }>();
  const { dimension } = useUiDensity();
  const awards = [
    ['streak_365', '岁月长明', '日轮转动 · 星坠轻摆'],
    ['level_15', '文坛巨擘', '书页交替翻动'],
    ['bookmark_500', '书海无涯', '星图书签悬摆'],
    ['note_500', '五百成章', '笔尖运笔 · 提笔回锋'],
    ['file_500', '云海藏珍', '文件错层升起'],
    ['todo_1000', '千事有成', '旗面迎风翻动'],
    ['organize_1000', '万卷归宗', '抽屉开合 · 索引升起'],
    ['join_365', '周年知己', '枝叶错拍摇曳'],
  ];
</script>

<style scoped>
  .motion-review {
    margin-block: var(--ui-space-20, 20px) var(--ui-space-32, 32px);
  }
  h2 {
    font-size: var(--ui-font-16, 16px);
    margin-block: var(--ui-space-24, 24px) var(--ui-space-16, 16px);
  }
  .motion-review__frames {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-around;
    gap: var(--ui-space-20, 20px);
  }
  .motion-review__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--ui-layout-260, 260px)), 1fr));
    gap: var(--ui-space-12, 12px);
  }
  figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    margin: 0;
    padding: var(--ui-space-16, 16px);
  }
  .motion-review__grid figure {
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--card-bg-color, var(--background-color));
  }
  figcaption {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    text-align: center;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
</style>
