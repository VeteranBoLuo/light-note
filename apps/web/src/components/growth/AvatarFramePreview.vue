<template>
  <div
    class="avatar-frame"
    :class="[`avatar-frame--${variant || 'default'}`, { 'avatar-frame--compact': props.size <= 40 }]"
    :style="frameStyle"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="avatar-frame__ring" aria-hidden="true"></span>
    <span class="avatar-frame__motif" aria-hidden="true"></span>
    <span class="avatar-frame__orbit" aria-hidden="true"></span>
    <span class="avatar-frame__comet" aria-hidden="true"></span>
    <span class="avatar-frame__portrait">
      <SvgIcon :src="src" :size="size" />
    </span>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { frameVariant } from '@/config/growthFrames';

  const props = withDefaults(
    defineProps<{
      frameId?: string | null;
      src: string;
      size?: number;
      decorative?: boolean;
    }>(),
    {
      frameId: null,
      size: 60,
      decorative: true,
    },
  );

  const variant = computed(() => frameVariant(props.frameId));
  const frameStyle = computed(() => {
    const rim = Math.max(3, Math.round(props.size * 0.1));
    return {
      '--frame-size': `${props.size}px`,
      '--frame-rim': `${rim}px`,
      '--frame-outer-size': `${props.size + rim * 2}px`,
      '--frame-motif-inset': `${Math.max(1, Math.round(rim * 0.35))}px`,
      '--frame-motif-outset': `${-Math.max(1, Math.round(rim * 0.35))}px`,
      // 小头像沿用同一套视觉语言，但所有光晕随尺寸收紧，避免导航栏出现一团扩散紫雾。
      '--frame-galaxy-glow': `${Math.max(5, Math.round(props.size * 0.14))}px`,
      '--frame-galaxy-orbit-glow': `${Math.max(3, Math.round(props.size * 0.08))}px`,
      '--frame-galaxy-star-glow': `${Math.max(4, Math.round(props.size * 0.11))}px`,
      '--frame-galaxy-star-wide-glow': `${Math.max(6, Math.round(props.size * 0.15))}px`,
      '--frame-celestial-glow': `${Math.max(10, Math.round(props.size * 0.27))}px`,
      '--frame-galaxy-drop-y': `${Math.max(2, Math.round(props.size * 0.06))}px`,
      '--frame-galaxy-drop-blur': `${Math.max(7, Math.round(props.size * 0.16))}px`,
      '--frame-galaxy-drop-spread': `-${Math.max(3, Math.round(props.size * 0.1))}px`,
    };
  });
</script>

<style scoped lang="less">
  .avatar-frame {
    position: relative;
    isolation: isolate;
    display: inline-grid;
    place-items: center;
    width: var(--frame-outer-size);
    height: var(--frame-outer-size);
    line-height: 0;
    flex: 0 0 auto;
  }

  .avatar-frame__ring,
  .avatar-frame__motif,
  .avatar-frame__orbit,
  .avatar-frame__comet {
    position: absolute;
    pointer-events: none;
  }

  .avatar-frame__ring,
  .avatar-frame__motif {
    inset: 0;
    border-radius: 50%;
  }

  .avatar-frame__orbit,
  .avatar-frame__comet {
    display: none;
  }

  .avatar-frame__ring {
    z-index: 0;
    background: conic-gradient(from 180deg, #8b5cf6, #6366f1, #8b5cf6);
    box-shadow: 0 5px 14px -7px rgba(79, 70, 229, 0.9);
  }

  .avatar-frame__motif {
    z-index: 1;
  }

  .avatar-frame__portrait {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--frame-size);
    height: var(--frame-size);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--background-color) 85%, transparent);
    border-radius: 50%;
    background: var(--background-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--card-border-color) 35%, transparent);
  }

  .avatar-frame__portrait :deep(img),
  .avatar-frame__portrait :deep(.icon-base64),
  .avatar-frame__portrait :deep(.icon-fixed-base64) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit;
    object-fit: cover;
  }

  /* 薄荷：入门款使用清透双色环，不使用持续动效。 */
  .avatar-frame--mint .avatar-frame__ring {
    background: conic-gradient(from 195deg, #0f766e, #2dd4bf 24%, #a7f3d0 48%, #5eead4 70%, #0f766e);
    box-shadow:
      0 0 0 1px rgba(153, 246, 228, 0.72),
      0 6px 14px -8px rgba(13, 148, 136, 0.72);
  }

  .avatar-frame--mint .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(circle at 22% 25%, rgba(236, 253, 245, 0.96) 0 3%, transparent 4%),
      radial-gradient(circle at 79% 72%, rgba(204, 251, 241, 0.88) 0 2.5%, transparent 3.5%);
  }

  /* 墨韵：一圈不规则水墨浓淡，保留克制的基础档质感。 */
  .avatar-frame--ink .avatar-frame__ring {
    background: conic-gradient(
      from 28deg,
      #111827,
      #6b7280 18%,
      #e5e7eb 31%,
      #374151 47%,
      #030712 70%,
      #9ca3af 86%,
      #111827
    );
    box-shadow:
      0 0 0 1px rgba(107, 114, 128, 0.5),
      0 7px 15px -9px rgba(17, 24, 39, 0.75);
  }

  .avatar-frame--ink .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(75, 85, 99, 0.48);
    clip-path: polygon(8% 27%, 27% 5%, 62% 1%, 93% 24%, 98% 61%, 77% 94%, 42% 99%, 11% 82%, 1% 48%);
  }

  /* 鎏金：金属分层与一束缓慢扫过的高光。 */
  .avatar-frame--gold .avatar-frame__ring {
    background: conic-gradient(
      from 210deg,
      #7c2d12,
      #d97706 12%,
      #fde68a 25%,
      #f59e0b 38%,
      #fff3b0 51%,
      #b45309 68%,
      #fbbf24 82%,
      #7c2d12
    );
    box-shadow:
      0 0 0 1px rgba(253, 230, 138, 0.78),
      0 6px 16px -7px rgba(180, 83, 9, 0.82);
    animation: frame-gold-turn 11s linear infinite;
  }

  .avatar-frame--gold .avatar-frame__motif {
    inset: var(--frame-motif-inset);
    overflow: hidden;
    background: linear-gradient(118deg, transparent 37%, rgba(255, 255, 255, 0.82) 49%, transparent 60%);
    mix-blend-mode: screen;
    animation: frame-gold-glint 3.8s ease-in-out infinite;
  }

  /* 樱绯：柔和双层花瓣环与轻微呼吸，不以颜色轮换冒充动效。 */
  .avatar-frame--sakura .avatar-frame__ring {
    background: conic-gradient(from 15deg, #fce7f3, #f472b6, #be185d, #f9a8d4, #fff1f7, #ec4899, #fce7f3);
    box-shadow:
      0 0 0 2px rgba(251, 207, 232, 0.76),
      0 7px 16px -8px rgba(219, 39, 119, 0.8);
  }

  .avatar-frame--sakura .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(ellipse at 18% 38%, rgba(255, 255, 255, 0.92) 0 7%, transparent 8%),
      radial-gradient(ellipse at 78% 23%, rgba(255, 222, 239, 0.98) 0 6%, transparent 7%),
      radial-gradient(ellipse at 86% 72%, rgba(255, 255, 255, 0.85) 0 5%, transparent 6%),
      radial-gradient(ellipse at 26% 84%, rgba(244, 114, 182, 0.85) 0 6%, transparent 7%);
    filter: drop-shadow(0 1px 2px rgba(190, 24, 93, 0.26));
    animation: frame-sakura-float 4.4s ease-in-out infinite;
  }

  /* 霓虹：两色能量环与轨道光点，强调赛博轮廓。 */
  .avatar-frame--neon .avatar-frame__ring {
    background: conic-gradient(from 0deg, #22d3ee, #3b82f6 23%, #7c3aed 46%, #e879f9 68%, #22d3ee);
    box-shadow:
      0 0 8px rgba(34, 211, 238, 0.76),
      0 0 18px rgba(168, 85, 247, 0.54),
      inset 0 0 6px rgba(255, 255, 255, 0.72);
    animation: frame-neon-pulse 2.2s ease-in-out infinite;
  }

  .avatar-frame--neon .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 1px solid rgba(103, 232, 249, 0.7);
    box-shadow:
      0 0 0 1px rgba(192, 132, 252, 0.32),
      0 0 8px rgba(34, 211, 238, 0.5);
    clip-path: polygon(0 39%, 29% 0, 100% 24%, 78% 100%, 10% 82%);
    animation: frame-neon-orbit 6s linear infinite;
  }

  /* 晚霞：暖色地平线与柔和的暮光呼吸。 */
  .avatar-frame--sunset .avatar-frame__ring {
    background: conic-gradient(from 205deg, #7c3aed, #c026d3 20%, #fb7185 43%, #fb923c 64%, #fcd34d 79%, #7c3aed);
    box-shadow:
      0 0 0 1px rgba(253, 186, 116, 0.65),
      0 7px 17px -8px rgba(190, 24, 93, 0.72);
  }

  .avatar-frame--sunset .avatar-frame__motif {
    inset: var(--frame-motif-inset);
    background: linear-gradient(155deg, transparent 48%, rgba(255, 247, 237, 0.7) 50%, transparent 53%);
    animation: frame-sunset-glow 4.8s ease-in-out infinite;
  }

  /* 潮汐：深浅蓝波环与气泡点，动效只做轻微浮动。 */
  .avatar-frame--ocean .avatar-frame__ring {
    background: conic-gradient(from 155deg, #0c4a6e, #0284c7 20%, #22d3ee 41%, #bae6fd 57%, #2563eb 76%, #0c4a6e);
    box-shadow:
      0 0 0 1px rgba(125, 211, 252, 0.7),
      0 7px 17px -8px rgba(2, 132, 199, 0.78);
  }

  .avatar-frame--ocean .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(circle at 25% 18%, rgba(240, 249, 255, 0.96) 0 3%, transparent 4%),
      radial-gradient(circle at 88% 47%, rgba(186, 230, 253, 0.92) 0 4%, transparent 5%),
      radial-gradient(circle at 33% 91%, rgba(224, 242, 254, 0.88) 0 2%, transparent 3%);
    animation: frame-ocean-float 4s ease-in-out infinite;
  }

  /* 极光：中高档的冷色光幕，通过反向旋转产生缓慢流动。 */
  .avatar-frame--aurora .avatar-frame__ring {
    background: conic-gradient(
      from 25deg,
      #042f2e,
      #10b981 17%,
      #67e8f9 36%,
      #818cf8 55%,
      #d946ef 73%,
      #34d399 89%,
      #042f2e
    );
    box-shadow:
      0 0 0 1px rgba(167, 243, 208, 0.66),
      0 0 12px rgba(45, 212, 191, 0.48),
      0 8px 20px -10px rgba(99, 102, 241, 0.78);
    animation: frame-aurora-turn 10s linear infinite;
  }

  .avatar-frame--aurora .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    border: 2px solid transparent;
    border-top-color: rgba(216, 180, 254, 0.78);
    border-right-color: rgba(153, 246, 228, 0.7);
    border-radius: 44% 56% 48% 52%;
    filter: blur(0.25px);
    animation: frame-aurora-wave 5.2s ease-in-out infinite;
  }

  /* 星河：深紫星云、星点、环绕星轨和掠过的彗星，作为高阶款的专属语言。 */
  .avatar-frame--galaxy .avatar-frame__ring {
    background:
      radial-gradient(circle at 68% 22%, rgba(255, 255, 255, 0.98) 0 3%, transparent 4%),
      radial-gradient(circle at 21% 68%, rgba(255, 255, 255, 0.85) 0 2.5%, transparent 3.5%),
      conic-gradient(from 45deg, #312e81, #7c3aed 18%, #ec4899 39%, #60a5fa 60%, #4f46e5 80%, #312e81);
    box-shadow:
      0 0 0 2px rgba(196, 181, 253, 0.72),
      0 0 var(--frame-galaxy-glow) rgba(139, 92, 246, 0.74),
      0 var(--frame-galaxy-drop-y) var(--frame-galaxy-drop-blur) var(--frame-galaxy-drop-spread) rgba(49, 46, 129, 0.8);
    animation: frame-galaxy-turn 13s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(circle at 19% 18%, #fff 0 2%, transparent 3%),
      radial-gradient(circle at 84% 38%, #e0e7ff 0 1.8%, transparent 3%),
      radial-gradient(circle at 44% 95%, #fff 0 1.7%, transparent 3%);
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.9));
    animation: frame-galaxy-twinkle 2.7s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motif::after {
    position: absolute;
    top: 7%;
    left: 12%;
    width: 20%;
    aspect-ratio: 1;
    content: '';
    background: linear-gradient(90deg, transparent 43%, rgba(255, 255, 255, 0.96) 46% 54%, transparent 57%);
    clip-path: polygon(
      46% 0,
      54% 0,
      59% 41%,
      100% 46%,
      100% 54%,
      59% 59%,
      54% 100%,
      46% 100%,
      41% 59%,
      0 54%,
      0 46%,
      41% 41%
    );
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.95));
    animation: frame-galaxy-starburst 4.6s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -8%;
    border: 1px solid rgba(224, 231, 255, 0.4);
    border-right-color: transparent;
    border-bottom-color: transparent;
    border-radius: 50%;
    box-shadow: 0 0 var(--frame-galaxy-orbit-glow) rgba(196, 181, 253, 0.42);
    transform: rotate(-24deg);
    animation: frame-galaxy-orbit 7.4s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__orbit::after {
    position: absolute;
    top: -2px;
    left: 51%;
    width: max(3px, 10%);
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 2px rgba(219, 234, 254, 0.58),
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.86),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(129, 140, 248, 0.76);
  }

  .avatar-frame--galaxy .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: 6%;
    right: -5%;
    width: 25%;
    height: max(2px, 4%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(196, 181, 253, 0.42) 48%, #fff);
    box-shadow: 0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.72);
    transform: rotate(-28deg);
    transform-origin: right center;
    animation: frame-galaxy-comet 5.8s ease-in-out infinite;
  }

  /* 赤焰：金橙火芯叠加暗红外焰，用明暗跳动表达热度。 */
  .avatar-frame--flame .avatar-frame__ring {
    background: conic-gradient(
      from 15deg,
      #7f1d1d,
      #dc2626 18%,
      #fb923c 38%,
      #fef08a 51%,
      #f97316 66%,
      #991b1b 84%,
      #7f1d1d
    );
    box-shadow:
      0 0 0 1px rgba(254, 215, 170, 0.7),
      0 0 12px rgba(249, 115, 22, 0.58),
      0 8px 19px -10px rgba(153, 27, 27, 0.9);
    animation: frame-flame-pulse 2.7s ease-in-out infinite;
  }

  .avatar-frame--flame .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(ellipse at 18% 23%, rgba(254, 240, 138, 0.9) 0 5%, transparent 6%),
      radial-gradient(ellipse at 82% 20%, rgba(251, 146, 60, 0.9) 0 6%, transparent 7%),
      radial-gradient(ellipse at 90% 77%, rgba(254, 215, 170, 0.82) 0 5%, transparent 6%),
      radial-gradient(ellipse at 25% 89%, rgba(239, 68, 68, 0.88) 0 6%, transparent 7%);
    clip-path: polygon(
      50% 0,
      62% 9%,
      76% 3%,
      82% 18%,
      98% 26%,
      91% 43%,
      100% 58%,
      87% 70%,
      82% 91%,
      63% 88%,
      50% 100%,
      37% 89%,
      18% 92%,
      14% 72%,
      0 60%,
      9% 43%,
      2% 27%,
      19% 18%,
      25% 3%,
      39% 10%
    );
    animation: frame-flame-dance 3.1s ease-in-out infinite;
  }

  /* 龙曜：暗红底色、金色龙鳞分段和轨道火星。 */
  .avatar-frame--dragon .avatar-frame__ring {
    background: repeating-conic-gradient(
      from 8deg,
      #450a0a 0 8deg,
      #b91c1c 8deg 18deg,
      #f59e0b 18deg 24deg,
      #7f1d1d 24deg 34deg
    );
    box-shadow:
      0 0 0 2px rgba(245, 158, 11, 0.74),
      0 0 13px rgba(220, 38, 38, 0.56),
      0 9px 22px -11px rgba(69, 10, 10, 0.96);
    animation: frame-dragon-turn 15s linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__motif {
    inset: var(--frame-motif-outset);
    background:
      radial-gradient(ellipse at 22% 23%, rgba(254, 243, 199, 0.95) 0 4%, transparent 5%),
      radial-gradient(ellipse at 78% 77%, rgba(251, 191, 36, 0.9) 0 4%, transparent 5%);
    filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.72));
  }

  .avatar-frame--dragon .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -6%;
    border: 1px solid rgba(251, 191, 36, 0.5);
    border-left-color: transparent;
    border-bottom-color: transparent;
    border-radius: 50%;
    animation: frame-dragon-orbit 6.8s linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__orbit::after {
    position: absolute;
    top: 5%;
    right: 12%;
    width: max(3px, 9%);
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
    background: #fef3c7;
    box-shadow:
      0 0 6px #f59e0b,
      0 0 11px rgba(220, 38, 38, 0.7);
  }

  /* 天穹：最高档的黑金日蚀、双倾角星环、日冕爆发与双尾彗光。 */
  .avatar-frame--celestial .avatar-frame__ring {
    background:
      radial-gradient(circle at 69% 18%, #fff 0 2.8%, transparent 4%),
      radial-gradient(circle at 20% 71%, #fde68a 0 2.3%, transparent 3.5%),
      conic-gradient(
        from 225deg,
        #020617,
        #312e81 13%,
        #854d0e 25%,
        #f59e0b 35%,
        #fff7d6 46%,
        #a78bfa 58%,
        #4338ca 70%,
        #172554 84%,
        #020617
      );
    box-shadow:
      0 0 0 2px #fde68a,
      0 0 var(--frame-galaxy-star-wide-glow) rgba(250, 204, 21, 0.78),
      0 0 var(--frame-celestial-glow) rgba(124, 58, 237, 0.58),
      0 var(--frame-galaxy-drop-y) var(--frame-galaxy-drop-blur) var(--frame-galaxy-drop-spread) rgba(15, 23, 42, 0.96);
    animation: frame-celestial-turn 11s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__ring::before,
  .avatar-frame--celestial .avatar-frame__ring::after {
    position: absolute;
    content: '';
    border-radius: 50%;
    pointer-events: none;
  }

  /* 长短交错的日冕光芒，让静止状态也比龙曜多一层轮廓。 */
  .avatar-frame--celestial .avatar-frame__ring::before {
    inset: -16%;
    background: repeating-conic-gradient(
      from 7deg,
      rgba(254, 243, 199, 0.92) 0 1.5deg,
      transparent 2deg 8deg,
      rgba(196, 181, 253, 0.72) 8.5deg 9.5deg,
      transparent 10deg 18deg
    );
    filter: drop-shadow(0 0 3px rgba(250, 204, 21, 0.78));
    animation: frame-celestial-corona 7.5s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__ring::after {
    inset: -7%;
    border: 1px solid rgba(254, 240, 138, 0.78);
    box-shadow:
      inset 0 0 5px rgba(255, 255, 255, 0.62),
      0 0 var(--frame-galaxy-orbit-glow) rgba(253, 224, 71, 0.74);
    animation: frame-celestial-eclipse-pulse 3.8s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motif {
    inset: calc(var(--frame-motif-outset) - 2%);
    background:
      radial-gradient(circle at 15% 17%, #fff 0 2.8%, transparent 4%),
      radial-gradient(circle at 86% 38%, #fde68a 0 2.4%, transparent 3.6%),
      radial-gradient(circle at 44% 97%, #ddd6fe 0 2.2%, transparent 3.3%),
      radial-gradient(circle at 4% 62%, rgba(147, 197, 253, 0.95) 0 1.7%, transparent 2.8%);
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.88));
    animation: frame-celestial-twinkle 2.6s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motif::before,
  .avatar-frame--celestial .avatar-frame__motif::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    pointer-events: none;
  }

  /* 左下运行星与右上八芒星爆，补齐商店预览中的大范围高光。 */
  .avatar-frame--celestial .avatar-frame__motif::before {
    bottom: 8%;
    left: 4%;
    width: max(3px, 8%);
    border-radius: 50%;
    background: #bfdbfe;
    box-shadow:
      0 0 0 2px rgba(196, 181, 253, 0.52),
      0 0 var(--frame-galaxy-star-glow) rgba(147, 197, 253, 0.92);
    animation: frame-celestial-moon 4.4s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motif::after {
    top: -4%;
    right: 1%;
    width: 22%;
    background: linear-gradient(90deg, transparent 43%, #fff7d6 47% 53%, transparent 57%);
    clip-path: polygon(
      47% 0,
      53% 0,
      58% 39%,
      82% 18%,
      86% 22%,
      64% 43%,
      100% 47%,
      100% 53%,
      64% 58%,
      86% 79%,
      82% 83%,
      58% 63%,
      53% 100%,
      47% 100%,
      42% 63%,
      18% 83%,
      14% 79%,
      36% 58%,
      0 53%,
      0 47%,
      36% 43%,
      14% 22%,
      18% 18%,
      42% 39%
    );
    filter: drop-shadow(0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.96));
    animation: frame-celestial-starburst 4.2s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__orbit {
    z-index: 3;
    display: block;
    inset: -14%;
    border: 1.5px solid rgba(254, 240, 138, 0.82);
    border-right-color: rgba(196, 181, 253, 0.18);
    border-bottom-color: transparent;
    border-radius: 50%;
    box-shadow:
      0 0 var(--frame-galaxy-orbit-glow) rgba(253, 224, 71, 0.7),
      inset 0 0 var(--frame-galaxy-orbit-glow) rgba(167, 139, 250, 0.42);
    transform: rotate(18deg) scaleY(0.72);
    animation: frame-celestial-orbit 7.2s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__orbit::before,
  .avatar-frame--celestial .avatar-frame__orbit::after {
    position: absolute;
    aspect-ratio: 1;
    content: '';
    border-radius: 50%;
  }

  .avatar-frame--celestial .avatar-frame__orbit::before {
    inset: 8%;
    border: 1px solid rgba(196, 181, 253, 0.76);
    border-top-color: transparent;
    border-left-color: rgba(125, 211, 252, 0.66);
    box-shadow: 0 0 var(--frame-galaxy-orbit-glow) rgba(129, 140, 248, 0.5);
    transform: rotate(68deg) scaleY(0.66);
    animation: frame-celestial-counter-orbit 5.6s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__orbit::after {
    top: -5%;
    left: 46%;
    width: max(5px, 12%);
    background: radial-gradient(circle at 35% 30%, #fff, #fef08a 44%, #f59e0b 72%, #7c2d12);
    box-shadow:
      0 0 0 2px rgba(253, 230, 138, 0.58),
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.98),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(250, 204, 21, 0.82);
  }

  .avatar-frame--celestial .avatar-frame__comet {
    z-index: 4;
    display: block;
    top: -4%;
    right: -13%;
    width: 39%;
    height: max(2px, 4.5%);
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(196, 181, 253, 0.22) 25%, #fde68a 76%, #fff);
    box-shadow:
      0 0 var(--frame-galaxy-star-glow) rgba(255, 255, 255, 0.94),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(250, 204, 21, 0.64);
    transform: rotate(-34deg);
    transform-origin: right center;
    animation: frame-celestial-comet 5.6s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__comet::before,
  .avatar-frame--celestial .avatar-frame__comet::after {
    position: absolute;
    content: '';
    pointer-events: none;
  }

  .avatar-frame--celestial .avatar-frame__comet::before {
    top: 210%;
    right: 8%;
    width: 72%;
    height: 72%;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.28), rgba(221, 214, 254, 0.9));
    filter: blur(0.35px);
  }

  .avatar-frame--celestial .avatar-frame__comet::after {
    top: 50%;
    right: -2%;
    width: max(4px, 16%);
    aspect-ratio: 1;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 2px rgba(254, 240, 138, 0.66),
      0 0 var(--frame-galaxy-star-wide-glow) rgba(255, 255, 255, 0.98);
    transform: translateY(-50%);
  }

  /* 顶部/移动端的小头像只保留紧凑星轨，完整彗星与爆闪留给商店的展示尺寸。 */
  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__motif::after,
  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__comet,
  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__motif::after,
  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__orbit::before,
  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__comet {
    display: none;
  }

  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__ring::before {
    inset: -6%;
    opacity: 0.46;
  }

  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__ring::after {
    inset: -2%;
  }

  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__orbit,
  .avatar-frame--dragon.avatar-frame--compact .avatar-frame__orbit,
  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__orbit {
    inset: -4%;
  }

  .avatar-frame--celestial.avatar-frame--compact .avatar-frame__orbit {
    transform: rotate(18deg) scaleY(0.88);
    animation-name: frame-celestial-compact-orbit;
  }

  .avatar-frame--galaxy.avatar-frame--compact .avatar-frame__orbit::after {
    width: max(2px, 8%);
    box-shadow:
      0 0 0 1px rgba(219, 234, 254, 0.62),
      0 0 var(--frame-galaxy-orbit-glow) rgba(129, 140, 248, 0.74);
  }

  @keyframes frame-gold-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-gold-glint {
    0%,
    28%,
    100% {
      opacity: 0.12;
      transform: translateX(-24%);
    }
    52% {
      opacity: 0.86;
      transform: translateX(22%);
    }
  }

  @keyframes frame-sakura-float {
    0%,
    100% {
      opacity: 0.72;
      transform: rotate(-5deg) scale(0.95);
    }
    50% {
      opacity: 1;
      transform: rotate(6deg) scale(1.04);
    }
  }

  @keyframes frame-neon-pulse {
    0%,
    100% {
      filter: brightness(0.95) saturate(1);
      transform: scale(0.98);
    }
    50% {
      filter: brightness(1.25) saturate(1.25);
      transform: scale(1.02);
    }
  }

  @keyframes frame-neon-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-sunset-glow {
    0%,
    100% {
      opacity: 0.3;
      transform: rotate(-8deg);
    }
    50% {
      opacity: 0.9;
      transform: rotate(7deg);
    }
  }

  @keyframes frame-ocean-float {
    0%,
    100% {
      opacity: 0.58;
      transform: translateY(2%);
    }
    50% {
      opacity: 1;
      transform: translateY(-2%);
    }
  }

  @keyframes frame-aurora-turn {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-aurora-wave {
    0%,
    100% {
      opacity: 0.56;
      transform: rotate(0) scale(0.98);
    }
    50% {
      opacity: 1;
      transform: rotate(18deg) scale(1.04);
    }
  }

  @keyframes frame-galaxy-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-galaxy-twinkle {
    0%,
    100% {
      opacity: 0.38;
      transform: scale(0.94);
    }
    50% {
      opacity: 1;
      transform: scale(1.08);
    }
  }

  @keyframes frame-galaxy-starburst {
    0%,
    32%,
    100% {
      opacity: 0;
      transform: scale(0.42) rotate(12deg);
    }
    45% {
      opacity: 1;
      transform: scale(1.18) rotate(12deg);
    }
    58% {
      opacity: 0;
      transform: scale(1.45) rotate(12deg);
    }
  }

  @keyframes frame-galaxy-orbit {
    to {
      transform: rotate(336deg);
    }
  }

  @keyframes frame-galaxy-comet {
    0%,
    54%,
    100% {
      opacity: 0;
      transform: translate(-24%, 18%) rotate(-28deg) scaleX(0.5);
    }
    64% {
      opacity: 1;
      transform: translate(0, 0) rotate(-28deg) scaleX(1);
    }
    76% {
      opacity: 0;
      transform: translate(22%, -18%) rotate(-28deg) scaleX(1.15);
    }
  }

  @keyframes frame-flame-pulse {
    0%,
    100% {
      filter: brightness(0.96);
      transform: scale(0.98);
    }
    50% {
      filter: brightness(1.2) saturate(1.16);
      transform: scale(1.025);
    }
  }

  @keyframes frame-flame-dance {
    0%,
    100% {
      opacity: 0.66;
      transform: rotate(-3deg) scale(0.98);
    }
    50% {
      opacity: 1;
      transform: rotate(4deg) scale(1.04);
    }
  }

  @keyframes frame-dragon-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-dragon-orbit {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-celestial-turn {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes frame-celestial-corona {
    to {
      transform: rotate(-360deg);
    }
  }

  @keyframes frame-celestial-eclipse-pulse {
    0%,
    100% {
      opacity: 0.58;
      transform: scale(0.97);
    }
    50% {
      opacity: 1;
      transform: scale(1.06);
    }
  }

  @keyframes frame-celestial-twinkle {
    0%,
    100% {
      opacity: 0.42;
      transform: scale(0.95);
    }
    50% {
      opacity: 1;
      transform: scale(1.06);
    }
  }

  @keyframes frame-celestial-moon {
    0%,
    100% {
      opacity: 0.58;
      transform: translate(-5%, 4%) scale(0.9);
    }
    50% {
      opacity: 1;
      transform: translate(7%, -5%) scale(1.08);
    }
  }

  @keyframes frame-celestial-starburst {
    0%,
    30%,
    100% {
      opacity: 0.22;
      transform: rotate(0) scale(0.68);
    }
    48% {
      opacity: 1;
      transform: rotate(22deg) scale(1.18);
    }
    64% {
      opacity: 0.42;
      transform: rotate(34deg) scale(0.88);
    }
  }

  @keyframes frame-celestial-orbit {
    to {
      transform: rotate(378deg) scaleY(0.72);
    }
  }

  @keyframes frame-celestial-compact-orbit {
    to {
      transform: rotate(378deg) scaleY(0.88);
    }
  }

  @keyframes frame-celestial-counter-orbit {
    to {
      transform: rotate(-292deg) scaleY(0.66);
    }
  }

  @keyframes frame-celestial-comet {
    0%,
    42%,
    100% {
      opacity: 0;
      transform: translate(-34%, 24%) rotate(-34deg) scaleX(0.38);
    }
    54% {
      opacity: 1;
      transform: translate(0, 0) rotate(-34deg) scaleX(1);
    }
    70% {
      opacity: 0;
      transform: translate(34%, -25%) rotate(-34deg) scaleX(1.28);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-frame__ring,
    .avatar-frame__ring::before,
    .avatar-frame__ring::after,
    .avatar-frame__motif,
    .avatar-frame__motif::before,
    .avatar-frame__motif::after,
    .avatar-frame__orbit,
    .avatar-frame__orbit::before,
    .avatar-frame__orbit::after,
    .avatar-frame__comet,
    .avatar-frame__comet::before,
    .avatar-frame__comet::after {
      animation: none !important;
    }
  }
</style>
