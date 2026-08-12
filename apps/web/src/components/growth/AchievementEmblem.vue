<template>
  <span
    class="achievement-emblem"
    :class="[
      `achievement-emblem--${visual.family}`,
      `achievement-emblem--tier-${visual.tier}`,
      `achievement-emblem--rarity-${visual.rarity}`,
      {
        'achievement-emblem--apex': visual.apex,
        'achievement-emblem--compact': compact,
        'achievement-emblem--showcase': showcase,
        'achievement-emblem--locked': locked,
      },
    ]"
    :style="emblemStyle"
    aria-hidden="true"
  >
    <span class="achievement-emblem__corona"></span>
    <span class="achievement-emblem__aura"></span>
    <span class="achievement-emblem__laurel achievement-emblem__laurel--left">
      <i v-for="index in 5" :key="`left-${index}`"></i>
    </span>
    <span class="achievement-emblem__laurel achievement-emblem__laurel--right">
      <i v-for="index in 5" :key="`right-${index}`"></i>
    </span>
    <span class="achievement-emblem__orbit">
      <i v-for="index in 4" :key="`orbit-${index}`"></i>
    </span>
    <span class="achievement-emblem__shell">
      <span class="achievement-emblem__facet"></span>
      <span class="achievement-emblem__core">
        <span class="achievement-emblem__pattern"></span>
        <span class="achievement-emblem__glyph-stack">
          <SvgIcon class="achievement-emblem__glyph-shadow" :src="visual.icon" :size="iconSize" />
          <SvgIcon class="achievement-emblem__glyph" :src="visual.icon" :size="iconSize" />
        </span>
      </span>
    </span>
    <span class="achievement-emblem__crown">
      <i v-for="index in 5" :key="`crown-${index}`"></i>
    </span>
    <span class="achievement-emblem__tier">
      <i v-for="index in visual.tier" :key="index"></i>
    </span>
    <span class="achievement-emblem__stars">
      <i v-for="index in 6" :key="`star-${index}`"></i>
    </span>
    <span class="achievement-emblem__shine"></span>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { achievementVisualFor, achievementVisualStyle } from '@/config/achievements.ts';

  const props = withDefaults(
    defineProps<{
      achievementKey: string;
      group?: string;
      size?: number;
      locked?: boolean;
    }>(),
    {
      group: '',
      size: 46,
      locked: false,
    },
  );

  const visual = computed(() => achievementVisualFor(props.achievementKey, props.group));
  const compact = computed(() => props.size <= 34);
  const showcase = computed(() => props.size >= 68);
  const iconSize = computed(() => Math.max(14, Math.round(props.size * (compact.value ? 0.46 : 0.43))));
  const emblemStyle = computed(() => ({
    ...achievementVisualStyle(props.achievementKey, props.group),
    '--achievement-size': `${props.size}px`,
    '--achievement-glyph-offset': `${Math.max(1, Math.round(props.size * 0.022))}px`,
    '--achievement-tier-dot': `${Math.max(2, Math.round(props.size * 0.05))}px`,
  }));
</script>

<style scoped lang="less">
  .achievement-emblem {
    position: relative;
    flex: 0 0 auto;
    width: var(--achievement-size);
    height: var(--achievement-size);
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
    overflow: visible;
    color: var(--achievement-accent);
    isolation: isolate;
  }

  .achievement-emblem__corona,
  .achievement-emblem__aura,
  .achievement-emblem__laurel,
  .achievement-emblem__orbit,
  .achievement-emblem__shell,
  .achievement-emblem__facet,
  .achievement-emblem__core,
  .achievement-emblem__pattern,
  .achievement-emblem__crown,
  .achievement-emblem__tier,
  .achievement-emblem__stars,
  .achievement-emblem__shine {
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;
  }

  /* 日冕只属于传奇及以上；中心会被徽章本体遮住，因此不依赖 mask 兼容性。 */
  .achievement-emblem__corona {
    z-index: -5;
    inset: -10%;
    clip-path: polygon(
      50% 0,
      55% 36%,
      66% 4%,
      64% 39%,
      80% 12%,
      70% 43%,
      94% 28%,
      75% 48%,
      100% 50%,
      75% 55%,
      94% 72%,
      69% 60%,
      80% 88%,
      62% 63%,
      66% 97%,
      55% 65%,
      50% 100%,
      45% 65%,
      34% 97%,
      38% 63%,
      20% 88%,
      31% 60%,
      6% 72%,
      25% 55%,
      0 50%,
      25% 48%,
      6% 28%,
      30% 43%,
      20% 12%,
      36% 39%,
      34% 4%,
      45% 36%
    );
    background: conic-gradient(
      from 8deg,
      var(--achievement-metal-highlight),
      var(--achievement-metal-mid) 10%,
      var(--achievement-metal-white) 18%,
      var(--achievement-metal-bright) 28%,
      var(--achievement-metal-mid) 40%,
      var(--achievement-metal-white) 50%,
      var(--achievement-metal-bright) 61%,
      var(--achievement-metal-mid) 73%,
      var(--achievement-metal-white) 84%,
      var(--achievement-metal-bright)
    );
    opacity: 0;
  }

  .achievement-emblem__aura {
    z-index: -6;
    inset: -12%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--achievement-metal-glow) 0 20%, transparent 70%);
    opacity: 0;
    transform: scale(0.88);
  }

  /* 月桂叶是高阶身份轮廓，不参与低阶徽章的装饰。 */
  .achievement-emblem__laurel {
    z-index: -1;
    top: 25%;
    width: 30%;
    height: 64%;
    opacity: 0;
  }

  .achievement-emblem__laurel--left {
    left: -7%;
  }

  .achievement-emblem__laurel--right {
    right: -7%;
    transform: scaleX(-1);
  }

  .achievement-emblem__laurel i {
    position: absolute;
    left: 8%;
    width: 78%;
    height: 17%;
    border: 1px solid var(--achievement-metal-dark);
    border-radius: 100% 8% 100% 8%;
    background: linear-gradient(
      145deg,
      var(--achievement-metal-white),
      var(--achievement-metal-bright) 48%,
      var(--achievement-metal-mid)
    );
    transform: rotate(-34deg);
    transform-origin: left center;
  }

  .achievement-emblem__laurel i:nth-child(1) {
    bottom: 4%;
    transform: rotate(-12deg) scale(0.88);
  }

  .achievement-emblem__laurel i:nth-child(2) {
    bottom: 21%;
    transform: rotate(-25deg) scale(0.94);
  }

  .achievement-emblem__laurel i:nth-child(3) {
    bottom: 39%;
  }

  .achievement-emblem__laurel i:nth-child(4) {
    bottom: 57%;
    transform: rotate(-43deg) scale(0.91);
  }

  .achievement-emblem__laurel i:nth-child(5) {
    bottom: 74%;
    transform: rotate(-52deg) scale(0.78);
  }

  .achievement-emblem__orbit {
    z-index: -2;
    inset: -5%;
    border: 1px solid var(--achievement-metal-bright);
    border-right-color: transparent;
    border-bottom-color: var(--achievement-metal-white);
    border-radius: 50%;
    opacity: 0;
    transform: rotate(24deg) scaleY(0.76);
  }

  .achievement-emblem__orbit::before {
    position: absolute;
    inset: 10%;
    content: '';
    border: 1px solid var(--achievement-metal-highlight);
    border-top-color: transparent;
    border-left-color: var(--achievement-metal-white);
    border-radius: 50%;
    transform: rotate(61deg) scaleY(0.82);
  }

  .achievement-emblem__orbit i {
    position: absolute;
    width: 8%;
    aspect-ratio: 1;
    border: 1px solid var(--achievement-metal-white);
    background: linear-gradient(
      135deg,
      var(--achievement-metal-white),
      var(--achievement-metal-bright) 52%,
      var(--achievement-metal-mid)
    );
    transform: rotate(45deg);
  }

  .achievement-emblem__orbit i:nth-child(1) {
    top: -4%;
    left: 48%;
  }

  .achievement-emblem__orbit i:nth-child(2) {
    top: 47%;
    right: -4%;
  }

  .achievement-emblem__orbit i:nth-child(3) {
    right: 47%;
    bottom: -4%;
  }

  .achievement-emblem__orbit i:nth-child(4) {
    top: 47%;
    left: -4%;
  }

  .achievement-emblem__shell {
    z-index: 0;
    inset: 3%;
    overflow: hidden;
    clip-path: polygon(
      50% 0,
      70% 7%,
      87% 15%,
      100% 38%,
      95% 65%,
      82% 85%,
      62% 96%,
      50% 100%,
      38% 96%,
      18% 85%,
      5% 65%,
      0 38%,
      13% 15%,
      30% 7%
    );
    background: conic-gradient(
      from 208deg,
      var(--achievement-metal-deep),
      var(--achievement-metal-mid) 12%,
      var(--achievement-metal-white) 23%,
      var(--achievement-metal-bright) 33%,
      var(--achievement-metal-dark) 47%,
      var(--achievement-metal-highlight) 60%,
      var(--achievement-metal-mid) 74%,
      var(--achievement-metal-white) 84%,
      var(--achievement-metal-deep)
    );
    box-shadow:
      0 0 0 1px var(--achievement-metal-dark),
      0 5px 14px -6px var(--achievement-shadow),
      0 0 13px -5px var(--achievement-metal-glow);
  }

  .achievement-emblem__shell::before {
    position: absolute;
    z-index: 2;
    inset: 5%;
    content: '';
    clip-path: inherit;
    border: 1px solid var(--achievement-metal-highlight);
    background: transparent;
    opacity: 0.84;
  }

  .achievement-emblem__shell::after {
    position: absolute;
    z-index: 1;
    inset: 9%;
    content: '';
    border: 1px solid var(--achievement-metal-dark);
    border-radius: 39% 39% 45% 45%;
    background: linear-gradient(
      145deg,
      var(--achievement-metal-white),
      var(--achievement-metal-mid) 45%,
      var(--achievement-metal-deep)
    );
    opacity: 0.94;
  }

  .achievement-emblem__facet {
    z-index: 0;
    inset: 0;
    background: repeating-conic-gradient(
      from 8deg,
      rgba(255, 255, 255, 0.62) 0deg 6deg,
      transparent 6deg 21deg,
      rgba(39, 20, 0, 0.18) 21deg 28deg,
      transparent 28deg 45deg
    );
    mix-blend-mode: soft-light;
  }

  .achievement-emblem__core {
    z-index: 3;
    inset: 17%;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--achievement-metal-white);
    border-radius: 36% 36% 43% 43%;
    background:
      radial-gradient(circle at 28% 18%, rgba(255, 255, 255, 0.82) 0 6%, transparent 24%),
      linear-gradient(145deg, var(--achievement-secondary), var(--achievement-accent) 50%, var(--achievement-deep));
    box-shadow:
      inset 0 1px 2px rgba(255, 255, 255, 0.82),
      inset 0 -4px 7px rgba(25, 12, 48, 0.32),
      0 0 0 1px var(--achievement-metal-dark);
  }

  .achievement-emblem__pattern {
    z-index: 0;
    inset: 0;
    opacity: 0.25;
  }

  .achievement-emblem--checkin .achievement-emblem__pattern,
  .achievement-emblem--level .achievement-emblem__pattern {
    background: repeating-conic-gradient(from 12deg, rgba(255, 255, 255, 0.92) 0deg 4deg, transparent 4deg 30deg);
  }

  .achievement-emblem--bookmark .achievement-emblem__pattern {
    background: repeating-linear-gradient(90deg, transparent 0 21%, rgba(255, 255, 255, 0.78) 21% 25%);
  }

  .achievement-emblem--note .achievement-emblem__pattern {
    background: repeating-linear-gradient(-42deg, transparent 0 18%, rgba(255, 255, 255, 0.78) 18% 22%);
  }

  .achievement-emblem--file .achievement-emblem__pattern {
    background:
      radial-gradient(circle at 22% 28%, rgba(255, 255, 255, 0.94) 0 5%, transparent 6%),
      radial-gradient(circle at 74% 68%, rgba(255, 255, 255, 0.8) 0 7%, transparent 8%);
  }

  .achievement-emblem--todo .achievement-emblem__pattern {
    background:
      linear-gradient(135deg, transparent 42%, rgba(255, 255, 255, 0.88) 43% 48%, transparent 49%),
      linear-gradient(45deg, transparent 58%, rgba(255, 255, 255, 0.7) 59% 63%, transparent 64%);
  }

  .achievement-emblem--organize .achievement-emblem__pattern {
    background:
      repeating-linear-gradient(0deg, transparent 0 23%, rgba(255, 255, 255, 0.7) 23% 27%),
      repeating-linear-gradient(90deg, transparent 0 23%, rgba(255, 255, 255, 0.7) 23% 27%);
  }

  .achievement-emblem--tenure .achievement-emblem__pattern {
    background: repeating-radial-gradient(circle at 50% 72%, transparent 0 16%, rgba(255, 255, 255, 0.8) 17% 20%);
  }

  .achievement-emblem__glyph-stack {
    position: relative;
    z-index: 2;
    display: grid;
    place-items: center;
    transform: translateY(-4%);
  }

  .achievement-emblem__glyph-shadow,
  .achievement-emblem__glyph {
    grid-area: 1 / 1;
  }

  .achievement-emblem__glyph-shadow {
    color: var(--achievement-deep);
    opacity: 0.82;
    transform: translate(var(--achievement-glyph-offset), var(--achievement-glyph-offset));
  }

  .achievement-emblem__glyph {
    color: var(--achievement-metal-white);
    filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.42));
  }

  .achievement-emblem__crown {
    z-index: 5;
    top: -5%;
    left: 50%;
    width: 44%;
    height: 25%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2%;
    opacity: 0;
    transform: translateX(-50%);
  }

  .achievement-emblem__crown::after {
    position: absolute;
    right: 9%;
    bottom: 0;
    left: 9%;
    height: 24%;
    content: '';
    border: 1px solid var(--achievement-metal-dark);
    border-radius: 999px;
    background: linear-gradient(
      180deg,
      var(--achievement-metal-white),
      var(--achievement-metal-bright) 48%,
      var(--achievement-metal-mid)
    );
  }

  .achievement-emblem__crown i {
    position: relative;
    z-index: 1;
    width: 18%;
    height: 60%;
    clip-path: polygon(50% 0, 100% 72%, 78% 100%, 22% 100%, 0 72%);
    background: linear-gradient(
      145deg,
      var(--achievement-metal-white),
      var(--achievement-metal-bright) 46%,
      var(--achievement-metal-dark)
    );
  }

  .achievement-emblem__crown i:nth-child(2),
  .achievement-emblem__crown i:nth-child(4) {
    height: 74%;
  }

  .achievement-emblem__crown i:nth-child(3) {
    height: 96%;
  }

  .achievement-emblem__tier {
    z-index: 6;
    right: 17%;
    bottom: 0;
    left: 17%;
    min-height: calc(var(--achievement-tier-dot) * 2.3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: calc(var(--achievement-tier-dot) * 0.52);
    padding: calc(var(--achievement-tier-dot) * 0.45) calc(var(--achievement-tier-dot) * 0.85);
    border: 1px solid var(--achievement-metal-highlight);
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--achievement-metal-deep),
      var(--achievement-metal-mid),
      var(--achievement-metal-deep)
    );
    box-shadow: 0 2px 5px -2px var(--achievement-shadow);
  }

  .achievement-emblem__tier i {
    width: var(--achievement-tier-dot);
    height: var(--achievement-tier-dot);
    border: 1px solid var(--achievement-metal-deep);
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 30%,
      var(--achievement-metal-white),
      var(--achievement-metal-bright) 44%,
      var(--achievement-metal-mid)
    );
  }

  .achievement-emblem__stars {
    z-index: 7;
    inset: -10%;
    opacity: 0;
  }

  .achievement-emblem__stars i {
    position: absolute;
    width: 7%;
    aspect-ratio: 1;
    clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
    background: var(--achievement-metal-white);
    opacity: 0.7;
  }

  .achievement-emblem__stars i:nth-child(1) {
    top: 5%;
    left: 7%;
  }

  .achievement-emblem__stars i:nth-child(2) {
    top: 13%;
    right: 2%;
    width: 10%;
  }

  .achievement-emblem__stars i:nth-child(3) {
    top: 47%;
    left: -4%;
    width: 8%;
  }

  .achievement-emblem__stars i:nth-child(4) {
    right: -3%;
    bottom: 25%;
    width: 6%;
  }

  .achievement-emblem__stars i:nth-child(5) {
    bottom: 5%;
    left: 9%;
    width: 6%;
  }

  .achievement-emblem__stars i:nth-child(6) {
    right: 12%;
    bottom: 0;
    width: 9%;
  }

  .achievement-emblem__shine {
    z-index: 8;
    inset: 1%;
    overflow: hidden;
    clip-path: polygon(
      50% 0,
      70% 7%,
      87% 15%,
      100% 38%,
      95% 65%,
      82% 85%,
      62% 96%,
      50% 100%,
      38% 96%,
      18% 85%,
      5% 65%,
      0 38%,
      13% 15%,
      30% 7%
    );
    background: linear-gradient(108deg, transparent 19%, rgba(255, 255, 255, 0.9) 42%, transparent 62%);
    opacity: 0;
    transform: translateX(-88%);
  }

  /* 铂银阶段有小冠饰；鎏金阶段开始展示更完整的身份结构。 */
  .achievement-emblem--tier-2 .achievement-emblem__crown,
  .achievement-emblem--tier-3 .achievement-emblem__crown {
    top: -1%;
    width: 31%;
    height: 17%;
    opacity: 0.9;
  }

  .achievement-emblem--tier-2 .achievement-emblem__crown i:first-child,
  .achievement-emblem--tier-2 .achievement-emblem__crown i:last-child,
  .achievement-emblem--tier-3 .achievement-emblem__crown i:first-child,
  .achievement-emblem--tier-3 .achievement-emblem__crown i:last-child {
    display: none;
  }

  .achievement-emblem--tier-3 .achievement-emblem__shell,
  .achievement-emblem--tier-4 .achievement-emblem__shell,
  .achievement-emblem--tier-5 .achievement-emblem__shell {
    inset: 1%;
  }

  .achievement-emblem--tier-4 .achievement-emblem__corona {
    opacity: 0.7;
  }

  .achievement-emblem--tier-4 .achievement-emblem__aura {
    opacity: 0.7;
  }

  .achievement-emblem--tier-4 .achievement-emblem__laurel,
  .achievement-emblem--tier-4 .achievement-emblem__crown {
    opacity: 0.96;
  }

  .achievement-emblem--tier-4 .achievement-emblem__orbit {
    opacity: 0.58;
  }

  .achievement-emblem--tier-5 .achievement-emblem__corona {
    inset: -14%;
    opacity: 0.94;
  }

  .achievement-emblem--tier-5 .achievement-emblem__aura {
    inset: -18%;
    opacity: 0.94;
  }

  .achievement-emblem--tier-5 .achievement-emblem__laurel,
  .achievement-emblem--tier-5 .achievement-emblem__crown,
  .achievement-emblem--tier-5 .achievement-emblem__orbit,
  .achievement-emblem--tier-5 .achievement-emblem__stars {
    opacity: 1;
  }

  .achievement-emblem--tier-5 .achievement-emblem__shell {
    inset: -1%;
  }

  .achievement-emblem--tier-5 .achievement-emblem__core {
    inset: 18%;
    border-width: 2px;
  }

  /* 顶级成就拥有比普通五阶更宽的星冕、双轨和钻石白高光。 */
  .achievement-emblem--apex .achievement-emblem__corona {
    inset: -20%;
    background: conic-gradient(
      from 0deg,
      var(--achievement-metal-white),
      var(--achievement-metal-bright) 11%,
      var(--achievement-metal-white) 19%,
      #f8d6ff 27%,
      var(--achievement-metal-bright) 37%,
      var(--achievement-metal-white) 50%,
      #dcecff 61%,
      var(--achievement-metal-bright) 74%,
      var(--achievement-metal-white) 86%,
      var(--achievement-metal-bright)
    );
  }

  .achievement-emblem--apex .achievement-emblem__orbit {
    inset: -13%;
    border-width: 2px;
    border-color: var(--achievement-metal-white) var(--achievement-metal-bright) transparent
      var(--achievement-metal-highlight);
  }

  .achievement-emblem--apex .achievement-emblem__orbit::before {
    inset: 17%;
    border-color: var(--achievement-metal-bright) transparent var(--achievement-metal-white)
      var(--achievement-metal-highlight);
  }

  .achievement-emblem--apex .achievement-emblem__shell {
    box-shadow:
      0 0 0 1px var(--achievement-metal-dark),
      0 0 0 3px var(--achievement-metal-highlight),
      0 7px 18px -5px var(--achievement-shadow),
      0 0 20px -3px var(--achievement-metal-glow);
  }

  .achievement-emblem--apex .achievement-emblem__crown {
    top: -10%;
    width: 50%;
    height: 29%;
  }

  .achievement-emblem--apex .achievement-emblem__tier {
    bottom: -3%;
    border-color: var(--achievement-metal-white);
  }

  .achievement-emblem--showcase.achievement-emblem--tier-5 .achievement-emblem__stars i {
    box-shadow: 0 0 8px var(--achievement-metal-glow);
  }

  .achievement-emblem--compact .achievement-emblem__laurel {
    top: 29%;
    width: 25%;
    height: 57%;
  }

  .achievement-emblem--compact .achievement-emblem__laurel--left {
    left: -3%;
  }

  .achievement-emblem--compact .achievement-emblem__laurel--right {
    right: -3%;
  }

  .achievement-emblem--compact .achievement-emblem__stars i:nth-child(n + 4) {
    display: none;
  }

  .achievement-emblem--compact .achievement-emblem__tier {
    right: 16%;
    bottom: -1%;
    left: 16%;
    gap: 1px;
    padding-right: 2px;
    padding-left: 2px;
  }

  .achievement-emblem:not(.achievement-emblem--locked):hover .achievement-emblem__shine,
  .achievement-emblem:not(.achievement-emblem--locked):focus-within .achievement-emblem__shine {
    animation: achievement-emblem-glint 680ms ease-out both;
  }

  /* 动效只改变 transform / opacity；等级越高，动态身份越强。 */
  .achievement-emblem--tier-3:not(.achievement-emblem--locked) .achievement-emblem__shine {
    animation: achievement-emblem-shimmer 7.4s ease-in-out infinite;
  }

  .achievement-emblem--tier-4:not(.achievement-emblem--locked) .achievement-emblem__corona {
    animation: achievement-emblem-orbit 22s linear infinite;
  }

  .achievement-emblem--tier-4:not(.achievement-emblem--locked) .achievement-emblem__aura {
    animation: achievement-emblem-breathe 5.2s ease-in-out infinite;
  }

  .achievement-emblem--tier-4:not(.achievement-emblem--locked) .achievement-emblem__orbit {
    animation: achievement-emblem-orbit-ellipse 15s linear infinite;
  }

  .achievement-emblem--tier-4:not(.achievement-emblem--locked) .achievement-emblem__shine {
    animation: achievement-emblem-shimmer 5.8s ease-in-out infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__corona {
    will-change: transform;
    animation: achievement-emblem-orbit 13s linear infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__aura {
    will-change: transform, opacity;
    animation: achievement-emblem-breathe 3.8s ease-in-out infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__orbit {
    will-change: transform;
    animation: achievement-emblem-orbit-ellipse 8.8s linear infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__shell {
    will-change: transform;
    animation: achievement-emblem-float 4s ease-in-out infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__shine {
    will-change: transform, opacity;
    animation: achievement-emblem-shimmer 4.6s ease-in-out infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__stars i {
    animation: achievement-emblem-star 3.1s ease-in-out infinite;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__stars i:nth-child(2n) {
    animation-delay: -1.4s;
  }

  .achievement-emblem--tier-5:not(.achievement-emblem--locked) .achievement-emblem__stars i:nth-child(3n) {
    animation-delay: -2.1s;
  }

  .achievement-emblem--apex:not(.achievement-emblem--locked) .achievement-emblem__corona {
    animation-duration: 9.8s;
  }

  .achievement-emblem--apex:not(.achievement-emblem--locked) .achievement-emblem__orbit {
    animation-duration: 6.8s;
  }

  .achievement-emblem--locked {
    filter: grayscale(0.82) saturate(0.22);
    opacity: 0.62;
  }

  .achievement-emblem--locked .achievement-emblem__corona,
  .achievement-emblem--locked .achievement-emblem__aura,
  .achievement-emblem--locked .achievement-emblem__orbit,
  .achievement-emblem--locked .achievement-emblem__stars {
    opacity: 0.2;
  }

  .achievement-emblem--locked .achievement-emblem__core {
    background: linear-gradient(145deg, #e9edf3, #a7b0bf 55%, #667085);
  }

  .achievement-emblem--locked .achievement-emblem__glyph {
    color: #f6f8fb;
    opacity: 0.74;
  }

  [data-theme='night'] .achievement-emblem__core {
    box-shadow:
      inset 0 1px 2px rgba(255, 255, 255, 0.28),
      inset 0 -4px 7px rgba(0, 0, 0, 0.52),
      0 0 0 1px var(--achievement-metal-dark);
  }

  [data-theme='night'] .achievement-emblem--locked .achievement-emblem__core {
    background: linear-gradient(145deg, #626b79, #343b47 58%, #191e26);
  }

  html.light-note-mobile-rendering .achievement-emblem__shell,
  html.light-note-mobile-rendering .achievement-emblem__core,
  html.light-note-mobile-rendering .achievement-emblem__tier,
  html.light-note-mobile-rendering .achievement-emblem__stars i {
    box-shadow: none;
  }

  html.light-note-mobile-rendering .achievement-emblem__glyph {
    filter: none;
  }

  @keyframes achievement-emblem-glint {
    0% {
      opacity: 0;
      transform: translateX(-88%);
    }
    30% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translateX(88%);
    }
  }

  @keyframes achievement-emblem-shimmer {
    0%,
    58% {
      opacity: 0;
      transform: translateX(-88%);
    }
    68% {
      opacity: 0.88;
    }
    80%,
    100% {
      opacity: 0;
      transform: translateX(88%);
    }
  }

  @keyframes achievement-emblem-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes achievement-emblem-orbit-ellipse {
    from {
      transform: rotate(24deg) scaleY(0.76);
    }
    to {
      transform: rotate(384deg) scaleY(0.76);
    }
  }

  @keyframes achievement-emblem-float {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-1.5%) scale(1.018);
    }
  }

  @keyframes achievement-emblem-breathe {
    0%,
    100% {
      opacity: 0.56;
      transform: scale(0.88);
    }
    50% {
      opacity: 1;
      transform: scale(1.06);
    }
  }

  @keyframes achievement-emblem-star {
    0%,
    100% {
      opacity: 0.32;
      transform: scale(0.72) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.18) rotate(45deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .achievement-emblem__corona,
    .achievement-emblem__aura,
    .achievement-emblem__orbit,
    .achievement-emblem__shell,
    .achievement-emblem__stars i,
    .achievement-emblem__shine {
      animation: none !important;
    }
  }
</style>
