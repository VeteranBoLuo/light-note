<template>
  <div
    ref="frameElement"
    class="avatar-frame"
    :class="[
      `avatar-frame--${variant || 'default'}`,
      artwork ? `avatar-frame--motion-${artwork.motion}` : '',
      {
        'avatar-frame--dynamic': isDynamic,
        'avatar-frame--motion-paused': isMotionPaused,
        'avatar-frame--profile-chat': props.motionProfile === 'chat',
        'avatar-frame--layout-slot': props.layoutMode === 'slot',
      },
    ]"
    :style="frameStyle"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="avatar-frame__portrait">
      <SvgIcon :src="src" :size="displayAvatarSize" />
    </span>
    <span class="avatar-frame__canvas">
      <span
        v-if="artwork && variant === 'sunset'"
        class="avatar-frame__sunset-orbit"
        aria-hidden="true"
      ></span>
      <img
        v-if="artwork && !usesFrontStructuralShell"
        class="avatar-frame__art"
        :src="artwork.src"
        alt=""
        draggable="false"
        aria-hidden="true"
      />
      <img
        v-if="hasArtDetail && !usesFrontStructuralShell"
        class="avatar-frame__art-detail"
        :src="artwork?.src"
        alt=""
        draggable="false"
        aria-hidden="true"
      />
      <span
        v-if="artwork && !usesDedicatedInnerRing && !usesFrontStructuralShell"
        class="avatar-frame__inner-ring"
        aria-hidden="true"
      >
        <img class="avatar-frame__art-inner" :src="artwork.src" alt="" draggable="false" />
      </span>
      <span v-if="isDynamic" class="avatar-frame__motion avatar-frame__motion--back" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </span>
    </span>
    <span class="avatar-frame__canvas avatar-frame__canvas--front" aria-hidden="true">
      <template v-if="variant === 'celestial' && artwork?.motionSrc && artwork?.effectSrc">
        <img
          class="avatar-frame__wing-layer avatar-frame__wing-layer--left"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__wing-layer avatar-frame__wing-layer--right"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
      </template>
      <template
        v-if="variant === 'streak-eternal' && artwork?.motionSrc && artwork?.effectSrc && artwork?.trailSrc"
      >
        <img
          class="avatar-frame__wing-layer avatar-frame__wing-layer--spring"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__wing-layer avatar-frame__wing-layer--autumn"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__wing-layer avatar-frame__wing-layer--winter"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
        />
      </template>
      <img
        v-if="artwork && usesFrontStructuralShell"
        class="avatar-frame__art avatar-frame__art--front-shell"
        :src="artwork.src"
        alt=""
        draggable="false"
      />
      <img
        v-if="hasArtDetail && usesFrontStructuralShell"
        class="avatar-frame__art-detail"
        :src="artwork?.src"
        alt=""
        draggable="false"
      />
      <template v-if="variant === 'bookmark-archive' && artwork">
        <img
          class="avatar-frame__bookmark-current avatar-frame__bookmark-current--left"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__bookmark-current avatar-frame__bookmark-current--right"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__bookmark-booklight"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <span class="avatar-frame__bookmark-event">
          <i class="avatar-frame__bookmark-page avatar-frame__bookmark-page--one"></i>
          <i class="avatar-frame__bookmark-page avatar-frame__bookmark-page--two"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--one"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--two"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--three"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--four"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--five"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--six"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--seven"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--eight"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--nine"></i>
          <i class="avatar-frame__bookmark-glyph avatar-frame__bookmark-glyph--ten"></i>
          <i class="avatar-frame__bookmark-gem avatar-frame__bookmark-gem--top"></i>
          <i class="avatar-frame__bookmark-gem avatar-frame__bookmark-gem--bottom"></i>
        </span>
      </template>
      <template v-if="variant === 'note-constellation' && artwork">
        <img
          class="avatar-frame__constellation-ink avatar-frame__constellation-ink--left"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__constellation-ink avatar-frame__constellation-ink--right"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <span class="avatar-frame__constellation-star-route">
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--one"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--two"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--three"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--four"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--five"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--six"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--seven"></i>
          <i class="avatar-frame__constellation-link avatar-frame__constellation-link--eight"></i>
          <i class="avatar-frame__constellation-pulse avatar-frame__constellation-pulse--top"></i>
          <i class="avatar-frame__constellation-pulse avatar-frame__constellation-pulse--right"></i>
          <i class="avatar-frame__constellation-pulse avatar-frame__constellation-pulse--bottom"></i>
          <i class="avatar-frame__constellation-pulse avatar-frame__constellation-pulse--left"></i>
          <i class="avatar-frame__constellation-pulse avatar-frame__constellation-pulse--upper-left"></i>
        </span>
        <span class="avatar-frame__constellation-pen"></span>
      </template>
      <template v-if="variant === 'file-constellation' && artwork">
        <img
          class="avatar-frame__cloudvault-current avatar-frame__cloudvault-current--left"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__cloudvault-current avatar-frame__cloudvault-current--right"
          :src="artwork.src"
          alt=""
          draggable="false"
        />
        <span class="avatar-frame__cloudvault-event">
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--one"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--two"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--three"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--four"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--five"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--six"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--seven"></i>
          <i class="avatar-frame__cloudvault-file avatar-frame__cloudvault-file--eight"></i>
          <i class="avatar-frame__cloudvault-gate avatar-frame__cloudvault-gate--top"></i>
          <i class="avatar-frame__cloudvault-gate avatar-frame__cloudvault-gate--bottom"></i>
          <i class="avatar-frame__cloudvault-window avatar-frame__cloudvault-window--one"></i>
          <i class="avatar-frame__cloudvault-window avatar-frame__cloudvault-window--two"></i>
          <i class="avatar-frame__cloudvault-window avatar-frame__cloudvault-window--three"></i>
        </span>
      </template>
      <template v-if="variant === 'ocean' && artwork?.motionSrc && artwork?.effectSrc">
        <img
          class="avatar-frame__ocean-current avatar-frame__ocean-current--surge"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__ocean-current avatar-frame__ocean-current--crest"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__ocean-current avatar-frame__ocean-current--return"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
      </template>
      <template
        v-if="variant === 'aurora' && artwork?.motionSrc && artwork?.effectSrc && artwork?.accentSrc"
      >
        <img
          class="avatar-frame__aurora-flow avatar-frame__aurora-flow--left"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__aurora-flow avatar-frame__aurora-flow--right"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__aurora-crystal avatar-frame__aurora-crystal--top"
          :src="artwork.accentSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__aurora-crystal avatar-frame__aurora-crystal--bottom"
          :src="artwork.accentSrc"
          alt=""
          draggable="false"
        />
      </template>
      <template v-if="variant === 'flame' && artwork?.effectSrc">
        <img
          v-for="layer in ['warm', 'hot']"
          :key="layer"
          :class="['avatar-frame__art-detail', 'avatar-frame__flame-fire', `avatar-frame__flame-fire--${layer}`]"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
      </template>
      <img
        v-if="hasArtFocus && variant !== 'sakura'"
        class="avatar-frame__art-focus"
        :src="variant === 'gold' && artwork?.accentSrc ? artwork.accentSrc : artwork?.src"
        alt=""
        draggable="false"
      />
      <template v-if="variant === 'sakura'">
        <img
          class="avatar-frame__art-focus avatar-frame__art-focus--sakura-top"
          :src="artwork?.src"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__art-focus avatar-frame__art-focus--sakura-bottom"
          :src="artwork?.src"
          alt=""
          draggable="false"
        />
      </template>
      <template v-if="variant === 'sunset' && artwork?.motionSrc">
        <img
          class="avatar-frame__sunset-cloud avatar-frame__sunset-cloud--left"
          :src="artwork.motionSrc"
          alt=""
          draggable="false"
        />
        <img
          class="avatar-frame__sunset-cloud avatar-frame__sunset-cloud--right"
          :src="artwork.effectSrc"
          alt=""
          draggable="false"
        />
      </template>
      <img
        v-if="variant === 'flame' && artwork?.trailSrc"
        class="avatar-frame__flame-embers"
        :src="artwork.trailSrc"
        alt=""
        draggable="false"
        aria-hidden="true"
      />
      <template v-if="variant === 'dragon' && artwork?.trailSrc">
        <img
          v-for="layer in ['tail', 'body', 'mane']"
          :key="layer"
          :class="['avatar-frame__dragon-trail', `avatar-frame__dragon-trail--${layer}`]"
          :src="artwork.trailSrc"
          alt=""
          draggable="false"
          aria-hidden="true"
        />
      </template>
      <span v-if="variant === 'dragon'" class="avatar-frame__dragon-orbit-particles" aria-hidden="true">
        <i
          v-for="particle in dragonOrbitParticles"
          :key="particle.id"
          :style="particle.style"
        ></i>
      </span>
      <span v-if="variant === 'dragon'" class="avatar-frame__dragon-particles" aria-hidden="true">
        <i
          v-for="particle in dragonParticles"
          :key="particle.id"
          :style="particle.style"
        ></i>
      </span>
      <img
        v-for="spark in variant === 'flame' ? flameSparks : []"
        :key="spark.id"
        :class="[
          'avatar-frame__flame-particle',
          'avatar-frame__flame-spark',
          spark.id === 'left-tip' || spark.id === 'right-tip' ? 'avatar-frame__scroll-core' : '',
          spark.id.startsWith('outer-') ? 'avatar-frame__flame-spark--outer' : '',
        ]"
        :src="artwork?.particleSrcs?.[spark.sprite]"
        :style="spark.style"
        alt=""
        draggable="false"
        aria-hidden="true"
      />
      <span v-if="variant === 'celestial'" class="avatar-frame__celestial-dust" aria-hidden="true">
        <i v-for="dust in celestialDustMotes" :key="dust.id" :style="dust.style"></i>
      </span>
      <span v-if="variant === 'streak-eternal'" class="avatar-frame__eternal-motes" aria-hidden="true">
        <i
          v-for="mote in eternalSeasonMotes"
          :key="mote.id"
          :class="`avatar-frame__eternal-mote--${mote.kind}`"
          :style="mote.style"
        ></i>
      </span>
      <span v-if="isDynamic" class="avatar-frame__motion avatar-frame__motion--front">
        <i></i><i></i><i></i><i></i>
      </span>
    </span>
    <span v-if="artwork" class="avatar-frame__bezel" aria-hidden="true"></span>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { avatarFrameArtwork } from '@/config/avatarFrameArtwork';
  import { frameVariant } from '@/config/growthFrames';

  // 装饰统一在 64px 设计画布中缩放；头像本体独立按请求像素渲染，避免小尺寸二次缩放失焦。
  const FRAME_DESIGN_AVATAR_SIZE = 64;
  const FRAME_DESIGN_RIM = 6;
  const FRAME_DESIGN_OUTER_SIZE = FRAME_DESIGN_AVATAR_SIZE + FRAME_DESIGN_RIM * 2;

  // 小火苗从原画火缘匀速上升，抵达后原地缓慢消散；错峰播放保证始终有火而不会整组抽动。
  const flameSparks = [
    { id: 'left-tip', sprite: 2, style: { '--flame-root-x': '18px', '--flame-root-y': '18px', '--flame-width': '3.8px', '--flame-duration': '4.8s', '--flame-delay': '-2.6s', '--flame-angle': '-11deg', '--flame-rise': '15px' } },
    { id: 'left-crown', sprite: 2, style: { '--flame-root-x': '15px', '--flame-root-y': '27px', '--flame-width': '4.2px', '--flame-duration': '4.6s', '--flame-delay': '-0.8s', '--flame-angle': '-10deg', '--flame-rise': '16px' } },
    { id: 'left-upper', sprite: 1, style: { '--flame-root-x': '8px', '--flame-root-y': '39px', '--flame-width': '4.8px', '--flame-duration': '5.3s', '--flame-delay': '-3.6s', '--flame-angle': '-7deg', '--flame-rise': '20px' } },
    { id: 'left-inner', sprite: 2, style: { '--flame-root-x': '16px', '--flame-root-y': '46px', '--flame-width': '4.4px', '--flame-duration': '5.6s', '--flame-delay': '-1.7s', '--flame-angle': '-4deg', '--flame-rise': '18px' } },
    { id: 'left-mid', sprite: 2, style: { '--flame-root-x': '5px', '--flame-root-y': '53px', '--flame-width': '4.2px', '--flame-duration': '4.9s', '--flame-delay': '-2.2s', '--flame-angle': '-5deg', '--flame-rise': '17px' } },
    { id: 'left-low', sprite: 0, style: { '--flame-root-x': '13px', '--flame-root-y': '67px', '--flame-width': '5.2px', '--flame-duration': '5.5s', '--flame-delay': '-4.4s', '--flame-angle': '-8deg', '--flame-rise': '22px' } },
    { id: 'left-low-inner', sprite: 1, style: { '--flame-root-x': '21px', '--flame-root-y': '71px', '--flame-width': '4.5px', '--flame-duration': '5.1s', '--flame-delay': '-0.2s', '--flame-angle': '-5deg', '--flame-rise': '19px' } },
    { id: 'lower-left', sprite: 2, style: { '--flame-root-x': '28px', '--flame-root-y': '75px', '--flame-width': '4.4px', '--flame-duration': '5.2s', '--flame-delay': '-1.5s', '--flame-angle': '-3deg', '--flame-rise': '18px' } },
    { id: 'lower-center', sprite: 1, style: { '--flame-root-x': '38px', '--flame-root-y': '77px', '--flame-width': '4.8px', '--flame-duration': '5.7s', '--flame-delay': '-3.1s', '--flame-angle': '0deg', '--flame-rise': '23px' } },
    { id: 'lower-right', sprite: 2, style: { '--flame-root-x': '48px', '--flame-root-y': '75px', '--flame-width': '4.4px', '--flame-duration': '4.9s', '--flame-delay': '-0.7s', '--flame-angle': '3deg', '--flame-rise': '18px' } },
    { id: 'right-low-inner', sprite: 1, style: { '--flame-root-x': '55px', '--flame-root-y': '71px', '--flame-width': '4.5px', '--flame-duration': '5.4s', '--flame-delay': '-3.8s', '--flame-angle': '5deg', '--flame-rise': '19px' } },
    { id: 'right-low', sprite: 0, style: { '--flame-root-x': '64px', '--flame-root-y': '67px', '--flame-width': '5.2px', '--flame-duration': '5.4s', '--flame-delay': '-2.8s', '--flame-angle': '8deg', '--flame-rise': '22px' } },
    { id: 'right-mid', sprite: 2, style: { '--flame-root-x': '71px', '--flame-root-y': '53px', '--flame-width': '4.2px', '--flame-duration': '5s', '--flame-delay': '-4.1s', '--flame-angle': '5deg', '--flame-rise': '17px' } },
    { id: 'right-inner', sprite: 2, style: { '--flame-root-x': '60px', '--flame-root-y': '46px', '--flame-width': '4.4px', '--flame-duration': '5.8s', '--flame-delay': '-2.4s', '--flame-angle': '4deg', '--flame-rise': '18px' } },
    { id: 'right-upper', sprite: 1, style: { '--flame-root-x': '68px', '--flame-root-y': '39px', '--flame-width': '4.8px', '--flame-duration': '5.6s', '--flame-delay': '-1.9s', '--flame-angle': '7deg', '--flame-rise': '20px' } },
    { id: 'right-crown', sprite: 2, style: { '--flame-root-x': '61px', '--flame-root-y': '27px', '--flame-width': '4.2px', '--flame-duration': '4.7s', '--flame-delay': '-3.4s', '--flame-angle': '10deg', '--flame-rise': '16px' } },
    { id: 'right-tip', sprite: 2, style: { '--flame-root-x': '58px', '--flame-root-y': '18px', '--flame-width': '3.8px', '--flame-duration': '5.1s', '--flame-delay': '-1.1s', '--flame-angle': '11deg', '--flame-rise': '15px' } },
    { id: 'outer-left-crown', sprite: 1, style: { '--flame-root-x': '17px', '--flame-root-y': '10px', '--flame-width': '5.6px', '--flame-duration': '5.8s', '--flame-delay': '-4.8s', '--flame-angle': '-12deg', '--flame-rise': '24px' } },
    { id: 'outer-left-upper', sprite: 0, style: { '--flame-root-x': '-3px', '--flame-root-y': '31px', '--flame-width': '6.3px', '--flame-duration': '6.1s', '--flame-delay': '-2.1s', '--flame-angle': '-10deg', '--flame-rise': '27px' } },
    { id: 'outer-left-mid', sprite: 1, style: { '--flame-root-x': '-9px', '--flame-root-y': '49px', '--flame-width': '7px', '--flame-duration': '5.7s', '--flame-delay': '-5.1s', '--flame-angle': '-8deg', '--flame-rise': '29px' } },
    { id: 'outer-left-low', sprite: 0, style: { '--flame-root-x': '-2px', '--flame-root-y': '68px', '--flame-width': '7.4px', '--flame-duration': '6.3s', '--flame-delay': '-3.3s', '--flame-angle': '-7deg', '--flame-rise': '30px' } },
    { id: 'outer-bottom-left', sprite: 1, style: { '--flame-root-x': '18px', '--flame-root-y': '87px', '--flame-width': '6.2px', '--flame-duration': '5.9s', '--flame-delay': '-1.2s', '--flame-angle': '-4deg', '--flame-rise': '26px' } },
    { id: 'outer-bottom-center', sprite: 0, style: { '--flame-root-x': '38px', '--flame-root-y': '93px', '--flame-width': '7.2px', '--flame-duration': '6.4s', '--flame-delay': '-4.2s', '--flame-angle': '0deg', '--flame-rise': '32px' } },
    { id: 'outer-bottom-right', sprite: 1, style: { '--flame-root-x': '58px', '--flame-root-y': '87px', '--flame-width': '6.2px', '--flame-duration': '5.6s', '--flame-delay': '-2.9s', '--flame-angle': '4deg', '--flame-rise': '26px' } },
    { id: 'outer-right-low', sprite: 0, style: { '--flame-root-x': '78px', '--flame-root-y': '68px', '--flame-width': '7.4px', '--flame-duration': '6.2s', '--flame-delay': '-0.6s', '--flame-angle': '7deg', '--flame-rise': '30px' } },
    { id: 'outer-right-mid', sprite: 1, style: { '--flame-root-x': '85px', '--flame-root-y': '49px', '--flame-width': '7px', '--flame-duration': '5.8s', '--flame-delay': '-3.9s', '--flame-angle': '8deg', '--flame-rise': '29px' } },
    { id: 'outer-right-upper', sprite: 0, style: { '--flame-root-x': '79px', '--flame-root-y': '31px', '--flame-width': '6.3px', '--flame-duration': '6s', '--flame-delay': '-1.7s', '--flame-angle': '10deg', '--flame-rise': '27px' } },
    { id: 'outer-right-crown', sprite: 1, style: { '--flame-root-x': '59px', '--flame-root-y': '10px', '--flame-width': '5.6px', '--flame-duration': '5.5s', '--flame-delay': '-3s', '--flame-angle': '12deg', '--flame-rise': '24px' } },
  ] as const;

  // 龙曜粒子独立于结构图层，沿外缘错峰逸散；用数量与路径丰富度表达传说感，不再拉高龙身亮度。
  const dragonParticles = [
    { id: 'left-low', style: { '--dragon-particle-x': '-3px', '--dragon-particle-y': '58px', '--dragon-particle-dx': '-8px', '--dragon-particle-dy': '-21px', '--dragon-particle-size': '3.6px', '--dragon-particle-duration': '3.7s', '--dragon-particle-delay': '-0.4s' } },
    { id: 'left-mid', style: { '--dragon-particle-x': '1px', '--dragon-particle-y': '40px', '--dragon-particle-dx': '-7px', '--dragon-particle-dy': '-25px', '--dragon-particle-size': '2.8px', '--dragon-particle-duration': '4.1s', '--dragon-particle-delay': '-2.3s' } },
    { id: 'left-high', style: { '--dragon-particle-x': '10px', '--dragon-particle-y': '20px', '--dragon-particle-dx': '-5px', '--dragon-particle-dy': '-18px', '--dragon-particle-size': '3.2px', '--dragon-particle-duration': '3.4s', '--dragon-particle-delay': '-1.2s' } },
    { id: 'left-tail', style: { '--dragon-particle-x': '16px', '--dragon-particle-y': '69px', '--dragon-particle-dx': '-4px', '--dragon-particle-dy': '-23px', '--dragon-particle-size': '2.5px', '--dragon-particle-duration': '4.4s', '--dragon-particle-delay': '-3.1s' } },
    { id: 'bottom-left', style: { '--dragon-particle-x': '28px', '--dragon-particle-y': '79px', '--dragon-particle-dx': '-5px', '--dragon-particle-dy': '-19px', '--dragon-particle-size': '3px', '--dragon-particle-duration': '3.8s', '--dragon-particle-delay': '-1.8s' } },
    { id: 'bottom-right', style: { '--dragon-particle-x': '47px', '--dragon-particle-y': '80px', '--dragon-particle-dx': '5px', '--dragon-particle-dy': '-22px', '--dragon-particle-size': '3.4px', '--dragon-particle-duration': '4.2s', '--dragon-particle-delay': '-0.9s' } },
    { id: 'right-low', style: { '--dragon-particle-x': '72px', '--dragon-particle-y': '65px', '--dragon-particle-dx': '7px', '--dragon-particle-dy': '-20px', '--dragon-particle-size': '2.7px', '--dragon-particle-duration': '3.5s', '--dragon-particle-delay': '-2.7s' } },
    { id: 'right-mid', style: { '--dragon-particle-x': '80px', '--dragon-particle-y': '48px', '--dragon-particle-dx': '9px', '--dragon-particle-dy': '-27px', '--dragon-particle-size': '3.5px', '--dragon-particle-duration': '4s', '--dragon-particle-delay': '-1.5s' } },
    { id: 'right-high', style: { '--dragon-particle-x': '73px', '--dragon-particle-y': '27px', '--dragon-particle-dx': '7px', '--dragon-particle-dy': '-21px', '--dragon-particle-size': '2.6px', '--dragon-particle-duration': '3.6s', '--dragon-particle-delay': '-3.3s' } },
    { id: 'mane-high', style: { '--dragon-particle-x': '62px', '--dragon-particle-y': '8px', '--dragon-particle-dx': '6px', '--dragon-particle-dy': '-18px', '--dragon-particle-size': '3.1px', '--dragon-particle-duration': '3.9s', '--dragon-particle-delay': '-0.7s' } },
    { id: 'crown-left', style: { '--dragon-particle-x': '29px', '--dragon-particle-y': '1px', '--dragon-particle-dx': '-4px', '--dragon-particle-dy': '-15px', '--dragon-particle-size': '2.4px', '--dragon-particle-duration': '4.3s', '--dragon-particle-delay': '-2s' } },
    { id: 'crown-right', style: { '--dragon-particle-x': '48px', '--dragon-particle-y': '-2px', '--dragon-particle-dx': '4px', '--dragon-particle-dy': '-17px', '--dragon-particle-size': '2.9px', '--dragon-particle-duration': '3.3s', '--dragon-particle-delay': '-2.9s' } },
    { id: 'left-outward', style: { '--dragon-particle-x': '-5px', '--dragon-particle-y': '33px', '--dragon-particle-dx': '-15px', '--dragon-particle-dy': '2px', '--dragon-particle-size': '1.9px', '--dragon-particle-duration': '4.6s', '--dragon-particle-delay': '-3.7s' } },
    { id: 'right-outward', style: { '--dragon-particle-x': '81px', '--dragon-particle-y': '37px', '--dragon-particle-dx': '14px', '--dragon-particle-dy': '4px', '--dragon-particle-size': '2.1px', '--dragon-particle-duration': '4.5s', '--dragon-particle-delay': '-0.2s' } },
    { id: 'top-left-outward', style: { '--dragon-particle-x': '17px', '--dragon-particle-y': '9px', '--dragon-particle-dx': '-11px', '--dragon-particle-dy': '-8px', '--dragon-particle-size': '1.8px', '--dragon-particle-duration': '3.6s', '--dragon-particle-delay': '-2.5s' } },
    { id: 'top-right-outward', style: { '--dragon-particle-x': '58px', '--dragon-particle-y': '4px', '--dragon-particle-dx': '12px', '--dragon-particle-dy': '-7px', '--dragon-particle-size': '2.2px', '--dragon-particle-duration': '4.1s', '--dragon-particle-delay': '-1.1s' } },
    { id: 'bottom-center-left', style: { '--dragon-particle-x': '35px', '--dragon-particle-y': '84px', '--dragon-particle-dx': '-10px', '--dragon-particle-dy': '-15px', '--dragon-particle-size': '1.9px', '--dragon-particle-duration': '4.7s', '--dragon-particle-delay': '-3.9s' } },
    { id: 'bottom-center-right', style: { '--dragon-particle-x': '41px', '--dragon-particle-y': '85px', '--dragon-particle-dx': '11px', '--dragon-particle-dy': '-13px', '--dragon-particle-size': '2.3px', '--dragon-particle-duration': '3.5s', '--dragon-particle-delay': '-1.6s' } },
  ] as const;

  // 天穹翼尘:每侧翼梢三颗星屑错峰上浮消散,只做强调,不构成持续粒子场;头像与环体不受影响。
  const celestialDustMotes = [
    { id: 'left-tip', style: { '--dust-x': '-14px', '--dust-y': '10px', '--dust-dx': '-6px', '--dust-size': '2.6px', '--dust-duration': '4.6s', '--dust-delay': '-1.2s' } },
    { id: 'left-mid', style: { '--dust-x': '-6px', '--dust-y': '24px', '--dust-dx': '-5px', '--dust-size': '2.1px', '--dust-duration': '5.3s', '--dust-delay': '-3.1s' } },
    { id: 'left-high', style: { '--dust-x': '0px', '--dust-y': '2px', '--dust-dx': '-4px', '--dust-size': '1.8px', '--dust-duration': '4.9s', '--dust-delay': '-2.2s' } },
    { id: 'right-tip', style: { '--dust-x': '88px', '--dust-y': '10px', '--dust-dx': '6px', '--dust-size': '2.6px', '--dust-duration': '4.8s', '--dust-delay': '-2.6s' } },
    { id: 'right-mid', style: { '--dust-x': '80px', '--dust-y': '24px', '--dust-dx': '5px', '--dust-size': '2.1px', '--dust-duration': '5.1s', '--dust-delay': '-0.6s' } },
    { id: 'right-high', style: { '--dust-x': '74px', '--dust-y': '2px', '--dust-dx': '4px', '--dust-size': '1.8px', '--dust-duration': '4.5s', '--dust-delay': '-3.7s' } },
  ] as const;

  // 岁序四季粒子:春樱瓣、夏流萤、秋枫叶、冬雪花各三颗,分布在对应季节区外缘错峰循环;
  // 下落类带旋转与横向飘移,上浮类带微光,均只做强调,不遮头像、不进环内。
  const eternalSeasonMotes = [
    { id: 'petal-a', kind: 'petal', style: { '--mote-x': '-6px', '--mote-y': '6px', '--mote-dx': '10px', '--mote-dy': '30px', '--mote-spin': '150deg', '--mote-duration': '6.2s', '--mote-delay': '-1.4s' } },
    { id: 'petal-b', kind: 'petal', style: { '--mote-x': '6px', '--mote-y': '-2px', '--mote-dx': '14px', '--mote-dy': '34px', '--mote-spin': '-120deg', '--mote-duration': '7.1s', '--mote-delay': '-4.2s' } },
    { id: 'petal-c', kind: 'petal', style: { '--mote-x': '-16px', '--mote-y': '22px', '--mote-dx': '8px', '--mote-dy': '26px', '--mote-spin': '110deg', '--mote-duration': '5.6s', '--mote-delay': '-2.8s' } },
    { id: 'firefly-a', kind: 'firefly', style: { '--mote-x': '-12px', '--mote-y': '64px', '--mote-dx': '-4px', '--mote-dy': '-22px', '--mote-duration': '5.4s', '--mote-delay': '-0.8s' } },
    { id: 'firefly-b', kind: 'firefly', style: { '--mote-x': '2px', '--mote-y': '76px', '--mote-dx': '5px', '--mote-dy': '-26px', '--mote-duration': '6.4s', '--mote-delay': '-3.6s' } },
    { id: 'firefly-c', kind: 'firefly', style: { '--mote-x': '-4px', '--mote-y': '86px', '--mote-dx': '-3px', '--mote-dy': '-18px', '--mote-duration': '5.8s', '--mote-delay': '-2.1s' } },
    { id: 'leaf-a', kind: 'leaf', style: { '--mote-x': '74px', '--mote-y': '2px', '--mote-dx': '-12px', '--mote-dy': '32px', '--mote-spin': '-160deg', '--mote-duration': '6.6s', '--mote-delay': '-2.4s' } },
    { id: 'leaf-b', kind: 'leaf', style: { '--mote-x': '88px', '--mote-y': '14px', '--mote-dx': '-16px', '--mote-dy': '38px', '--mote-spin': '130deg', '--mote-duration': '7.4s', '--mote-delay': '-5.1s' } },
    { id: 'leaf-c', kind: 'leaf', style: { '--mote-x': '68px', '--mote-y': '-6px', '--mote-dx': '-10px', '--mote-dy': '28px', '--mote-spin': '-110deg', '--mote-duration': '5.9s', '--mote-delay': '-0.6s' } },
    { id: 'snow-a', kind: 'snow', style: { '--mote-x': '86px', '--mote-y': '48px', '--mote-dx': '-6px', '--mote-dy': '24px', '--mote-spin': '40deg', '--mote-duration': '7.2s', '--mote-delay': '-1.9s' } },
    { id: 'snow-b', kind: 'snow', style: { '--mote-x': '74px', '--mote-y': '62px', '--mote-dx': '-8px', '--mote-dy': '20px', '--mote-spin': '-30deg', '--mote-duration': '6.1s', '--mote-delay': '-4.6s' } },
    { id: 'snow-c', kind: 'snow', style: { '--mote-x': '92px', '--mote-y': '70px', '--mote-dx': '-4px', '--mote-dy': '28px', '--mote-spin': '50deg', '--mote-duration': '8s', '--mote-delay': '-3.2s' } },
  ] as const;

  // 四枚内圈龙气共用等距闭环，通过尺寸与负延迟形成前后层次；轨迹、速度和首尾步长完全一致。
  const dragonOrbitParticles = [
    { id: 'large', style: { '--dragon-orbit-size': '5.2px', '--dragon-orbit-delay': '0s' } },
    { id: 'medium', style: { '--dragon-orbit-size': '4px', '--dragon-orbit-delay': '-1.8s' } },
    { id: 'small', style: { '--dragon-orbit-size': '3.1px', '--dragon-orbit-delay': '-3.6s' } },
    { id: 'tiny', style: { '--dragon-orbit-size': '2.3px', '--dragon-orbit-delay': '-5.4s' } },
  ] as const;

  const props = withDefaults(
    defineProps<{
      frameId?: string | null;
      src: string;
      size?: number;
      layoutMode?: 'outer' | 'slot';
      decorative?: boolean;
      animated?: boolean;
      pauseWhenOffscreen?: boolean;
      motionProfile?: 'full' | 'chat';
    }>(),
    {
      frameId: null,
      size: 60,
      layoutMode: 'outer',
      decorative: true,
      animated: true,
      pauseWhenOffscreen: false,
      motionProfile: 'full',
    },
  );

  const frameElement = ref<HTMLElement | null>(null);
  const isMotionVisible = ref(!props.pauseWhenOffscreen);
  const isMotionPaused = computed(() => !props.animated || (props.pauseWhenOffscreen && !isMotionVisible.value));
  let visibilityObserver: IntersectionObserver | null = null;

  onMounted(() => {
    if (!props.pauseWhenOffscreen || typeof IntersectionObserver === 'undefined' || !frameElement.value) return;
    const scrollContainer = frameElement.value.closest('.community-message-list');
    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isMotionVisible.value = Boolean(entry?.isIntersecting);
      },
      {
        root: scrollContainer,
        rootMargin: '24px 0px',
        threshold: 0.01,
      },
    );
    visibilityObserver.observe(frameElement.value);
  });

  onBeforeUnmount(() => {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
  });

  const variant = computed(() => frameVariant(props.frameId));
  const artwork = computed(() => avatarFrameArtwork(variant.value));
  const isDynamic = computed(() => artwork.value?.motion !== undefined && artwork.value.motion !== 'static');
  // 完整透明中心的静态成品框属于实体结构：统一置于固定头像上方，后层画布只保留环境光。
  // 不能仅提高后层图片自身的 z-index，因为父级 canvas 的层叠上下文仍会被头像整体压住。
  const usesFrontStructuralShell = computed(
    () => artwork.value?.motion === 'static' || artwork.value?.foregroundShell === true,
  );
  const hasArtDetail = computed(() =>
    Boolean(
      artwork.value?.motion !== 'static' &&
      variant.value &&
      [
        'gold',
        'sakura',
        'streak-month',
        'note-masterpiece',
        'file-vault',
        'bookmark-corridor',
        'neon',
        'galaxy',
        'dragon',
        'bookmark-archive',
        'note-constellation',
        'file-constellation',
        'streak-eternal',
      ].includes(variant.value),
    ),
  );
  // 只有确实跨入头像孔的身份主体或吊坠才保留前景焦点；普通框体统一由窄内沿层贴合头像，避免遮住头像内容。
  const hasArtFocus = computed(() => ['gold', 'sakura', 'sunset'].includes(variant.value || ''));
  // 七日晨光参考稿与八款传说绿幕原型的底图都自带完整内圈,孔径标定为略小于头像;
  // 再复制一条同源内沿只会重复绘制同像素,因此这些款不渲染独立内沿层。
  const usesDedicatedInnerRing = computed(() =>
    [
      'streak-seed',
      'gold',
      'sakura',
      'sunset',
      'neon',
      'galaxy',
      'dragon',
      'celestial',
      'bookmark-archive',
      'note-constellation',
      'file-constellation',
      'streak-eternal',
    ].includes(variant.value || ''),
  );
  const displayAvatarSize = computed(() => Math.max(1, Number(props.size) || 1));
  const frameStyle = computed(() => {
    const scale = displayAvatarSize.value / FRAME_DESIGN_AVATAR_SIZE;
    const layoutOuterSize = artwork.value?.outerSize ?? FRAME_DESIGN_OUTER_SIZE;
    const displayOuterSize = Math.round(layoutOuterSize * scale);
    return {
      '--frame-display-outer-size': `${displayOuterSize}px`,
      '--frame-display-avatar-size': `${displayAvatarSize.value}px`,
      '--frame-canvas-scale': String(scale),
      '--frame-outer-size': `${FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-art-size': `${artwork.value?.artSize ?? FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-inner-art-size': `${artwork.value?.innerArtSize ?? FRAME_DESIGN_OUTER_SIZE}px`,
      '--frame-effect-size': `${layoutOuterSize}px`,
      '--frame-accent': artwork.value?.accent ?? '#cbd5e1',
      '--frame-glow': artwork.value?.glow ?? 'rgba(148, 163, 184, 0.2)',
    };
  });
</script>

<style scoped lang="less">
  .avatar-frame {
    position: relative;
    isolation: isolate;
    display: inline-grid;
    place-items: center;
    width: var(--frame-display-outer-size);
    height: var(--frame-display-outer-size);
    overflow: visible;
    line-height: 0;
    flex: 0 0 auto;
  }

  /*
   * 顶栏、消息列表等紧凑入口由外层提供固定头像槽位。此模式只让组件根节点
   * 填满槽位，完整框体仍以同一中心向外溢出；默认 outer 模式继续为商城、
   * 个人中心等弹性布局预留主题真实外径。
   */
  .avatar-frame--layout-slot {
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }

  .avatar-frame__canvas {
    z-index: 1;
    position: absolute;
    top: 50%;
    left: 50%;
    display: inline-grid;
    place-items: center;
    width: var(--frame-outer-size);
    height: var(--frame-outer-size);
    transform: translate(-50%, -50%) scale(var(--frame-canvas-scale));
    transform-origin: center;
    backface-visibility: hidden;
  }

  .avatar-frame__canvas--front {
    z-index: 4;
  }

  .avatar-frame__art,
  .avatar-frame__art-detail,
  .avatar-frame__inner-ring,
  .avatar-frame__art-inner,
  .avatar-frame__art-focus,
  .avatar-frame__sunset-orbit,
  .avatar-frame__sunset-cloud,
  .avatar-frame__ocean-current,
  .avatar-frame__aurora-flow,
  .avatar-frame__aurora-crystal,
  .avatar-frame__flame-embers,
  .avatar-frame__flame-particle,
  .avatar-frame__wing-layer,
  .avatar-frame__celestial-dust,
  .avatar-frame__eternal-motes,
  .avatar-frame__dragon-trail,
  .avatar-frame__dragon-orbit-particles,
  .avatar-frame__dragon-particles,
  .avatar-frame__bookmark-current,
  .avatar-frame__bookmark-booklight,
  .avatar-frame__bookmark-event,
  .avatar-frame__constellation-ink,
  .avatar-frame__constellation-star-route,
  .avatar-frame__constellation-pen,
  .avatar-frame__cloudvault-current,
  .avatar-frame__cloudvault-event,
  .avatar-frame__motion,
  .avatar-frame__portrait,
  .avatar-frame__bezel {
    position: absolute;
    pointer-events: none;
  }

  .avatar-frame__art {
    z-index: 3;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 2.5px var(--frame-glow));
    user-select: none;
    -webkit-user-drag: none;
  }

  // 只复制需要“素材本体局部运动”的主题区域；裁切后的高光与原画完全同源，避免悬浮贴纸感。
  .avatar-frame__art-detail {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }

  .avatar-frame__art-focus {
    top: 50%;
    left: 50%;
    display: block;
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    user-select: none;
    -webkit-user-drag: none;
  }

  // 外框继续按稀有度使用各自视觉尺寸；普通素材复制一条同源窄内沿，并逐款缩放到 64px 中央开孔。
  // 已经自带完整金属内圈的复合素材（如龙曜）走专属内沿，不能再复制整张素材。
  // 80px 安全窗限制外径，64px 独立头像盖住中心，最终只露出半径 32–40px 的主题材质。
  .avatar-frame__inner-ring {
    z-index: 5;
    top: 50%;
    left: 50%;
    width: 80px;
    height: 80px;
    overflow: hidden;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .avatar-frame__art-inner {
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-inner-art-size);
    height: var(--frame-inner-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    filter: drop-shadow(0 0 1.5px var(--frame-glow));
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__art-focus {
    z-index: 5;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
  }

  .avatar-frame--dynamic .avatar-frame__art,
  .avatar-frame--dynamic .avatar-frame__art-detail,
  .avatar-frame--dynamic .avatar-frame__art-focus,
  .avatar-frame--dynamic .avatar-frame__sunset-cloud,
  .avatar-frame--dynamic .avatar-frame__ocean-current,
  .avatar-frame--dynamic .avatar-frame__aurora-flow,
  .avatar-frame--dynamic .avatar-frame__aurora-crystal,
  .avatar-frame--dynamic .avatar-frame__flame-embers,
  .avatar-frame--dynamic .avatar-frame__flame-particle,
  .avatar-frame--dynamic .avatar-frame__dragon-trail,
  .avatar-frame--dynamic .avatar-frame__dragon-orbit-particles i,
  .avatar-frame--dynamic .avatar-frame__dragon-particles i,
  .avatar-frame--dynamic .avatar-frame__bookmark-current,
  .avatar-frame--dynamic .avatar-frame__bookmark-booklight,
  .avatar-frame--dynamic .avatar-frame__bookmark-event i,
  .avatar-frame--dynamic .avatar-frame__constellation-ink,
  .avatar-frame--dynamic .avatar-frame__constellation-star-route i,
  .avatar-frame--dynamic .avatar-frame__constellation-pen::before,
  .avatar-frame--dynamic .avatar-frame__constellation-pen::after,
  .avatar-frame--dynamic .avatar-frame__cloudvault-current,
  .avatar-frame--dynamic .avatar-frame__cloudvault-event i,
  .avatar-frame--dynamic .avatar-frame__motion::before,
  .avatar-frame--dynamic .avatar-frame__motion::after,
  .avatar-frame--dynamic .avatar-frame__motion i {
    will-change: transform, opacity, filter;
  }

  .avatar-frame__motion {
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .avatar-frame__motion--back {
    z-index: 2;
  }

  .avatar-frame__motion--front {
    z-index: 4;
  }

  .avatar-frame__motion::before,
  .avatar-frame__motion::after,
  .avatar-frame__motion i {
    position: absolute;
    display: block;
    content: '';
    pointer-events: none;
  }

  .avatar-frame__motion i {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--frame-accent);
    box-shadow: 0 0 5px var(--frame-glow);
    opacity: 0;
  }

  .avatar-frame__portrait {
    z-index: 2;
    top: 50%;
    left: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--frame-display-avatar-size);
    height: var(--frame-display-avatar-size);
    overflow: hidden;
    border: 0;
    border-radius: 50%;
    background: var(--background-color);
    box-shadow: none;
    transform: translate(-50%, -50%);
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

  // 头像本体脱离主题缩放画布，始终按调用方给定像素直接渲染；装饰只在头像外缘活动，不能改其尺寸与清晰度。
  .avatar-frame__bezel {
    z-index: 3;
    top: 50%;
    left: 50%;
    width: var(--frame-display-avatar-size);
    height: var(--frame-display-avatar-size);
    border: 1.25px solid var(--frame-accent);
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.58),
      0 0 4px var(--frame-glow);
    opacity: 0.9;
    transform: translate(-50%, -50%);
  }

  .avatar-frame--default .avatar-frame__portrait {
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.42);
  }

  /* 鎏金：稳定原画构图，只让同源金属纹理流光与少量星徽响应；头像和完整框体都不参与位移。 */
  .avatar-frame--gold .avatar-frame__art-detail {
    opacity: 0.1;
    filter: brightness(1.38) saturate(1.08) drop-shadow(0 0 2px rgba(251, 191, 36, 0.62));
    -webkit-mask-image: linear-gradient(116deg, transparent 34%, #000 44%, #000 55%, transparent 66%);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 250% 250%;
    -webkit-mask-position: 135% 130%;
    mask-image: linear-gradient(116deg, transparent 34%, #000 44%, #000 55%, transparent 66%);
    mask-repeat: no-repeat;
    mask-size: 250% 250%;
    mask-position: 135% 130%;
    animation: frame-gold-material-flow 2.4s linear infinite;
  }

  // 鎏金宝石从同风格金属稿中独立提取为透明像素层，避免复制背后的内环，同时保留原画质感。
  .avatar-frame--gold .avatar-frame__art-focus {
    opacity: 1;
    clip-path: none;
    // 宝石整体轻微上移并放大，只用于盖住底稿顶部单边描线；仍与原框共用固定中心，不新增独立图形。
    transform: translate(-50%, calc(-50% - 0.75px)) scale(1.015);
  }

  .avatar-frame--gold .avatar-frame__motion--front::before {
    top: 1px;
    left: 50%;
    width: 8px;
    height: 8px;
    background: radial-gradient(circle, #fffde3 0 14%, #fde68a 28%, rgba(251, 191, 36, 0.12) 68%);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.82));
    transform: translateX(-50%) rotate(45deg) scale(0.72);
    animation: frame-gold-glint 2.2s ease-in-out infinite;
  }

  .avatar-frame--gold .avatar-frame__motion--front::after {
    bottom: 0;
    left: 50%;
    width: 6px;
    height: 6px;
    background: radial-gradient(circle, #fffde3 0 16%, #fcd34d 36%, rgba(245, 158, 11, 0.08) 72%);
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    filter: drop-shadow(0 0 2px rgba(251, 191, 36, 0.72));
    transform: translateX(-50%) rotate(45deg) scale(0.72);
    animation: frame-gold-glint 2.2s 1.1s ease-in-out infinite;
  }

  .avatar-frame--gold .avatar-frame__motion--front i:nth-child(1),
  .avatar-frame--gold .avatar-frame__motion--front i:nth-child(2) {
    width: 3px;
    height: 3px;
    background: #fff4b0;
    box-shadow: 0 0 4px rgba(251, 191, 36, 0.82);
    animation: frame-gold-fleck 2.6s ease-in-out infinite;
  }

  .avatar-frame--gold .avatar-frame__motion--front i:nth-child(1) {
    top: 28%;
    left: 2%;
  }

  .avatar-frame--gold .avatar-frame__motion--front i:nth-child(2) {
    right: 2%;
    bottom: 29%;
    animation-delay: 1.3s;
    animation-direction: reverse;
  }

  .avatar-frame--gold .avatar-frame__motion--front i:nth-child(n + 3) {
    display: none;
  }

  /* 绯樱：完整枝环保持像素固定；花簇材质错峰苏醒，散落花瓣沿框外缓慢飘行。 */
  .avatar-frame--sakura .avatar-frame__art-detail {
    opacity: 0.16;
    filter: brightness(1.18) saturate(1.08) drop-shadow(0 0 2px rgba(251, 113, 133, 0.42));
    -webkit-mask-image:
      radial-gradient(circle at 29% 28%, #000 0 11%, transparent 25%),
      radial-gradient(circle at 72% 70%, #000 0 10%, transparent 24%),
      radial-gradient(circle at 50% 13%, #000 0 6%, transparent 15%);
    mask-image:
      radial-gradient(circle at 29% 28%, #000 0 11%, transparent 25%),
      radial-gradient(circle at 72% 70%, #000 0 10%, transparent 24%),
      radial-gradient(circle at 50% 13%, #000 0 6%, transparent 15%);
    animation: frame-sakura-blossom-shimmer 2.8s ease-in-out infinite;
  }

  // 绯樱的上下吊坠分别裁成独立前景，避免一块柔边蒙版把内环与粉色阴影一起复制到头像上。
  .avatar-frame--sakura .avatar-frame__art-focus {
    opacity: 1;
    filter: none;
  }

  .avatar-frame--sakura .avatar-frame__art-focus--sakura-top {
    clip-path: polygon(50% 16%, 53.3% 20%, 51.2% 23.2%, 50% 25%, 48.8% 23.2%, 46.7% 20%);
  }

  .avatar-frame--sakura .avatar-frame__art-focus--sakura-bottom {
    clip-path: polygon(
      50% 78.1%,
      50.16% 79.2%,
      50.55% 80.5%,
      52.1% 81.7%,
      50% 86%,
      46.8% 81.7%,
      48.8% 80.5%,
      49.35% 79.2%
    );
  }

  .avatar-frame--sakura .avatar-frame__motion--front::before,
  .avatar-frame--sakura .avatar-frame__motion--front::after {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: radial-gradient(circle, #fffbea 0 18%, #ffd4df 34%, rgba(244, 114, 182, 0.08) 72%);
    filter: drop-shadow(0 0 3px rgba(244, 114, 182, 0.72));
    animation: frame-sakura-pollen-glint 2.4s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front::before {
    top: 18%;
    left: 17%;
  }

  .avatar-frame--sakura .avatar-frame__motion--front::after {
    right: 16%;
    bottom: 19%;
    animation-delay: 1.2s;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(1) {
    top: 7px;
    left: 14px;
    width: 6px;
    height: 4px;
    border-radius: 70% 25% 70% 25%;
    background: #ffd1df;
    animation: frame-petal-drift 3.6s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(2) {
    top: 14px;
    right: 9px;
    width: 5px;
    height: 3px;
    border-radius: 70% 25% 70% 25%;
    background: #ff9fbd;
    animation: frame-petal-drift 3.6s 1.2s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(3) {
    right: 15px;
    bottom: 7px;
    width: 6px;
    height: 4px;
    border-radius: 70% 25% 70% 25%;
    background: #ffe0e9;
    animation: frame-petal-drift 3.6s 2.4s ease-in-out infinite;
  }

  .avatar-frame--sakura .avatar-frame__motion--front i:nth-child(4) {
    display: none;
  }

  /* 晚霞：圆环与日轮完全固定，仅两侧云层沿下方弧线错峰缓慢往返。 */
  // 左上角的脱离星光已在素材层清理，避免用 clip-path 硬裁后留下不规则断边。
  // 底部只复制紫金菱形自身到前景，禁止把两侧圆环和粉色云影一起叠到头像上。
  .avatar-frame--sunset .avatar-frame__art-focus {
    opacity: 1;
    // 仅给原画吊坠自身的近白高光染上玫瑰金，不再额外绘制会脱离主体的三角形。
    filter: sepia(0.42) saturate(1.48) hue-rotate(315deg) brightness(0.95);
    clip-path: polygon(
      50% 73%,
      51% 77%,
      52.2% 81%,
      50% 86%,
      47.8% 81%,
      49% 77%
    );
  }

  // 原型在暮色主环外还有一条完整的玫瑰金细环；作为静态底层独立存在，避免跟随云层位移或复制主框纹理。
  .avatar-frame__sunset-orbit {
    z-index: 2;
    top: 50%;
    left: 50%;
    box-sizing: border-box;
    width: 94px;
    height: 94px;
    border: 1px solid rgba(232, 143, 133, 0.92);
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 0.5px rgba(255, 220, 185, 0.72),
      0 0 2px rgba(251, 146, 160, 0.34);
    transform: translate(-50%, -50%);
  }

  .avatar-frame__sunset-cloud {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    filter: none;
    opacity: 1;
    pointer-events: none;
    user-select: none;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    -webkit-user-drag: none;
  }

  .avatar-frame__sunset-cloud--left {
    animation: frame-sunset-cloud-drift-left 7.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame__sunset-cloud--right {
    animation: frame-sunset-cloud-drift-right 7.6s -1.9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame--sunset .avatar-frame__motion {
    display: none;
  }

  /* 成就炫彩：框体和头像始终保持像素对齐，只驱动同源材质光与名称相关的局部主题层。 */
  .avatar-frame--streak-month .avatar-frame__art-detail {
    clip-path: polygon(35% 0, 100% 0, 100% 72%, 72% 64%, 56% 46%);
    animation: frame-achievement-material-flow 4.8s linear infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front::before {
    top: 50%;
    left: 50%;
    width: 88px;
    height: 88px;
    margin: -44px 0 0 -44px;
    border-radius: 50%;
    background: conic-gradient(
      from 215deg,
      transparent 0 18%,
      rgba(196, 181, 253, 0.18) 28%,
      rgba(255, 255, 255, 0.96) 37%,
      rgba(251, 191, 36, 0.72) 41%,
      rgba(165, 180, 252, 0.28) 48%,
      transparent 60% 100%
    );
    -webkit-mask: radial-gradient(circle, transparent 58%, #000 60%, #000 62%, transparent 64%);
    mask: radial-gradient(circle, transparent 58%, #000 60%, #000 62%, transparent 64%);
    filter: drop-shadow(0 0 2px rgba(129, 140, 248, 0.78));
    animation: frame-moon-orbit-glint 5.2s linear infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front::after {
    top: 5px;
    right: 1px;
    width: 31px;
    height: 31px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.92),
      rgba(196, 181, 253, 0.48) 34%,
      rgba(129, 140, 248, 0.16) 58%,
      transparent 74%
    );
    animation: frame-local-pulse 3.4s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i {
    width: 4.5px;
    height: 4.5px;
    border-radius: 0;
    background: #eef2ff;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 2px rgba(129, 140, 248, 0.96));
    animation: frame-moon-star-twinkle 3.6s ease-in-out infinite;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(1) {
    left: 7px;
    top: 23px;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(2) {
    right: 9px;
    bottom: 22px;
    animation-delay: -0.9s;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(3) {
    right: 11px;
    top: 14px;
    animation-delay: -1.8s;
  }

  .avatar-frame--streak-month .avatar-frame__motion--front i:nth-child(4) {
    left: 15px;
    bottom: 10px;
    animation-delay: -2.7s;
  }

  .avatar-frame--note-masterpiece .avatar-frame__art-detail {
    clip-path: polygon(0 53%, 28% 58%, 43% 72%, 58% 66%, 75% 55%, 100% 44%, 100% 100%, 0 100%);
    animation: frame-achievement-material-flow 5s -1.4s linear infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front::before {
    left: 14px;
    bottom: 9px;
    width: 48px;
    height: 2px;
    border-radius: 50%;
    background: linear-gradient(90deg, transparent, rgba(204, 251, 241, 0.94), transparent);
    filter: drop-shadow(0 0 2px rgba(45, 212, 191, 0.72));
    animation: frame-note-current-glide 4.8s ease-in-out infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front::after {
    right: 6px;
    bottom: 10px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(204, 251, 241, 0.72), rgba(45, 212, 191, 0.2) 46%, transparent 72%);
    animation: frame-local-pulse 4.4s -1.6s ease-in-out infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(1),
  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(2),
  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(3),
  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(4) {
    left: 10px;
    bottom: 15px;
    width: 4px;
    height: 4px;
    background: #ccfbf1;
    box-shadow: 0 0 5px rgba(45, 212, 191, 0.72);
    animation: frame-river-spark 4.8s linear infinite;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(2) {
    animation-delay: -2.4s;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(3) {
    left: 18px;
    bottom: 9px;
    animation-delay: -1.2s;
  }

  .avatar-frame--note-masterpiece .avatar-frame__motion--front i:nth-child(4) {
    left: 25px;
    bottom: 12px;
    animation-delay: -3.6s;
  }

  .avatar-frame--file-vault .avatar-frame__art-detail {
    clip-path: polygon(0 51%, 18% 49%, 34% 66%, 53% 63%, 72% 50%, 100% 49%, 100% 100%, 0 100%);
    animation: frame-achievement-material-flow 5.2s -2.1s linear infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front::before {
    top: 1px;
    left: 50%;
    width: 28px;
    height: 40px;
    margin-left: -14px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(147, 197, 253, 0.46) 38%, transparent 92%);
    clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
    transform-origin: 50% 0;
    animation: frame-vault-gate-light 4.4s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front::after {
    left: 50%;
    bottom: 2px;
    width: 58px;
    height: 18px;
    margin-left: -29px;
    background:
      radial-gradient(ellipse at 18% 70%, rgba(255, 255, 255, 0.82) 0 18%, transparent 42%),
      radial-gradient(ellipse at 50% 55%, rgba(219, 234, 254, 0.86) 0 23%, transparent 52%),
      radial-gradient(ellipse at 82% 72%, rgba(147, 197, 253, 0.76) 0 18%, transparent 44%);
    filter: drop-shadow(0 0 3px rgba(96, 165, 250, 0.72));
    animation: frame-vault-cloud-current 5.2s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i {
    width: 5px;
    height: 5px;
    border-radius: 0;
    background: #bfdbfe;
    clip-path: polygon(50% 0, 64% 36%, 100% 50%, 64% 64%, 50% 100%, 36% 64%, 0 50%, 36% 36%);
    filter: drop-shadow(0 0 2px rgba(96, 165, 250, 0.78));
    animation: frame-vault-data-rise 3.8s ease-in-out infinite;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(1) {
    left: 8px;
    bottom: 18px;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(2) {
    right: 8px;
    bottom: 18px;
    animation-delay: -1.1s;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(3) {
    left: 17px;
    bottom: 8px;
    animation-delay: -2.2s;
  }

  .avatar-frame--file-vault .avatar-frame__motion--front i:nth-child(4) {
    right: 17px;
    bottom: 8px;
    animation-delay: -3.3s;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__art-detail {
    clip-path: polygon(0 53%, 100% 53%, 100% 100%, 0 100%);
    animation: frame-achievement-material-flow 5.4s -0.8s linear infinite;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front::before {
    left: 50%;
    bottom: 5px;
    width: 24px;
    height: 32px;
    margin-left: -12px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(196, 181, 253, 0.38) 46%, transparent 92%);
    clip-path: polygon(44% 0, 56% 0, 88% 100%, 12% 100%);
    filter: drop-shadow(0 0 2px rgba(139, 92, 246, 0.54));
    animation: frame-corridor-gate-light 4.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front::after {
    left: 50%;
    bottom: 1px;
    width: 38px;
    height: 9px;
    margin-left: -19px;
    background: linear-gradient(90deg, transparent 10%, rgba(221, 214, 254, 0.52) 38%, rgba(255, 255, 255, 0.86) 50%, rgba(196, 181, 253, 0.48) 62%, transparent 90%);
    background-position: 120% 0;
    background-size: 220% 100%;
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    filter: drop-shadow(0 0 2px rgba(139, 92, 246, 0.46));
    animation: frame-corridor-floor-glint 4.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front i {
    width: 4px;
    height: 7px;
    border-radius: 1px;
    background: rgba(237, 233, 254, 0.92);
    box-shadow: 0 0 4px rgba(139, 92, 246, 0.62);
    animation: frame-corridor-bookmark-glint 4.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front i:nth-child(1) {
    left: 9px;
    bottom: 23px;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front i:nth-child(2) {
    right: 9px;
    bottom: 26px;
    animation-delay: -1.05s;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front i:nth-child(3) {
    left: 17px;
    bottom: 11px;
    animation-delay: -2.1s;
  }

  .avatar-frame--bookmark-corridor .avatar-frame__motion--front i:nth-child(4) {
    right: 18px;
    bottom: 13px;
    animation-delay: -3.15s;
  }

  /* 潮汐：原型框、金边、贝壳与头像孔全部固定；只驱动从同一原画中提取的水体像素。 */
  .avatar-frame--ocean .avatar-frame__motion--back {
    display: none;
  }

  .avatar-frame__ocean-current {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0.3;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    filter: brightness(1.18) saturate(1.14) contrast(1.04);
    mix-blend-mode: screen;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame--ocean .avatar-frame__ocean-current--surge {
    clip-path: polygon(0 0, 58% 0, 52% 34%, 42% 58%, 58% 100%, 0 100%);
    -webkit-mask-image: linear-gradient(180deg, transparent 2%, #000 24% 68%, transparent 90%);
    mask-image: linear-gradient(180deg, transparent 2%, #000 24% 68%, transparent 90%);
    -webkit-mask-size: 100% 220%;
    mask-size: 100% 220%;
    animation: frame-ocean-surge 3.8s linear infinite;
  }

  .avatar-frame--ocean .avatar-frame__ocean-current--crest {
    clip-path: polygon(43% 0, 100% 0, 100% 78%, 66% 72%, 48% 42%);
    -webkit-mask-image: linear-gradient(105deg, transparent 3%, #000 25% 69%, transparent 91%);
    mask-image: linear-gradient(105deg, transparent 3%, #000 25% 69%, transparent 91%);
    -webkit-mask-size: 220% 100%;
    mask-size: 220% 100%;
    animation: frame-ocean-crest-sway 4.4s -1.5s linear infinite;
  }

  .avatar-frame--ocean .avatar-frame__ocean-current--return {
    clip-path: polygon(0 58%, 100% 58%, 100% 100%, 0 100%);
    -webkit-mask-image: linear-gradient(270deg, transparent 4%, #000 26% 70%, transparent 92%);
    mask-image: linear-gradient(270deg, transparent 4%, #000 26% 70%, transparent 92%);
    -webkit-mask-size: 220% 100%;
    mask-size: 220% 100%;
    animation: frame-ocean-return-flow 5s -2.7s linear infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front::before,
  .avatar-frame--ocean .avatar-frame__motion--front::after {
    width: 16px;
    height: 8px;
    border-top: 1.8px solid rgba(255, 255, 255, 0.98);
    border-radius: 70% 45% 0 0;
    background: radial-gradient(ellipse at 52% 18%, rgba(240, 249, 255, 0.94), transparent 64%);
    filter: drop-shadow(0 0 2.4px rgba(56, 189, 248, 0.92));
    opacity: 0.38;
  }

  .avatar-frame--ocean .avatar-frame__motion--front::before {
    top: 7px;
    left: 18px;
    transform: rotate(-22deg);
    animation: frame-ocean-foam-lilt-left 3.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front::after {
    right: 1px;
    bottom: 23px;
    transform: rotate(118deg);
    animation: frame-ocean-foam-lilt-right 4.1s -2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i {
    width: 5px;
    height: 5px;
    border: 1px solid rgba(240, 249, 255, 0.96);
    border-radius: 50%;
    background: radial-gradient(circle at 32% 26%, #fff 0 13%, rgba(186, 230, 253, 0.82) 22%, rgba(14, 165, 233, 0.2) 64%, transparent 68%);
    box-shadow:
      inset -0.5px -0.5px 0 rgba(37, 99, 235, 0.34),
      0 0 3px rgba(56, 189, 248, 0.82);
    opacity: 0.48;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(1) {
    top: 11px;
    left: 2px;
    width: 7px;
    height: 7px;
    animation: frame-ocean-bubble-drift-left 3.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(2) {
    top: 30px;
    right: -1px;
    animation: frame-ocean-bubble-drift-right 4s -1.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(3) {
    bottom: 6px;
    left: 8px;
    width: 5.5px;
    height: 5.5px;
    animation: frame-ocean-bubble-drift-left 4.6s -2.5s cubic-bezier(0.45, 0, 0.55, 1) infinite reverse;
  }

  .avatar-frame--ocean .avatar-frame__motion--front i:nth-child(4) {
    right: 5px;
    bottom: 9px;
    width: 7.5px;
    height: 7.5px;
    animation: frame-ocean-bubble-drift-right 3.8s -3.1s cubic-bezier(0.45, 0, 0.55, 1) infinite reverse;
  }

  .avatar-frame--aurora .avatar-frame__motion--back::before,
  .avatar-frame--aurora .avatar-frame__motion--back::after,
  .avatar-frame--aurora .avatar-frame__motion--back i {
    display: none;
  }

  // 极光的动态层直接来自同一绿幕原型：只提取左右蓝紫流体、晶羽与晶核像素。
  // 结构层始终保持唯一 translate 矩阵，流动只由遮罩和材质光变化表达，避免圆环错位或贴纸感。
  .avatar-frame__aurora-flow,
  .avatar-frame__aurora-crystal {
    z-index: 5;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    transform-origin: 50% 50%;
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__aurora-flow {
    opacity: 0.12;
    mix-blend-mode: screen;
    -webkit-mask-image: linear-gradient(145deg, transparent 18%, #000 39%, #000 56%, transparent 77%);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 230% 230%;
    mask-image: linear-gradient(145deg, transparent 18%, #000 39%, #000 56%, transparent 77%);
    mask-repeat: no-repeat;
    mask-size: 230% 230%;
  }

  .avatar-frame__aurora-flow--left {
    -webkit-mask-position: 120% 115%;
    mask-position: 120% 115%;
    animation: frame-aurora-source-flow-left 4.8s linear infinite;
  }

  .avatar-frame__aurora-flow--right {
    -webkit-mask-position: -20% 110%;
    mask-position: -20% 110%;
    animation: frame-aurora-source-flow-right 4.8s -2.4s linear infinite;
  }

  .avatar-frame__aurora-crystal {
    z-index: 6;
    opacity: 0.22;
    filter: brightness(1.08) saturate(1.08);
  }

  .avatar-frame__aurora-crystal--top {
    clip-path: polygon(38% 0, 62% 0, 62% 34%, 38% 34%);
    animation: frame-aurora-crystal-charge 4.8s ease-in-out infinite;
  }

  .avatar-frame__aurora-crystal--bottom {
    clip-path: polygon(35% 67%, 65% 67%, 65% 100%, 35% 100%);
    animation: frame-aurora-crystal-charge 4.8s -2.4s ease-in-out infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--front::before {
    display: none;
  }

  .avatar-frame--aurora .avatar-frame__motion--front::after {
    display: none;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i {
    width: 3px;
    height: 6px;
    border-radius: 70% 22% 64% 28%;
    background: linear-gradient(180deg, #fff 0 14%, #a5f3fc 30%, #8b5cf6 74%, transparent 100%);
    clip-path: none;
    box-shadow:
      0 0 2px rgba(224, 242, 254, 0.96),
      0 0 5px rgba(103, 232, 249, 0.7);
    opacity: 0;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(1) {
    top: 72px;
    left: 1px;
    animation: frame-aurora-particle-left 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(2) {
    top: 74px;
    right: 1px;
    background: linear-gradient(180deg, #fff 0 14%, #ddd6fe 30%, #22d3ee 74%, transparent 100%);
    box-shadow:
      0 0 2px rgba(245, 243, 255, 0.96),
      0 0 5px rgba(167, 139, 250, 0.72);
    animation: frame-aurora-particle-right 4.8s -2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(3),
  .avatar-frame--aurora .avatar-frame__motion--front i:nth-child(4) {
    display: none;
  }

  .avatar-frame--dynamic.avatar-frame--flame .avatar-frame__art {
    animation: frame-flame-metal-light 6.4s linear infinite;
  }

  .avatar-frame--flame .avatar-frame__motion--back::before,
  .avatar-frame--flame .avatar-frame__motion--back::after,
  .avatar-frame--flame .avatar-frame__motion--back i {
    display: none;
  }

  .avatar-frame--flame .avatar-frame__motion--front::before {
    display: none;
  }

  .avatar-frame--flame .avatar-frame__motion--front::after {
    display: none;
  }

  .avatar-frame--flame .avatar-frame__motion--front i {
    display: none;
  }

  // 同源火焰层始终与框体逐像素对齐，只让亮脉沿真实火焰纹理流过；不移动、不缩放任何整块裁片。
  .avatar-frame--flame .avatar-frame__flame-fire {
    opacity: 0.56;
    transform: translate(-50%, -50%);
    filter: brightness(1.18) saturate(1.14) drop-shadow(0 0 2px rgba(254, 178, 73, 0.62));
  }

  .avatar-frame--flame .avatar-frame__flame-fire--warm {
    -webkit-mask-image: linear-gradient(118deg, transparent 28%, #000 42%, #000 56%, transparent 70%);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 250% 250%;
    mask-image: linear-gradient(118deg, transparent 28%, #000 42%, #000 56%, transparent 70%);
    mask-repeat: no-repeat;
    mask-size: 250% 250%;
    animation: frame-flame-heat-sweep 9.2s linear infinite;
  }

  .avatar-frame--flame .avatar-frame__flame-fire--hot {
    opacity: 0.42;
    -webkit-mask-image: linear-gradient(246deg, transparent 30%, #000 43%, #000 54%, transparent 68%);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 270% 270%;
    mask-image: linear-gradient(246deg, transparent 30%, #000 43%, #000 54%, transparent 68%);
    mask-repeat: no-repeat;
    mask-size: 270% 270%;
    animation: frame-flame-heat-sweep-reverse 11.6s -5.8s linear infinite;
  }

  .avatar-frame--flame .avatar-frame__flame-embers {
    z-index: 6;
    top: 50%;
    left: 50%;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    transform: translate(-50%, -50%);
    filter: brightness(1.2) saturate(1.15) drop-shadow(0 0 2px rgba(251, 146, 60, 0.7));
    animation: frame-flame-real-embers 8.4s linear infinite;
  }

  .avatar-frame--flame .avatar-frame__flame-particle {
    z-index: 7;
    top: var(--flame-root-y);
    left: var(--flame-root-x);
    width: var(--flame-width);
    height: auto;
    opacity: 0;
    transform-origin: 50% 100%;
    filter: brightness(1.32) saturate(1.18) drop-shadow(0 0 2px rgba(255, 190, 76, 0.82));
    animation: frame-flame-spark-rise var(--flame-duration) var(--flame-delay) linear infinite;
  }

  .avatar-frame--flame .avatar-frame__flame-spark--outer {
    z-index: 8;
    filter: brightness(1.48) saturate(1.22) drop-shadow(0 0 3px rgba(255, 177, 61, 0.9));
  }

  /* 积分传说严格递进:霓虹 < 星河 < 龙曜 < 天穹。八款传说全部直接使用绿幕原型;
     底图即完整原画,任何实体结构(圆环、双翼、书卷、龙身)零位移、零变形,
     动效只走同源材质辉光、追光弧、蒙版流转与 CSS 星体微粒。 */

  /* 霓虹:晶环固定;青品双色霓虹光带沿环反向追逐,上下菱形晶体蓄光,晶羽间像素粒子锐利闪烁。 */
  .avatar-frame--dynamic.avatar-frame--neon .avatar-frame__art {
    animation: frame-neon-pulse 3.6s ease-in-out infinite;
  }

  // 追光弧是叠加光,沿环中线追逐;底下的晶环像素不参与旋转。
  .avatar-frame--neon .avatar-frame__motion--front::before {
    inset: 16px;
    border: 2.5px solid transparent;
    border-top-color: rgba(125, 240, 255, 0.92);
    border-right-color: rgba(125, 240, 255, 0.3);
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.8));
    animation: frame-legend-ring-spin 3.2s linear infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--front::after {
    inset: 19px;
    border: 2px solid transparent;
    border-bottom-color: rgba(240, 171, 252, 0.9);
    border-left-color: rgba(240, 171, 252, 0.28);
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgba(217, 70, 239, 0.75));
    animation: frame-legend-ring-spin 4.2s linear infinite reverse;
  }

  .avatar-frame--neon .avatar-frame__motion--front i,
  .avatar-frame--neon .avatar-frame__motion--back i {
    width: 3px;
    height: 3px;
    border-radius: 0;
    background: #9ff6ff;
    box-shadow: 0 0 4px rgba(34, 211, 238, 0.85);
    animation: frame-neon-pixel 2.4s linear infinite;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(1) {
    top: 14px;
    left: 17px;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(2) {
    top: 10px;
    right: 15px;
    background: #f5c8fe;
    box-shadow: 0 0 4px rgba(217, 70, 239, 0.85);
    animation-delay: -0.6s;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(3) {
    right: 8px;
    bottom: 24px;
    animation-delay: -1.2s;
  }

  .avatar-frame--neon .avatar-frame__motion--front i:nth-child(4) {
    bottom: 16px;
    left: 11px;
    background: #f5c8fe;
    box-shadow: 0 0 4px rgba(217, 70, 239, 0.85);
    animation-delay: -1.8s;
  }

  .avatar-frame--neon .avatar-frame__motion--back i {
    width: 2px;
    height: 2px;
    opacity: 0;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(1) {
    top: 24px;
    left: 6px;
    animation-delay: -0.3s;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(2) {
    top: 20px;
    right: 5px;
    animation-delay: -0.9s;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(3) {
    right: 20px;
    bottom: 7px;
    animation-delay: -1.5s;
  }

  .avatar-frame--neon .avatar-frame__motion--back i:nth-child(4) {
    bottom: 9px;
    left: 22px;
    animation-delay: -2.1s;
  }

  // 上下菱形晶体同源蓄光;蒙版只改亮度通道,不复制轮廓。
  .avatar-frame--neon .avatar-frame__art-detail {
    opacity: 0;
    filter: brightness(1.65) saturate(1.22) drop-shadow(0 0 4px rgba(125, 240, 255, 0.85));
    -webkit-mask-image:
      radial-gradient(circle at 50% 9%, #000 0 9%, transparent 17%),
      radial-gradient(circle at 50% 91%, #000 0 9%, transparent 17%);
    mask-image:
      radial-gradient(circle at 50% 9%, #000 0 9%, transparent 17%),
      radial-gradient(circle at 50% 91%, #000 0 9%, transparent 17%);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-neon-crystal-charge 4.4s ease-in-out infinite;
  }

  /* 星河:星环与星芒固定;流光星体沿环公转并拖出星尘,银河材质缓涌,环上星点错相闪烁。 */
  .avatar-frame--dynamic.avatar-frame--galaxy .avatar-frame__art {
    animation: frame-galaxy-breathe 5.2s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--back::before {
    inset: 6px;
    border: 1px solid transparent;
    border-top-color: rgba(253, 230, 138, 0.62);
    border-left-color: rgba(216, 180, 254, 0.4);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(216, 180, 254, 0.6));
    animation: frame-legend-ring-spin 21s linear infinite;
  }

  // 主星体与随行星尘共用同一轨道动画,负延迟制造拖尾相位;轨道半径落在环带中线上。
  .avatar-frame--galaxy .avatar-frame__motion--front::before {
    top: 50%;
    left: 50%;
    width: 7px;
    height: 7px;
    margin: -3.5px 0 0 -3.5px;
    border-radius: 50%;
    background: radial-gradient(circle at 42% 38%, #fffdf0, #fde68a 46%, rgba(216, 180, 254, 0.5) 78%, transparent);
    box-shadow:
      0 0 5px rgba(254, 240, 138, 0.9),
      0 0 10px rgba(167, 139, 250, 0.55);
    animation: frame-galaxy-planet-orbit 11s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front::after {
    top: 50%;
    left: 50%;
    width: 4.5px;
    height: 4.5px;
    margin: -2.25px 0 0 -2.25px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 36%, #fff, #bfdbfe 52%, transparent 80%);
    box-shadow: 0 0 5px rgba(147, 197, 253, 0.8);
    animation: frame-galaxy-planet-orbit-minor 16s linear infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(1),
  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(2) {
    top: 50%;
    left: 50%;
    width: 3px;
    height: 3px;
    margin: -1.5px 0 0 -1.5px;
    background: #f3e8ff;
    box-shadow: 0 0 4px rgba(216, 180, 254, 0.8);
    opacity: 0.85;
    animation: frame-galaxy-planet-orbit 11s linear infinite;
    animation-delay: -10.72s;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(2) {
    width: 2.5px;
    height: 2.5px;
    opacity: 0.5;
    animation-delay: -10.48s;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(3) {
    top: 15px;
    left: 30px;
    width: 4px;
    height: 4px;
    animation: frame-local-twinkle 2.8s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__motion--front i:nth-child(4) {
    right: 25px;
    bottom: 17px;
    width: 4px;
    height: 4px;
    animation: frame-local-twinkle 2.8s -1.4s ease-in-out infinite;
  }

  .avatar-frame--galaxy .avatar-frame__art-detail {
    opacity: 0;
    filter: brightness(1.5) saturate(1.16) drop-shadow(0 0 3px rgba(165, 180, 252, 0.6));
    -webkit-mask-image: linear-gradient(118deg, transparent 30%, #000 46%, #000 54%, transparent 70%);
    mask-image: linear-gradient(118deg, transparent 30%, #000 46%, #000 54%, transparent 70%);
    -webkit-mask-size: 240% 240%;
    mask-size: 240% 240%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-galaxy-flow 5.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  /* 龙曜:完整原画是唯一结构层；圆环、龙身、鬃毛和宝石全部像素固定。
     动态只发生在同画布提取的红金高光、原画焦点蓄光、独立龙气与微粒上。 */
  .avatar-frame--dynamic.avatar-frame--dragon .avatar-frame__art {
    animation: frame-dragon-metal-light 4.2s ease-in-out infinite;
  }

  // 原画副本只照亮顶部与底部两枚红宝石；左侧宝石、龙眼和龙身不进入高亮蒙版。
  .avatar-frame--dragon .avatar-frame__art-detail {
    opacity: 0;
    filter: brightness(2.08) saturate(1.38) drop-shadow(0 0 5px rgba(248, 113, 113, 0.92));
    -webkit-mask-image:
      radial-gradient(circle at 50% 14%, #000 0 3.6%, transparent 7.5%),
      radial-gradient(circle at 50% 84%, #000 0 4.2%, transparent 8.5%);
    mask-image:
      radial-gradient(circle at 50% 14%, #000 0 3.6%, transparent 7.5%),
      radial-gradient(circle at 50% 84%, #000 0 4.2%, transparent 8.5%);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    mix-blend-mode: screen;
    animation: frame-dragon-focus-charge 4.2s ease-in-out infinite;
  }

  // 三段高光层保持与 384px 原画同画布、同中心、同尺寸；只让不同龙身区域错峰显隐。
  .avatar-frame__dragon-trail {
    z-index: 5;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0;
    transform: translate(-50%, -50%);
    mix-blend-mode: normal;
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame__dragon-trail--tail {
    filter: brightness(1.16) saturate(1.08) drop-shadow(0 0 2px rgba(249, 115, 22, 0.46));
    -webkit-mask-image: radial-gradient(ellipse at 21% 61%, #000 0 22%, transparent 46%);
    mask-image: radial-gradient(ellipse at 21% 61%, #000 0 22%, transparent 46%);
    animation: frame-dragon-trail-breathe 4.2s ease-in-out infinite;
  }

  .avatar-frame__dragon-trail--body {
    filter: brightness(1.12) saturate(1.06) drop-shadow(0 0 1.5px rgba(251, 191, 36, 0.4));
    -webkit-mask-image: radial-gradient(circle, #000 0 17%, transparent 41%);
    mask-image: radial-gradient(circle, #000 0 17%, transparent 41%);
    -webkit-mask-size: 150% 150%;
    mask-size: 150% 150%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-dragon-energy-tour 4.2s linear infinite;
  }

  .avatar-frame__dragon-trail--mane {
    filter: brightness(1.18) saturate(1.1) drop-shadow(0 0 2px rgba(249, 115, 22, 0.5));
    -webkit-mask-image: radial-gradient(ellipse at 73% 25%, #000 0 21%, transparent 45%);
    mask-image: radial-gradient(ellipse at 73% 25%, #000 0 21%, transparent 45%);
    animation: frame-dragon-trail-breathe 4.2s -2.1s ease-in-out infinite;
  }

  // 龙焰呼吸是框后透光，不改火焰像素本身。
  .avatar-frame--dragon .avatar-frame__motion--back::before {
    left: 0;
    bottom: 12px;
    width: 42px;
    height: 50px;
    border-radius: 50%;
    background: radial-gradient(ellipse at 60% 52%, rgba(255, 222, 126, 0.44), rgba(249, 115, 22, 0.2) 52%, transparent 76%);
    filter: blur(1px);
    animation: frame-dragon-flame-breathe 2.8s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--back::after {
    top: 8px;
    right: 2px;
    width: 40px;
    height: 46px;
    border-radius: 50%;
    background: radial-gradient(ellipse at 42% 55%, rgba(255, 226, 137, 0.42), rgba(249, 115, 22, 0.18) 54%, transparent 76%);
    filter: blur(1px);
    animation: frame-dragon-flame-breathe 2.8s -1.4s ease-in-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion--front::before,
  .avatar-frame--dragon .avatar-frame__motion--front::after {
    display: none;
  }

  // 四枚大小不同的黄色龙气沿头像内圈匀速巡游，不承载任何实体轮廓。
  // 粒子低于唯一固定结构层，让龙头、龙身和金属环按原画 Alpha 自然遮挡，避免光点穿过实体。
  .avatar-frame__dragon-orbit-particles {
    z-index: 2;
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    overflow: visible;
    transform: translate(-50%, -50%);
  }

  .avatar-frame__dragon-orbit-particles i {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--dragon-orbit-size);
    height: var(--dragon-orbit-size);
    margin-top: calc(var(--dragon-orbit-size) / -2);
    margin-left: calc(var(--dragon-orbit-size) / -2);
    border-radius: 50%;
    background: radial-gradient(circle, #fffde7 0 18%, #fde68a 42%, rgba(249, 115, 22, 0.16) 76%);
    box-shadow:
      0 0 4px rgba(255, 251, 235, 0.94),
      0 0 9px rgba(249, 115, 22, 0.78);
    animation: frame-dragon-energy-orbit 7.2s var(--dragon-orbit-delay) linear infinite;
  }

  .avatar-frame--dragon .avatar-frame__motion i {
    display: none;
  }

  // 十八粒独立火星以不同尺寸向斜上、两侧与轻微下方逸散；结构图与高光栅格层仍保持固定矩阵。
  // 火星同样从固定结构层后方逸出，只在主体 Alpha 透明处显现，保留自然的前后景关系。
  .avatar-frame__dragon-particles {
    z-index: 2;
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    overflow: visible;
    transform: translate(-50%, -50%);
  }

  .avatar-frame__dragon-particles i {
    position: absolute;
    top: var(--dragon-particle-y);
    left: var(--dragon-particle-x);
    display: block;
    width: var(--dragon-particle-size);
    height: var(--dragon-particle-size);
    border-radius: 50%;
    background: radial-gradient(circle, #fffdf0 0 18%, #fde68a 36%, #fb923c 64%, transparent 76%);
    box-shadow:
      0 0 3px rgba(254, 240, 138, 0.92),
      0 0 6px rgba(249, 115, 22, 0.72);
    opacity: 0;
    animation: frame-dragon-particle-drift var(--dragon-particle-duration) var(--dragon-particle-delay) ease-out infinite;
  }

  .avatar-frame--dragon .avatar-frame__bezel {
    border-color: rgba(255, 224, 130, 0.9);
    box-shadow:
      inset 0 0 0 1px rgba(255, 251, 235, 0.72),
      0 0 4px rgba(245, 158, 11, 0.54);
  }

  /* 天穹:环体、光环与底冠像素固定;双翼分层素材以翼根为锚点向外开合,星轨双弧缓旋,光环日蚀变幻,底晶蓄光。 */
  .avatar-frame--dynamic.avatar-frame--celestial .avatar-frame__art {
    animation: frame-celestial-glow 5.6s ease-in-out infinite;
  }

  // 双翼与底图同画布同坐标,压在环体之下:翼根切割边和垫肩始终藏在环/底冠后面。
  // 定位不用 translate 居中,把 transform 完整留给开合动画,避免 keyframes 覆盖位移导致错位。
  .avatar-frame__wing-layer {
    z-index: 2;
    top: 50%;
    left: 50%;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    margin: calc(var(--frame-art-size) / -2) 0 0 calc(var(--frame-art-size) / -2);
    object-fit: contain;
    // 多片同画布分层不得各自叠加彩色晕影，否则合成后会比单层主题明显更糊。
    filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.14));
    user-select: none;
    -webkit-user-drag: none;
  }

  // 锚点=翼根与环带贴合处(素材 384 画布上左翼约 (120,265)),开合只向外张,不越过静止位向内收。
  .avatar-frame--celestial .avatar-frame__wing-layer--left {
    transform-origin: 31.25% 69%;
  }

  .avatar-frame--celestial .avatar-frame__wing-layer--right {
    transform-origin: 68.75% 69%;
  }

  .avatar-frame--dynamic.avatar-frame--celestial .avatar-frame__wing-layer--left {
    animation: frame-celestial-wing-flap-left 5.2s ease-in-out infinite;
    will-change: transform;
  }

  .avatar-frame--dynamic.avatar-frame--celestial .avatar-frame__wing-layer--right {
    animation: frame-celestial-wing-flap-right 5.2s ease-in-out infinite;
    will-change: transform;
  }

  // 翼尘星屑:只在翼梢外侧错峰上浮消散,数量固定六颗,不遮头像、不进环内。
  .avatar-frame__celestial-dust {
    inset: 0;
    z-index: 5;
  }

  .avatar-frame__celestial-dust i {
    position: absolute;
    top: var(--dust-y);
    left: var(--dust-x);
    width: var(--dust-size);
    height: var(--dust-size);
    border-radius: 50%;
    background: #eef1ff;
    box-shadow: 0 0 4px rgba(180, 190, 254, 0.85);
    opacity: 0;
  }

  .avatar-frame--dynamic.avatar-frame--celestial .avatar-frame__celestial-dust i {
    animation: frame-celestial-dust-rise var(--dust-duration) var(--dust-delay) ease-in-out infinite;
  }

  // 新绿幕原型的环体显示直径约 85px,星轨弧必须贴环带走,不得悬空穿过双翼与光环。
  .avatar-frame--celestial .avatar-frame__motion--back::before {
    inset: 17px;
    border: 1px solid transparent;
    border-top-color: rgba(253, 230, 138, 0.7);
    border-right-color: rgba(199, 210, 254, 0.45);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(165, 180, 252, 0.65));
    animation: frame-legend-ring-spin 14s linear infinite;
  }

  .avatar-frame--celestial .avatar-frame__motion--back::after {
    inset: 20px;
    border: 1px solid transparent;
    border-bottom-color: rgba(224, 231, 255, 0.6);
    border-left-color: rgba(216, 180, 254, 0.4);
    border-radius: 50%;
    animation: frame-legend-ring-spin 19s linear infinite reverse;
  }

  .avatar-frame--celestial .avatar-frame__motion--front::before {
    top: 13px;
    left: 50%;
    width: 26px;
    height: 10px;
    margin-left: -13px;
    border: 2px solid rgba(253, 230, 138, 0.85);
    border-bottom-color: transparent;
    border-radius: 50%;
    filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.7));
    animation: frame-celestial-halo-eclipse 5.4s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motion--front::after {
    bottom: 6px;
    left: 50%;
    width: 9px;
    height: 9px;
    margin-left: -4.5px;
    background: radial-gradient(circle at 50% 40%, #f4f6ff 0 22%, #93c5fd 52%, rgba(99, 102, 241, 0.25) 76%, transparent);
    clip-path: polygon(50% 0, 74% 50%, 50% 100%, 26% 50%);
    filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.9));
    animation: frame-celestial-core-charge 4.4s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motion--front i {
    width: 4px;
    height: 4px;
    background: #eef2ff;
    box-shadow: 0 0 5px rgba(165, 180, 252, 0.9);
    animation: frame-local-twinkle 3.2s ease-in-out infinite;
  }

  .avatar-frame--celestial .avatar-frame__motion--front i:nth-child(1) {
    top: 22px;
    left: 34px;
  }

  .avatar-frame--celestial .avatar-frame__motion--front i:nth-child(2) {
    top: 22px;
    right: 34px;
    animation-delay: -0.8s;
  }

  .avatar-frame--celestial .avatar-frame__motion--front i:nth-child(3) {
    top: 42px;
    left: 10px;
    animation-delay: -1.6s;
  }

  .avatar-frame--celestial .avatar-frame__motion--front i:nth-child(4) {
    top: 42px;
    right: 10px;
    animation-delay: -2.4s;
  }

  /* 成就传说:三款标准传说同预算不同主题,岁序长明与天穹同属全局天花板。 */

  /* 万卷星库:书环固定;星光巡回依次映亮环上书卷,纸页辉光起伏,金色星尘缓浮。 */
  .avatar-frame--dynamic.avatar-frame--bookmark-archive .avatar-frame__art {
    animation: frame-library-metal-light 5.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back::before {
    inset: 14px;
    border: 1.5px solid transparent;
    border-top-color: rgba(191, 219, 254, 0.78);
    border-right-color: rgba(254, 240, 138, 0.5);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(147, 197, 253, 0.6));
    animation: frame-legend-ring-spin 9s linear infinite;
  }

  // 星光纸页辉映 + 书卷浮动感:书卷像素固定,四册蒙版辉光整体轻浮起伏,像被星光托起。
  .avatar-frame--bookmark-archive .avatar-frame__art-detail {
    opacity: 0;
    filter: brightness(1.52) saturate(1.12) drop-shadow(0 0 3px rgba(254, 240, 138, 0.65));
    -webkit-mask-image:
      radial-gradient(circle at 24% 15%, #000 0 12%, transparent 24%),
      radial-gradient(circle at 80% 28%, #000 0 12%, transparent 24%),
      radial-gradient(circle at 17% 66%, #000 0 12%, transparent 24%),
      radial-gradient(circle at 76% 76%, #000 0 12%, transparent 24%);
    mask-image:
      radial-gradient(circle at 24% 15%, #000 0 12%, transparent 24%),
      radial-gradient(circle at 80% 28%, #000 0 12%, transparent 24%),
      radial-gradient(circle at 17% 66%, #000 0 12%, transparent 24%),
      radial-gradient(circle at 76% 76%, #000 0 12%, transparent 24%);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-library-page-glow 4.8s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front::before {
    top: 14px;
    left: 20px;
    width: 7px;
    height: 7px;
    background: #fefce8;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    filter: drop-shadow(0 0 4px rgba(254, 240, 138, 0.9));
    animation: frame-library-page-glint 4.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front::after {
    right: 22px;
    bottom: 18px;
    width: 6px;
    height: 6px;
    background: #eff6ff;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.9));
    animation: frame-library-page-glint 4.2s -2.1s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i {
    width: 3px;
    height: 3px;
    background: #fef9c3;
    box-shadow: 0 0 4px rgba(250, 204, 21, 0.8);
    animation: frame-library-stardust 5.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(1) {
    top: 30px;
    left: 8px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(2) {
    top: 24px;
    right: 10px;
    animation-delay: -1.3s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(3) {
    right: 30px;
    bottom: 8px;
    animation-delay: -2.6s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--front i:nth-child(4) {
    bottom: 12px;
    left: 26px;
    animation-delay: -3.9s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back i {
    width: 3px;
    height: 3px;
    background: #dbeafe;
    box-shadow: 0 0 4px rgba(147, 197, 253, 0.85);
    animation: frame-local-twinkle 3.4s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back i:nth-child(1) {
    top: 8px;
    left: 44px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back i:nth-child(2) {
    top: 40px;
    right: 5px;
    animation-delay: -0.85s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back i:nth-child(3) {
    bottom: 7px;
    left: 48px;
    animation-delay: -1.7s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__motion--back i:nth-child(4) {
    top: 44px;
    left: 4px;
    animation-delay: -2.55s;
  }

  // 两股星流只在原画蓝色书带内巡游；通过局部蒙版显隐同源像素，不移动书环与书册。
  .avatar-frame--bookmark-archive .avatar-frame__bookmark-current,
  .avatar-frame--bookmark-archive .avatar-frame__bookmark-booklight {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0;
    transform: translate(-50%, -50%);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-current {
    filter: brightness(1.34) saturate(1.24) drop-shadow(0 0 3px rgba(96, 165, 250, 0.5));
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-current--left {
    clip-path: polygon(0 5%, 61% 5%, 61% 100%, 0 100%);
    -webkit-mask-image: linear-gradient(142deg, transparent 34%, #000 47%, #000 54%, transparent 67%);
    mask-image: linear-gradient(142deg, transparent 34%, #000 47%, #000 54%, transparent 67%);
    -webkit-mask-size: 245% 245%;
    mask-size: 245% 245%;
    animation: frame-library-current-left 4.2s linear infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-current--right {
    clip-path: polygon(47% 0, 100% 0, 100% 100%, 47% 100%);
    filter: brightness(1.3) saturate(1.2) drop-shadow(0 0 3px rgba(250, 204, 21, 0.44));
    -webkit-mask-image: linear-gradient(30deg, transparent 35%, #000 47%, #000 54%, transparent 66%);
    mask-image: linear-gradient(30deg, transparent 35%, #000 47%, #000 54%, transparent 66%);
    -webkit-mask-size: 250% 250%;
    mask-size: 250% 250%;
    animation: frame-library-current-right 4.8s linear -1.7s infinite;
  }

  // 同一枚局部高光在透明间隙切换位置，让右侧主书、左上与左下书卷依次回应。
  .avatar-frame--bookmark-archive .avatar-frame__bookmark-booklight {
    z-index: 5;
    filter: brightness(1.28) saturate(0.94) drop-shadow(0 0 3px rgba(191, 219, 254, 0.52));
    -webkit-mask-image: radial-gradient(circle, #000 0 22%, rgba(0, 0, 0, 0.72) 38%, transparent 62%);
    mask-image: radial-gradient(circle, #000 0 22%, rgba(0, 0, 0, 0.72) 38%, transparent 62%);
    -webkit-mask-size: 30% 30%;
    mask-size: 30% 30%;
    animation: frame-library-book-tour 3.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-event {
    z-index: 6;
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    overflow: visible;
    transform: translate(-50%, -50%);
  }

  // 右侧主书仅叠加两道扇形纸页光影，原书本像素与装订轴保持固定。
  .avatar-frame--bookmark-archive .avatar-frame__bookmark-page {
    position: absolute;
    opacity: 0;
    clip-path: polygon(6% 50%, 100% 9%, 78% 91%);
    background: linear-gradient(102deg, transparent 8%, rgba(219, 234, 254, 0.28) 30%, rgba(255, 255, 255, 0.86) 50%, rgba(254, 249, 195, 0.2) 68%, transparent 86%);
    filter: drop-shadow(0 0 2px rgba(191, 219, 254, 0.7));
    transform: rotate(var(--library-page-angle)) scaleX(0.18);
    transform-origin: left bottom;
    animation: frame-library-page-turn 3.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-page--one {
    --library-page-angle: 8deg;
    top: 29px;
    left: 86px;
    width: 14px;
    height: 21px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-page--two {
    --library-page-angle: 14deg;
    top: 31px;
    left: 89px;
    width: 11px;
    height: 19px;
    animation-delay: 0.24s;
  }

  // 短划与菱点代表被书页释放的文字星光，沿头像孔外侧弧线汇入顶部晶石。
  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph {
    --library-glyph-angle: -18deg;
    position: absolute;
    top: var(--library-glyph-top);
    left: var(--library-glyph-left);
    width: var(--library-glyph-width);
    height: var(--library-glyph-height);
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(147, 197, 253, 0.4), #fff 46%, #fde68a 78%);
    box-shadow: 0 0 5px rgba(147, 197, 253, 0.94), 0 0 3px rgba(254, 240, 138, 0.76);
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.94));
    opacity: 0;
    transform: translate(0, 0) rotate(var(--library-glyph-angle)) scale(0.6);
    animation: frame-library-glyph-rise 5.2s linear var(--library-glyph-delay) infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--one {
    --library-glyph-top: 39px;
    --library-glyph-left: 91px;
    --library-glyph-width: 7px;
    --library-glyph-height: 2px;
    --library-glyph-delay: 0s;
    --library-glyph-x1: 6px;
    --library-glyph-y1: -9px;
    --library-glyph-x2: -7px;
    --library-glyph-y2: -23px;
    --library-glyph-x3: -32px;
    --library-glyph-y3: -31px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--two {
    --library-glyph-angle: 42deg;
    --library-glyph-top: 42px;
    --library-glyph-left: 89px;
    --library-glyph-width: 4.6px;
    --library-glyph-height: 4.6px;
    --library-glyph-delay: 0.1s;
    --library-glyph-x1: 8px;
    --library-glyph-y1: -11px;
    --library-glyph-x2: -10px;
    --library-glyph-y2: -26px;
    --library-glyph-x3: -29px;
    --library-glyph-y3: -34px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--three {
    --library-glyph-angle: 12deg;
    --library-glyph-top: 37px;
    --library-glyph-left: 94px;
    --library-glyph-width: 6px;
    --library-glyph-height: 1.8px;
    --library-glyph-delay: 0.2s;
    --library-glyph-x1: 3px;
    --library-glyph-y1: -10px;
    --library-glyph-x2: -11px;
    --library-glyph-y2: -21px;
    --library-glyph-x3: -35px;
    --library-glyph-y3: -29px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--four {
    --library-glyph-angle: -36deg;
    --library-glyph-top: 45px;
    --library-glyph-left: 92px;
    --library-glyph-width: 5.4px;
    --library-glyph-height: 1.9px;
    --library-glyph-delay: 0.3s;
    --library-glyph-x1: 6px;
    --library-glyph-y1: -13px;
    --library-glyph-x2: -13px;
    --library-glyph-y2: -29px;
    --library-glyph-x3: -34px;
    --library-glyph-y3: -37px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--five {
    --library-glyph-angle: 55deg;
    --library-glyph-top: 35px;
    --library-glyph-left: 88px;
    --library-glyph-width: 4.2px;
    --library-glyph-height: 4.2px;
    --library-glyph-delay: 0.4s;
    --library-glyph-x1: 8px;
    --library-glyph-y1: -7px;
    --library-glyph-x2: -4px;
    --library-glyph-y2: -19px;
    --library-glyph-x3: -27px;
    --library-glyph-y3: -27px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--six {
    --library-glyph-angle: 18deg;
    --library-glyph-top: 39px;
    --library-glyph-left: 25px;
    --library-glyph-width: 6.8px;
    --library-glyph-height: 2px;
    --library-glyph-delay: 1.8s;
    --library-glyph-x1: -6px;
    --library-glyph-y1: -9px;
    --library-glyph-x2: 7px;
    --library-glyph-y2: -23px;
    --library-glyph-x3: 32px;
    --library-glyph-y3: -31px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--seven {
    --library-glyph-angle: -42deg;
    --library-glyph-top: 42px;
    --library-glyph-left: 27px;
    --library-glyph-width: 4.6px;
    --library-glyph-height: 4.6px;
    --library-glyph-delay: 1.9s;
    --library-glyph-x1: -8px;
    --library-glyph-y1: -11px;
    --library-glyph-x2: 10px;
    --library-glyph-y2: -26px;
    --library-glyph-x3: 29px;
    --library-glyph-y3: -34px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--eight {
    --library-glyph-angle: -12deg;
    --library-glyph-top: 37px;
    --library-glyph-left: 22px;
    --library-glyph-width: 6px;
    --library-glyph-height: 1.8px;
    --library-glyph-delay: 2s;
    --library-glyph-x1: -3px;
    --library-glyph-y1: -10px;
    --library-glyph-x2: 11px;
    --library-glyph-y2: -21px;
    --library-glyph-x3: 35px;
    --library-glyph-y3: -29px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--nine {
    --library-glyph-angle: 36deg;
    --library-glyph-top: 45px;
    --library-glyph-left: 24px;
    --library-glyph-width: 5.4px;
    --library-glyph-height: 1.9px;
    --library-glyph-delay: 2.1s;
    --library-glyph-x1: -6px;
    --library-glyph-y1: -13px;
    --library-glyph-x2: 13px;
    --library-glyph-y2: -29px;
    --library-glyph-x3: 34px;
    --library-glyph-y3: -37px;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-glyph--ten {
    --library-glyph-angle: -55deg;
    --library-glyph-top: 35px;
    --library-glyph-left: 28px;
    --library-glyph-width: 4.2px;
    --library-glyph-height: 4.2px;
    --library-glyph-delay: 2.2s;
    --library-glyph-x1: -8px;
    --library-glyph-y1: -7px;
    --library-glyph-x2: 4px;
    --library-glyph-y2: -19px;
    --library-glyph-x3: 27px;
    --library-glyph-y3: -27px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-gem {
    position: absolute;
    width: 9px;
    height: 9px;
    background: radial-gradient(circle, #fff 0 18%, #93c5fd 44%, rgba(250, 204, 21, 0.38) 66%, transparent 73%);
    clip-path: polygon(50% 0, 72% 50%, 50% 100%, 28% 50%);
    filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.86));
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.55);
    animation: frame-library-gem-gather 3.2s ease-in-out infinite;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-gem--top {
    top: 9px;
    left: 58px;
    animation-delay: 0.52s;
  }

  .avatar-frame--bookmark-archive .avatar-frame__bookmark-gem--bottom {
    top: 104px;
    left: 58px;
    animation-delay: 1.55s;
  }

  /* 翰墨星海:墨环与毛笔固定;墨韵沿环斜涌,文光自环带汇入底部晶石,笔锋辉光错落。 */
  .avatar-frame--dynamic.avatar-frame--note-constellation .avatar-frame__art {
    animation: frame-constellation-ink 5.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--back::before {
    inset: 14px;
    border: 1px solid transparent;
    border-top-color: rgba(191, 219, 254, 0.6);
    border-left-color: rgba(224, 231, 255, 0.42);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(147, 197, 253, 0.55));
    animation: frame-legend-ring-spin 13s linear infinite reverse;
  }

  .avatar-frame--note-constellation .avatar-frame__art-detail {
    opacity: 0;
    filter: brightness(1.45) saturate(1.1) drop-shadow(0 0 3px rgba(148, 163, 253, 0.55));
    -webkit-mask-image: linear-gradient(150deg, transparent 30%, #000 47%, #000 53%, transparent 70%);
    mask-image: linear-gradient(150deg, transparent 30%, #000 47%, #000 53%, transparent 70%);
    -webkit-mask-size: 230% 230%;
    mask-size: 230% 230%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-constellation-ink-flow 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front::before {
    top: 83px;
    left: 80px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 251, 235, 0.72) 0 20%, rgba(253, 230, 138, 0.3) 50%, transparent 74%);
    animation: frame-constellation-pen-light 3.8s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front::after {
    bottom: 7px;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: radial-gradient(circle at 50% 40%, #f0f9ff 0 22%, #93c5fd 52%, rgba(59, 130, 246, 0.25) 76%, transparent);
    clip-path: polygon(50% 0, 74% 50%, 50% 100%, 26% 50%);
    filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.9));
    animation: frame-celestial-core-charge 4.6s ease-in-out infinite;
  }

  // 文光汇聚:光点自下半环带出发,沿环滑入底部晶石后隐没;路径避开头像面部。
  .avatar-frame--note-constellation .avatar-frame__motion--back::after {
    inset: 17px;
    border: 1px solid transparent;
    border-bottom-color: rgba(165, 180, 252, 0.5);
    border-right-color: rgba(224, 231, 255, 0.35);
    border-radius: 50%;
    animation: frame-legend-ring-spin 17s linear infinite;
  }

  // 原画环带已布满星徽,额外圆点星与画风不符;环上星光由墨韵辉光点亮,悬空装饰点一律不加。
  .avatar-frame--note-constellation .avatar-frame__motion--back i {
    display: none;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i {
    bottom: 12px;
    left: 50%;
    width: 3.5px;
    height: 3.5px;
    margin-left: -1.75px;
    background: rgba(239, 248, 255, 0.9);
    box-shadow: 0 0 4px rgba(125, 211, 252, 0.7);
    animation: frame-constellation-gather 5.4s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(1) {
    --gather-x: -38px;
    --gather-y: -16px;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(2) {
    --gather-x: 38px;
    --gather-y: -14px;
    animation-delay: -1.8s;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(3) {
    --gather-x: -20px;
    --gather-y: -4px;
    animation-delay: -3.6s;
  }

  .avatar-frame--note-constellation .avatar-frame__motion--front i:nth-child(4) {
    top: 12px;
    right: 26px;
    bottom: auto;
    left: auto;
    width: 4px;
    height: 4px;
    animation: frame-local-twinkle 3s ease-in-out infinite;
  }

  // 墨海暗流只复用原画像素并移动局部蒙版；结构图、毛笔与头像孔始终保持同一矩阵。
  .avatar-frame--note-constellation .avatar-frame__constellation-ink {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0;
    transform: translate(-50%, -50%);
    filter: brightness(1.26) saturate(1.18) drop-shadow(0 0 2px rgba(96, 165, 250, 0.42));
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-ink--left {
    clip-path: polygon(0 3%, 58% 3%, 58% 100%, 0 100%);
    -webkit-mask-image: linear-gradient(145deg, transparent 33%, #000 46%, #000 55%, transparent 68%);
    mask-image: linear-gradient(145deg, transparent 33%, #000 46%, #000 55%, transparent 68%);
    -webkit-mask-size: 240% 240%;
    mask-size: 240% 240%;
    animation: frame-constellation-current-left 8.8s linear infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-ink--right {
    clip-path: polygon(52% 0, 100% 0, 100% 100%, 52% 100%);
    filter: brightness(1.2) saturate(1.14) drop-shadow(0 0 2px rgba(196, 181, 253, 0.38));
    -webkit-mask-image: linear-gradient(25deg, transparent 34%, #000 47%, #000 54%, transparent 67%);
    mask-image: linear-gradient(25deg, transparent 34%, #000 47%, #000 54%, transparent 67%);
    -webkit-mask-size: 250% 250%;
    mask-size: 250% 250%;
    animation: frame-constellation-current-right 10.4s linear -3.2s infinite;
  }

  // 两组星轨沿头像孔外缘往返串联星徽，线段不跨入头像区域，也不驱动任何实体结构。
  .avatar-frame--note-constellation .avatar-frame__constellation-star-route {
    z-index: 6;
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    overflow: visible;
    transform: translate(-50%, -50%);
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link {
    position: absolute;
    height: 4.4px;
    background: linear-gradient(90deg, transparent, #bfdbfe 16%, #fff 50%, #fde68a 82%, transparent);
    clip-path: polygon(0 42%, 21% 0, 37% 58%, 58% 8%, 73% 62%, 100% 30%, 82% 100%, 61% 48%, 42% 94%, 25% 47%, 0 80%);
    filter: drop-shadow(0 0 2px rgba(224, 231, 255, 0.98)) drop-shadow(0 0 4px rgba(125, 211, 252, 0.84));
    opacity: 0;
    transform: rotate(var(--constellation-link-angle)) scaleX(0);
    transform-origin: left center;
    animation: frame-constellation-star-link 2.6s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--one {
    --constellation-link-angle: 30deg;
    top: 12px;
    left: 58px;
    width: 29px;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--two {
    --constellation-link-angle: 69deg;
    top: 27px;
    left: 83px;
    width: 32px;
    animation-delay: 0.08s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--three {
    --constellation-link-angle: 108deg;
    top: 57px;
    left: 94px;
    width: 37px;
    animation-delay: 0.16s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--four {
    --constellation-link-angle: 158deg;
    top: 91px;
    left: 82px;
    width: 31px;
    animation-delay: 0.24s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--five {
    --constellation-link-angle: -158deg;
    top: 103px;
    left: 56px;
    width: 30px;
    animation-delay: 1.25s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--six {
    --constellation-link-angle: -108deg;
    top: 92px;
    left: 29px;
    width: 37px;
    animation-delay: 1.33s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--seven {
    --constellation-link-angle: -69deg;
    top: 57px;
    left: 18px;
    width: 32px;
    animation-delay: 1.41s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-link--eight {
    --constellation-link-angle: -30deg;
    top: 27px;
    left: 30px;
    width: 29px;
    animation-delay: 1.49s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pulse {
    position: absolute;
    width: 8px;
    height: 8px;
    background: radial-gradient(circle, #fff 0 20%, #93c5fd 42%, rgba(250, 204, 21, 0.5) 66%, transparent 74%);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.96));
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.45) rotate(0deg);
    animation: frame-constellation-star-pulse 2.6s ease-in-out infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pulse--top {
    top: 10px;
    left: 58px;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pulse--right {
    top: 25px;
    left: 84px;
    width: 5px;
    height: 5px;
    animation-delay: 0.14s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pulse--bottom {
    top: 103px;
    left: 56px;
    animation-delay: 0.3s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pulse--left {
    top: 57px;
    left: 18px;
    width: 6px;
    height: 6px;
    animation-delay: 1.38s;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pulse--upper-left {
    top: 27px;
    left: 30px;
    width: 5px;
    height: 5px;
    animation-delay: 1.52s;
  }

  // 星轨收束后由固定笔尖写出一小段墨痕；仅笔迹伸展并晕散，毛笔原画不参与变换。
  .avatar-frame--note-constellation .avatar-frame__constellation-pen {
    z-index: 6;
    top: 85px;
    left: 67px;
    width: 19px;
    height: 7px;
    transform: rotate(-18deg);
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pen::before,
  .avatar-frame--note-constellation .avatar-frame__constellation-pen::after {
    content: '';
    position: absolute;
    opacity: 0;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pen::before {
    top: 3px;
    right: 0;
    width: 100%;
    height: 1.2px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(30, 58, 138, 0.04), rgba(96, 165, 250, 0.74) 44%, rgba(253, 230, 138, 0.9));
    box-shadow: 0 0 2px rgba(147, 197, 253, 0.58);
    transform: scaleX(0);
    transform-origin: right center;
    animation: frame-constellation-pen-write 7.6s ease-out 0.9s infinite;
  }

  .avatar-frame--note-constellation .avatar-frame__constellation-pen::after {
    top: 1.8px;
    left: -1px;
    width: 3px;
    height: 3px;
    border-radius: 48% 52% 58% 42%;
    background: rgba(23, 37, 84, 0.82);
    box-shadow: 0 0 3px rgba(96, 165, 250, 0.66);
    animation: frame-constellation-ink-drop 7.6s ease-out 0.9s infinite;
  }

  /* 寰宇云藏:阁楼云环固定;云海辉光沿环缓涌,阁楼灯火隐现天际,卷轴与星点错相辉映。 */
  .avatar-frame--dynamic.avatar-frame--file-constellation .avatar-frame__art {
    animation: frame-cloudvault-light 5.6s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--back::before {
    inset: 15px;
    border: 1px solid transparent;
    border-top-color: rgba(219, 234, 254, 0.7);
    border-right-color: rgba(253, 230, 138, 0.5);
    border-radius: 50%;
    filter: drop-shadow(0 0 2px rgba(147, 197, 253, 0.6));
    animation: frame-legend-ring-spin 11s linear infinite;
  }

  // 云海流动:蒙版罩住三处云区,辉光起伏并整体缓移,云与圆环像素不动。
  .avatar-frame--file-constellation .avatar-frame__art-detail {
    opacity: 0;
    filter: brightness(1.4) saturate(1.06) drop-shadow(0 0 3px rgba(191, 219, 254, 0.7));
    -webkit-mask-image:
      radial-gradient(circle at 18% 60%, #000 0 14%, transparent 52%),
      radial-gradient(circle at 82% 26%, #000 0 10%, transparent 44%),
      radial-gradient(circle at 78% 74%, #000 0 10%, transparent 44%);
    mask-image:
      radial-gradient(circle at 18% 60%, #000 0 14%, transparent 52%),
      radial-gradient(circle at 82% 26%, #000 0 10%, transparent 44%),
      radial-gradient(circle at 78% 74%, #000 0 10%, transparent 44%);
    -webkit-mask-position: 18% 60%, 82% 26%, 78% 74%;
    mask-position: 18% 60%, 82% 26%, 78% 74%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-cloudvault-cloud-flow 6.4s ease-in-out infinite;
  }

  // 两股云流只显隐原画云区像素；局部蒙版移动，阁楼、圆环与书页本体保持固定。
  .avatar-frame--file-constellation .avatar-frame__cloudvault-current {
    z-index: 4;
    top: 50%;
    left: 50%;
    display: block;
    width: var(--frame-art-size);
    height: var(--frame-art-size);
    object-fit: contain;
    opacity: 0;
    transform: translate(-50%, -50%);
    filter: brightness(1.3) saturate(1.08) drop-shadow(0 0 3px rgba(147, 197, 253, 0.52));
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    user-select: none;
    -webkit-user-drag: none;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-current--left {
    clip-path: polygon(0 4%, 61% 4%, 61% 100%, 0 100%);
    -webkit-mask-image: linear-gradient(142deg, transparent 32%, #000 45%, #000 57%, transparent 70%);
    mask-image: linear-gradient(142deg, transparent 32%, #000 45%, #000 57%, transparent 70%);
    -webkit-mask-size: 245% 245%;
    mask-size: 245% 245%;
    animation: frame-cloudvault-current-left 7.4s linear infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-current--right {
    clip-path: polygon(46% 0, 100% 0, 100% 100%, 46% 100%);
    filter: brightness(1.26) saturate(1.04) drop-shadow(0 0 3px rgba(253, 230, 138, 0.4));
    -webkit-mask-image: linear-gradient(28deg, transparent 33%, #000 46%, #000 56%, transparent 69%);
    mask-image: linear-gradient(28deg, transparent 33%, #000 46%, #000 56%, transparent 69%);
    -webkit-mask-size: 250% 250%;
    mask-size: 250% 250%;
    animation: frame-cloudvault-current-right 8.6s linear -2.8s infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-event {
    z-index: 6;
    top: 50%;
    left: 50%;
    width: var(--frame-effect-size);
    height: var(--frame-effect-size);
    overflow: visible;
    transform: translate(-50%, -50%);
  }

  // 文件星片由右侧书页与底部卷轴分两拨释放，沿头像孔外缘匀速汇入顶部星门。
  .avatar-frame--file-constellation .avatar-frame__cloudvault-file {
    position: absolute;
    top: var(--cloudvault-file-top);
    left: var(--cloudvault-file-left);
    width: var(--cloudvault-file-width);
    height: var(--cloudvault-file-height);
    box-sizing: border-box;
    border: 0.7px solid rgba(253, 230, 138, 0.76);
    border-radius: 1px;
    background: linear-gradient(135deg, rgba(219, 234, 254, 0.72), #fff 48%, rgba(147, 197, 253, 0.62));
    box-shadow: 0 0 4px rgba(147, 197, 253, 0.86), 0 0 2px rgba(254, 240, 138, 0.58);
    opacity: 0;
    transform: translate(0, 0) rotate(var(--cloudvault-file-angle));
    animation: frame-cloudvault-file-rise 6.2s linear var(--cloudvault-file-delay) infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file::after {
    position: absolute;
    top: 1px;
    right: 1px;
    left: 1px;
    height: 0.7px;
    background: rgba(96, 165, 250, 0.72);
    content: '';
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--one {
    --cloudvault-file-top: 44px;
    --cloudvault-file-left: 94px;
    --cloudvault-file-width: 7px;
    --cloudvault-file-height: 4.5px;
    --cloudvault-file-angle: -18deg;
    --cloudvault-file-delay: 0s;
    --cloudvault-file-x1: -5px;
    --cloudvault-file-y1: -8px;
    --cloudvault-file-x2: -18px;
    --cloudvault-file-y2: -23px;
    --cloudvault-file-x3: -36px;
    --cloudvault-file-y3: -37px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--two {
    --cloudvault-file-top: 50px;
    --cloudvault-file-left: 91px;
    --cloudvault-file-width: 4.5px;
    --cloudvault-file-height: 4.5px;
    --cloudvault-file-angle: 28deg;
    --cloudvault-file-delay: 0.14s;
    --cloudvault-file-x1: 3px;
    --cloudvault-file-y1: -10px;
    --cloudvault-file-x2: -10px;
    --cloudvault-file-y2: -28px;
    --cloudvault-file-x3: -32px;
    --cloudvault-file-y3: -43px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--three {
    --cloudvault-file-top: 55px;
    --cloudvault-file-left: 95px;
    --cloudvault-file-width: 6px;
    --cloudvault-file-height: 3.5px;
    --cloudvault-file-angle: 12deg;
    --cloudvault-file-delay: 0.28s;
    --cloudvault-file-x1: 0px;
    --cloudvault-file-y1: -16px;
    --cloudvault-file-x2: -15px;
    --cloudvault-file-y2: -38px;
    --cloudvault-file-x3: -37px;
    --cloudvault-file-y3: -48px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--four {
    --cloudvault-file-top: 60px;
    --cloudvault-file-left: 90px;
    --cloudvault-file-width: 5px;
    --cloudvault-file-height: 5px;
    --cloudvault-file-angle: -36deg;
    --cloudvault-file-delay: 0.42s;
    --cloudvault-file-x1: 5px;
    --cloudvault-file-y1: -15px;
    --cloudvault-file-x2: -5px;
    --cloudvault-file-y2: -42px;
    --cloudvault-file-x3: -32px;
    --cloudvault-file-y3: -53px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--five {
    --cloudvault-file-top: 101px;
    --cloudvault-file-left: 62px;
    --cloudvault-file-width: 7px;
    --cloudvault-file-height: 4px;
    --cloudvault-file-angle: 20deg;
    --cloudvault-file-delay: 1.8s;
    --cloudvault-file-x1: 26px;
    --cloudvault-file-y1: -13px;
    --cloudvault-file-x2: 32px;
    --cloudvault-file-y2: -67px;
    --cloudvault-file-x3: -4px;
    --cloudvault-file-y3: -92px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--six {
    --cloudvault-file-top: 102px;
    --cloudvault-file-left: 66px;
    --cloudvault-file-width: 4px;
    --cloudvault-file-height: 4px;
    --cloudvault-file-angle: -42deg;
    --cloudvault-file-delay: 1.95s;
    --cloudvault-file-x1: 22px;
    --cloudvault-file-y1: -14px;
    --cloudvault-file-x2: 28px;
    --cloudvault-file-y2: -70px;
    --cloudvault-file-x3: -8px;
    --cloudvault-file-y3: -94px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--seven {
    --cloudvault-file-top: 98px;
    --cloudvault-file-left: 58px;
    --cloudvault-file-width: 6px;
    --cloudvault-file-height: 3.5px;
    --cloudvault-file-angle: -14deg;
    --cloudvault-file-delay: 2.1s;
    --cloudvault-file-x1: -38px;
    --cloudvault-file-y1: -10px;
    --cloudvault-file-x2: -40px;
    --cloudvault-file-y2: -66px;
    --cloudvault-file-x3: 0px;
    --cloudvault-file-y3: -90px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-file--eight {
    --cloudvault-file-top: 100px;
    --cloudvault-file-left: 53px;
    --cloudvault-file-width: 4.5px;
    --cloudvault-file-height: 4.5px;
    --cloudvault-file-angle: 48deg;
    --cloudvault-file-delay: 2.25s;
    --cloudvault-file-x1: -34px;
    --cloudvault-file-y1: -14px;
    --cloudvault-file-x2: -35px;
    --cloudvault-file-y2: -68px;
    --cloudvault-file-x3: 5px;
    --cloudvault-file-y3: -92px;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-gate {
    position: absolute;
    width: 10px;
    height: 10px;
    background: radial-gradient(circle, #fff 0 18%, #93c5fd 42%, rgba(253, 230, 138, 0.42) 66%, transparent 74%);
    clip-path: polygon(50% 0, 64% 36%, 100% 50%, 64% 64%, 50% 100%, 36% 64%, 0 50%, 36% 36%);
    filter: drop-shadow(0 0 4px rgba(147, 197, 253, 0.92));
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5) rotate(0deg);
    animation: frame-cloudvault-gate-pulse 6.2s ease-in-out var(--cloudvault-gate-delay) infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-gate--top {
    --cloudvault-gate-delay: 2.3s;
    top: 8px;
    left: 58px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-gate--bottom {
    --cloudvault-gate-delay: 0s;
    top: 106px;
    left: 58px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-window {
    position: absolute;
    width: 2.2px;
    height: 2.2px;
    border-radius: 50%;
    background: #fef3c7;
    box-shadow: 0 0 3px rgba(251, 191, 36, 0.92);
    opacity: 0;
    animation: frame-cloudvault-window-light 6.2s ease-in-out var(--cloudvault-window-delay) infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-window--one {
    --cloudvault-window-delay: 0s;
    top: 31px;
    left: 18px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-window--two {
    --cloudvault-window-delay: 0.24s;
    top: 36px;
    left: 21px;
  }

  .avatar-frame--file-constellation .avatar-frame__cloudvault-window--three {
    --cloudvault-window-delay: 0.48s;
    top: 42px;
    left: 18px;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front::before {
    top: 16px;
    left: 15px;
    width: 15px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(ellipse at 50% 58%, rgba(255, 231, 166, 0.8), rgba(251, 191, 36, 0.22) 52%, transparent 76%);
    filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.45));
    animation: frame-cloudvault-pavilion 5.8s ease-in-out infinite;
  }

  // 原画云环自带星光点缀,由云海辉光轮流点亮即可;不再叠加悬空圆点星。
  .avatar-frame--file-constellation .avatar-frame__motion--back i {
    display: none;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front::after {
    right: 24px;
    bottom: 9px;
    width: 16px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(90deg, transparent, rgba(255, 251, 235, 0.75) 50%, transparent);
    animation: frame-cloudvault-scroll-glint 5s -2.5s ease-in-out infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i {
    --cloudvault-dust-x: 8px;
    --cloudvault-dust-y: -8px;
    display: block;
    width: 2.5px;
    height: 2.5px;
    background: #fef3c7;
    box-shadow: 0 0 4px rgba(250, 204, 21, 0.78);
    animation: frame-cloudvault-stardust 5.6s linear infinite;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(1) {
    top: 23px;
    left: 5px;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(2) {
    --cloudvault-dust-x: -7px;
    --cloudvault-dust-y: 8px;
    top: 12px;
    right: 18px;
    animation-delay: -1.4s;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(3) {
    --cloudvault-dust-x: -10px;
    --cloudvault-dust-y: -9px;
    right: 4px;
    bottom: 16px;
    animation-delay: -2.8s;
  }

  .avatar-frame--file-constellation .avatar-frame__motion--front i:nth-child(4) {
    --cloudvault-dust-x: 8px;
    --cloudvault-dust-y: -7px;
    bottom: 8px;
    left: 18px;
    animation-delay: -4.2s;
  }

  /* 岁序长明:年轮主体固定;三只不对称翼错相轻扬如季节波浪,辉光沿环一巡依次映亮四季,星冠长明呼吸,四季微粒各自飘舞。 */
  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__art {
    animation: frame-eternal-time-light 6.4s ease-in-out infinite;
  }

  // 三翼分层素材与底图同画布,压在环体下方;各自以翼根为锚点错相轻扬,
  // 同周期负延迟形成春→秋→冬依次传递的波浪,与巡回辉光同向呼应。
  .avatar-frame--streak-eternal .avatar-frame__wing-layer--spring {
    --wing-sway: -7deg;
    transform-origin: 22.92% 39.06%;
  }

  .avatar-frame--streak-eternal .avatar-frame__wing-layer--autumn {
    --wing-sway: 6.4deg;
    transform-origin: 81.25% 36.46%;
  }

  .avatar-frame--streak-eternal .avatar-frame__wing-layer--winter {
    --wing-sway: -6.2deg;
    transform-origin: 72.92% 70.31%;
  }

  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__wing-layer {
    animation: frame-eternal-wing-sway 4.4s ease-in-out infinite;
    will-change: transform;
  }

  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__wing-layer--autumn {
    animation-delay: -1.47s;
  }

  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__wing-layer--winter {
    animation-delay: -2.93s;
  }

  // 四季粒子群:春樱瓣、夏流萤、秋枫叶、冬雪花各三颗,按季节区分布,错峰飘落/上浮。
  .avatar-frame__eternal-motes {
    inset: 0;
    z-index: 5;
  }

  .avatar-frame__eternal-motes i {
    position: absolute;
    top: var(--mote-y);
    left: var(--mote-x);
    opacity: 0;
  }

  .avatar-frame__eternal-mote--petal {
    width: 4.6px;
    height: 3.6px;
    border-radius: 68% 24% 62% 30%;
    background: linear-gradient(135deg, #fdd5e4, #f9a8d4 68%, #f472b6);
  }

  .avatar-frame__eternal-mote--leaf {
    width: 4.8px;
    height: 3.4px;
    border-radius: 20% 76% 24% 72%;
    background: linear-gradient(120deg, #fcd34d, #f59e0b 62%, #dc7b26);
  }

  .avatar-frame__eternal-mote--snow {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #f4f8ff;
    box-shadow: 0 0 3px rgba(191, 219, 254, 0.9);
  }

  .avatar-frame__eternal-mote--firefly {
    width: 2.6px;
    height: 2.6px;
    border-radius: 50%;
    background: #fef3c7;
    box-shadow: 0 0 4px rgba(252, 211, 77, 0.95);
  }

  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__eternal-mote--petal,
  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__eternal-mote--leaf,
  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__eternal-mote--snow {
    animation: frame-eternal-mote-fall var(--mote-duration) var(--mote-delay) ease-in-out infinite;
  }

  .avatar-frame--dynamic.avatar-frame--streak-eternal .avatar-frame__eternal-mote--firefly {
    animation: frame-eternal-mote-rise var(--mote-duration) var(--mote-delay) ease-in-out infinite;
  }

  // 凤翼羽辉由四季流转的巡回辉光顺带点亮(翼体即春/冬季区),不再叠加独立光斑。

  // 环体显示直径约 80px,年轮光弧贴环带运行,不悬空压过凤翼与星冠。
  .avatar-frame--streak-eternal .avatar-frame__motion--back::before {
    inset: 19px;
    border: 1px solid transparent;
    border-top-color: rgba(254, 240, 138, 0.85);
    border-right-color: rgba(196, 181, 253, 0.6);
    border-radius: 50%;
    animation: frame-legend-ring-spin 11s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--back::after {
    inset: 22px;
    border: 1px solid transparent;
    border-bottom-color: rgba(125, 211, 252, 0.72);
    border-left-color: rgba(251, 191, 36, 0.66);
    border-radius: 50%;
    animation: frame-legend-ring-spin 8.6s linear infinite reverse;
  }

  // 四季流转:高亮辉斑沿画布四角一年一巡,春樱、夏木、秋叶、冬雪依次被点亮。
  .avatar-frame--streak-eternal .avatar-frame__art-detail {
    opacity: 0.36;
    filter: brightness(1.5) saturate(1.14) drop-shadow(0 0 4px rgba(253, 230, 138, 0.7));
    -webkit-mask-image: radial-gradient(circle, #000 0 17%, transparent 42%);
    mask-image: radial-gradient(circle, #000 0 17%, transparent 42%);
    -webkit-mask-size: 165% 165%;
    mask-size: 165% 165%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    animation: frame-eternal-season-tour 16s linear infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front::before {
    top: 10px;
    left: 50%;
    width: 14px;
    height: 14px;
    margin-left: -7px;
    border-radius: 50%;
    background: radial-gradient(circle, #fffceb 0 16%, #fde68a 36%, rgba(245, 158, 11, 0.32) 68%, transparent 74%);
    filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.85));
    animation: frame-eternal-crown-flame 4.2s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front::after {
    bottom: 5px;
    left: 50%;
    width: 9px;
    height: 9px;
    margin-left: -4.5px;
    background: linear-gradient(135deg, #fffdf5, #fde68a 48%, #fef3c7);
    clip-path: polygon(50% 0, 74% 50%, 50% 100%, 26% 50%);
    filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.85));
    animation: frame-eternal-gem-glint 4.6s -2.3s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i {
    box-shadow: none;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(1) {
    top: 30px;
    left: 6px;
    width: 4px;
    height: 6px;
    border-radius: 72% 16% 68% 34%;
    background: #f9a8d4;
    animation: frame-eternal-petal-drift 5.2s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(2) {
    left: 20px;
    bottom: 20px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #d9f99d;
    box-shadow: 0 0 4px rgba(163, 230, 53, 0.8);
    animation: frame-eternal-firefly 4.4s -1.4s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(3) {
    top: 26px;
    right: 8px;
    width: 4px;
    height: 6px;
    border-radius: 78% 14% 76% 26%;
    background: linear-gradient(155deg, #fdba74, #ea580c 76%);
    animation: frame-eternal-leaf-drift 5.6s -2s ease-in-out infinite;
  }

  .avatar-frame--streak-eternal .avatar-frame__motion--front i:nth-child(4) {
    right: 22px;
    bottom: 16px;
    width: 4px;
    height: 4px;
    background: #f0f9ff;
    clip-path: polygon(50% 0, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0 50%, 37% 37%);
    animation: frame-eternal-snow-drift 6s -3s ease-in-out infinite;
  }

  @keyframes frame-gold-material-flow {
    0% {
      opacity: 0.16;
      filter: brightness(1.22) saturate(1.04) drop-shadow(0 0 1px rgba(251, 191, 36, 0.38));
      -webkit-mask-position: 135% 130%;
      mask-position: 135% 130%;
    }
    38% {
      opacity: 0.78;
      filter: brightness(1.5) saturate(1.12) drop-shadow(0 0 3px rgba(251, 191, 36, 0.76));
    }
    68% {
      opacity: 0.42;
    }
    100% {
      opacity: 0.16;
      filter: brightness(1.22) saturate(1.04) drop-shadow(0 0 1px rgba(251, 191, 36, 0.38));
      -webkit-mask-position: -45% -35%;
      mask-position: -45% -35%;
    }
  }

  @keyframes frame-gold-glint {
    0%,
    100% {
      opacity: 0.24;
      transform: translateX(-50%) rotate(45deg) scale(0.72);
    }
    42% {
      opacity: 1;
      transform: translateX(-50%) rotate(45deg) scale(1.28);
    }
    68% {
      opacity: 0.62;
      transform: translateX(-50%) rotate(45deg) scale(0.92);
    }
  }

  @keyframes frame-gold-fleck {
    0%,
    100% {
      opacity: 0.16;
      transform: translate(0, 2px) scale(0.72);
    }
    42% {
      opacity: 0.92;
      transform: translate(3px, -3px) scale(1.12);
    }
    68% {
      opacity: 0.48;
      transform: translate(1px, -1px) scale(0.88);
    }
  }

  @keyframes frame-sakura-blossom-shimmer {
    0%,
    100% {
      opacity: 0.16;
      filter: brightness(1.14) saturate(1.04) drop-shadow(0 0 1px rgba(251, 113, 133, 0.3));
      transform: translate(-50%, -50%);
    }
    36% {
      opacity: 0.74;
      filter: brightness(1.42) saturate(1.14) drop-shadow(0 0 3px rgba(251, 113, 133, 0.7));
      transform: translate(-50%, -50%);
    }
    68% {
      opacity: 0.38;
      filter: brightness(1.26) saturate(1.08) drop-shadow(0 0 2px rgba(251, 113, 133, 0.48));
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-sakura-pollen-glint {
    0%,
    100% {
      opacity: 0.22;
      transform: scale(0.66);
    }
    42% {
      opacity: 0.96;
      transform: scale(1.24);
    }
    70% {
      opacity: 0.52;
      transform: scale(0.88);
    }
  }

  @keyframes frame-petal-drift {
    0%,
    100% {
      opacity: 0.2;
      transform: translate(0, -2px) rotate(-20deg);
    }
    35% {
      opacity: 0.95;
    }
    70% {
      opacity: 0.55;
      transform: translate(14px, 18px) rotate(115deg);
    }
  }

  @keyframes frame-sunset-cloud-drift-left {
    0%,
    100% {
      transform: translate(-50%, -50%) translate3d(-3.2px, 0.8px, 0);
    }
    50% {
      transform: translate(-50%, -50%) translate3d(3.6px, -1.2px, 0);
    }
  }

  @keyframes frame-sunset-cloud-drift-right {
    0%,
    100% {
      transform: translate(-50%, -50%) translate3d(3.2px, 0.8px, 0);
    }
    50% {
      transform: translate(-50%, -50%) translate3d(-3.6px, -1.2px, 0);
    }
  }

  @keyframes frame-achievement-material-flow {
    0%,
    100% {
      opacity: 0.14;
      filter: brightness(1.04) saturate(1.04) drop-shadow(0 0 0 transparent);
      transform: translate(-50%, -50%);
      -webkit-mask-position: 135% 125%;
      mask-position: 135% 125%;
    }
    42% {
      opacity: 0.82;
      filter: brightness(1.5) saturate(1.2) drop-shadow(0 0 3px var(--frame-glow));
      transform: translate(-50%, -50%);
    }
    72% {
      opacity: 0.38;
      filter: brightness(1.2) saturate(1.08) drop-shadow(0 0 2px var(--frame-glow));
      transform: translate(-50%, -50%);
    }
    99.9% {
      -webkit-mask-position: -35% -25%;
      mask-position: -35% -25%;
    }
  }

  .avatar-frame--streak-month .avatar-frame__art-detail,
  .avatar-frame--note-masterpiece .avatar-frame__art-detail,
  .avatar-frame--file-vault .avatar-frame__art-detail,
  .avatar-frame--bookmark-corridor .avatar-frame__art-detail {
    -webkit-mask-image: linear-gradient(118deg, transparent 31%, #000 44%, #000 57%, transparent 70%);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: 230% 230%;
    mask-image: linear-gradient(118deg, transparent 31%, #000 44%, #000 57%, transparent 70%);
    mask-repeat: no-repeat;
    mask-size: 230% 230%;
  }

  @keyframes frame-moon-orbit-glint {
    0% {
      opacity: 0.34;
      transform: rotate(0deg);
    }
    46% {
      opacity: 0.94;
    }
    100% {
      opacity: 0.34;
      transform: rotate(360deg);
    }
  }

  @keyframes frame-note-current-glide {
    0%,
    100% {
      opacity: 0.2;
      transform: translate3d(-3px, 1px, 0) scaleX(0.82);
    }
    50% {
      opacity: 0.86;
      transform: translate3d(3px, -1px, 0) scaleX(1.08);
    }
  }

  @keyframes frame-vault-cloud-current {
    0%,
    100% {
      opacity: 0.22;
      transform: translate3d(-2px, 1px, 0) scaleX(0.84);
    }
    50% {
      opacity: 0.82;
      transform: translate3d(2px, -1px, 0) scaleX(1.08);
    }
  }

  @keyframes frame-vault-gate-light {
    0%,
    100% {
      opacity: 0.24;
      transform: scaleY(0.72);
    }
    50% {
      opacity: 0.88;
      transform: scaleY(1.04);
    }
  }

  @keyframes frame-corridor-gate-light {
    0%,
    100% {
      opacity: 0.12;
    }
    46% {
      opacity: 0.58;
    }
    64% {
      opacity: 0.38;
    }
  }

  @keyframes frame-corridor-floor-glint {
    0% {
      opacity: 0.12;
      background-position: 120% 0;
    }
    50% {
      opacity: 0.58;
    }
    100% {
      opacity: 0.12;
      background-position: -20% 0;
    }
  }

  @keyframes frame-corridor-bookmark-glint {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(2px) scale(0.78);
    }
    50% {
      opacity: 0.78;
      transform: translateY(-2px) scale(1.04);
    }
  }

  @keyframes frame-moonlight-breathe {
    0%,
    100% {
      filter: drop-shadow(0 0 3px var(--frame-glow)) brightness(0.94);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: drop-shadow(0 0 5px var(--frame-glow)) brightness(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-moon-phase-travel {
    0%,
    100% {
      opacity: 0.3;
      transform: rotate(-58deg) translateY(1px) scale(0.7);
    }
    50% {
      opacity: 1;
      transform: rotate(58deg) translateY(-1px) scale(1.2);
    }
  }

  @keyframes frame-local-pulse {
    0%,
    100% {
      opacity: 0.32;
      transform: scale(0.82);
    }
    50% {
      opacity: 1;
      transform: scale(1.16);
    }
  }

  @keyframes frame-moon-star-twinkle {
    0%,
    100% {
      opacity: 0.24;
      filter: brightness(0.94);
      transform: translateY(1px) scale(0.72) rotate(0deg);
    }
    50% {
      opacity: 0.92;
      filter: brightness(1.3);
      transform: translateY(-1px) scale(1.12) rotate(45deg);
    }
  }

  @keyframes frame-note-water-flow {
    0%,
    100% {
      opacity: 0.16;
      filter: brightness(1.02) saturate(1.02);
      transform: translate(-50%, -50%);
    }
    46% {
      opacity: 0.82;
      filter: brightness(1.42) saturate(1.24) hue-rotate(-5deg);
      transform: translate(-50%, -50%);
    }
    72% {
      opacity: 0.42;
      filter: brightness(1.16) saturate(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-ink-current {
    0%,
    100% {
      opacity: 0.32;
      transform: translateX(-4px) scaleX(0.82);
    }
    50% {
      opacity: 1;
      transform: translateX(4px) scaleX(1.1);
    }
  }

  @keyframes frame-note-river-glint {
    0%,
    100% {
      opacity: 0.18;
      transform: translateX(-5px) scaleX(0.64) skewX(-8deg);
    }
    48% {
      opacity: 0.84;
      transform: translateX(5px) scaleX(1.04) skewX(6deg);
    }
    72% {
      opacity: 0.42;
      transform: translateX(2px) scaleX(0.82) skewX(-2deg);
    }
  }

  @keyframes frame-river-spark {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.6);
    }
    35% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(35px, -7px) scale(1.1);
    }
  }

  @keyframes frame-vault-metal-light {
    0%,
    100% {
      filter: brightness(0.98) saturate(1.04) hue-rotate(5deg);
      transform: translate(-50%, -50%);
    }
    50% {
      filter: brightness(1.08) saturate(1.2) hue-rotate(16deg);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-vault-cloud-gate {
    0%,
    100% {
      opacity: 0.22;
      filter: brightness(1.04) saturate(1.08) hue-rotate(5deg) drop-shadow(0 0 1px rgba(96, 165, 250, 0.35));
      transform: translate(-50%, -50%);
    }
    42% {
      opacity: 0.94;
      filter: brightness(1.52) saturate(1.42) hue-rotate(16deg) drop-shadow(0 0 5px rgba(96, 165, 250, 0.9));
      transform: translate(-50%, -50%);
    }
    72% {
      opacity: 0.5;
      filter: brightness(1.22) saturate(1.22) hue-rotate(10deg) drop-shadow(0 0 2px rgba(96, 165, 250, 0.55));
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-vault-energy-curtain {
    0%,
    100% {
      opacity: 0.2;
      filter: brightness(0.94) saturate(0.92);
      transform: scaleY(0.72);
    }
    42% {
      opacity: 0.9;
      filter: brightness(1.28) saturate(1.18);
      transform: scaleY(1);
    }
    72% {
      opacity: 0.5;
      filter: brightness(1.08) saturate(1.06);
      transform: scaleY(0.86);
    }
  }

  @keyframes frame-vault-door-shine {
    0%,
    100% {
      opacity: 0.34;
      transform: rotate(-18deg) scale(0.76);
    }
    42% {
      opacity: 1;
      transform: rotate(0deg) scale(1.28);
    }
    72% {
      opacity: 0.56;
      transform: rotate(18deg) scale(0.88);
    }
  }

  @keyframes frame-vault-cloud-rise {
    0%,
    100% {
      opacity: 0.24;
      transform: translateY(3px) scaleX(0.66);
    }
    42% {
      opacity: 1;
      transform: translateY(-4px) scaleX(1.16);
    }
    72% {
      opacity: 0.42;
      transform: translateY(-1px) scaleX(0.9);
    }
  }

  @keyframes frame-vault-cloud-drift {
    0%,
    100% {
      opacity: 0.34;
      transform: translateX(-4px) scaleX(0.76);
    }
    50% {
      opacity: 1;
      transform: translateX(4px) scaleX(1.14);
    }
  }

  @keyframes frame-vault-data-rise {
    0% {
      opacity: 0;
      transform: translateY(4px) rotate(0deg) scale(0.62);
    }
    18% {
      opacity: 0.94;
    }
    55% {
      opacity: 1;
      transform: translateY(-8px) rotate(45deg) scale(1.12);
    }
    100% {
      opacity: 0;
      transform: translateY(-15px) rotate(90deg) scale(0.72);
    }
  }

  @keyframes frame-ocean-surge {
    0% {
      opacity: 0.08;
      filter: brightness(1.12) saturate(1.08) contrast(1.02);
      -webkit-mask-position: 50% 125%;
      mask-position: 50% 125%;
    }
    46% {
      opacity: 0.98;
      filter: brightness(1.55) saturate(1.3) contrast(1.08) drop-shadow(0 0 2px rgba(125, 211, 252, 0.72));
    }
    100% {
      opacity: 0.1;
      filter: brightness(1.14) saturate(1.1) contrast(1.03);
      -webkit-mask-position: 50% -25%;
      mask-position: 50% -25%;
    }
  }

  @keyframes frame-ocean-crest-sway {
    0% {
      opacity: 0.1;
      filter: brightness(1.14) saturate(1.1) contrast(1.03);
      -webkit-mask-position: 125% 50%;
      mask-position: 125% 50%;
    }
    52% {
      opacity: 1;
      filter: brightness(1.58) saturate(1.32) contrast(1.09) drop-shadow(0 0 2.2px rgba(186, 230, 253, 0.78));
    }
    100% {
      opacity: 0.11;
      filter: brightness(1.15) saturate(1.11) contrast(1.03);
      -webkit-mask-position: -25% 50%;
      mask-position: -25% 50%;
    }
  }

  @keyframes frame-ocean-return-flow {
    0% {
      opacity: 0.08;
      filter: brightness(1.12) saturate(1.08) contrast(1.02);
      -webkit-mask-position: -25% 50%;
      mask-position: -25% 50%;
    }
    46% {
      opacity: 0.92;
      filter: brightness(1.5) saturate(1.26) contrast(1.07) drop-shadow(0 0 1.8px rgba(125, 211, 252, 0.7));
    }
    100% {
      opacity: 0.1;
      filter: brightness(1.13) saturate(1.09) contrast(1.03);
      -webkit-mask-position: 125% 50%;
      mask-position: 125% 50%;
    }
  }

  @keyframes frame-ocean-foam-lilt-left {
    0%,
    100% {
      opacity: 0.28;
      transform: translate3d(-0.8px, 0.6px, 0) rotate(-22deg) scaleX(0.84);
    }
    50% {
      opacity: 1;
      transform: translate3d(3.6px, -1.8px, 0) rotate(-16deg) scaleX(1.18);
    }
  }

  @keyframes frame-ocean-foam-lilt-right {
    0%,
    100% {
      opacity: 0.3;
      transform: translate3d(0.8px, -0.5px, 0) rotate(118deg) scaleX(0.86);
    }
    50% {
      opacity: 1;
      transform: translate3d(-3.2px, 1.7px, 0) rotate(112deg) scaleX(1.16);
    }
  }

  @keyframes frame-ocean-bubble-drift-left {
    0%,
    100% {
      opacity: 0.32;
      transform: translate3d(-0.7px, 0.8px, 0) scale(0.78);
    }
    50% {
      opacity: 1;
      transform: translate3d(4.4px, -3.4px, 0) scale(1.14);
    }
  }

  @keyframes frame-ocean-bubble-drift-right {
    0%,
    100% {
      opacity: 0.34;
      transform: translate3d(0.6px, 0.7px, 0) scale(0.8);
    }
    50% {
      opacity: 1;
      transform: translate3d(-4.2px, -3.6px, 0) scale(1.16);
    }
  }

  @keyframes frame-aurora-source-flow-left {
    0%,
    100% {
      opacity: 0.1;
      filter: brightness(1.04) saturate(1.06) drop-shadow(0 0 1px rgba(103, 232, 249, 0.34));
      transform: translate(-50%, -50%);
      -webkit-mask-position: 120% 115%;
      mask-position: 120% 115%;
    }
    22% {
      opacity: 0.46;
    }
    52% {
      opacity: 0.92;
      filter: brightness(1.38) saturate(1.2) drop-shadow(0 0 3px rgba(103, 232, 249, 0.82));
    }
    78% {
      opacity: 0.42;
    }
    99.9% {
      transform: translate(-50%, -50%);
      -webkit-mask-position: -20% -12%;
      mask-position: -20% -12%;
    }
  }

  @keyframes frame-aurora-source-flow-right {
    0%,
    100% {
      opacity: 0.1;
      filter: brightness(1.04) saturate(1.06) drop-shadow(0 0 1px rgba(196, 181, 253, 0.34));
      transform: translate(-50%, -50%);
      -webkit-mask-position: -20% 110%;
      mask-position: -20% 110%;
    }
    22% {
      opacity: 0.44;
    }
    52% {
      opacity: 0.94;
      filter: brightness(1.4) saturate(1.22) drop-shadow(0 0 3px rgba(167, 139, 250, 0.84));
    }
    78% {
      opacity: 0.4;
    }
    99.9% {
      transform: translate(-50%, -50%);
      -webkit-mask-position: 120% -15%;
      mask-position: 120% -15%;
    }
  }

  @keyframes frame-aurora-crystal-charge {
    0%,
    100% {
      opacity: 0.2;
      filter: brightness(1.06) saturate(1.08) drop-shadow(0 0 1px rgba(129, 140, 248, 0.38));
      transform: translate(-50%, -50%);
    }
    34% {
      opacity: 0.56;
    }
    52% {
      opacity: 0.98;
      filter: brightness(1.52) saturate(1.22) drop-shadow(0 0 4px rgba(103, 232, 249, 0.92))
        drop-shadow(0 0 5px rgba(139, 92, 246, 0.62));
      transform: translate(-50%, -50%);
    }
    76% {
      opacity: 0.42;
    }
  }

  // 只保留两枚沿外沿上行的极光粒子。位移轨迹与左右晶羽弧度一致，
  // 从显现、上行到渐隐是一次连续运动，不能退化成原地闪烁。
  @keyframes frame-aurora-particle-left {
    0%,
    100% {
      opacity: 0;
      transform: translate3d(0, 4px, 0) rotate(-24deg) scale(0.62);
    }
    12% {
      opacity: 0.72;
    }
    38% {
      opacity: 0.96;
      transform: translate3d(3px, -14px, 0) rotate(-13deg) scale(0.92);
    }
    68% {
      opacity: 0.9;
      transform: translate3d(11px, -34px, 0) rotate(5deg) scale(1.08);
    }
    88% {
      opacity: 0.52;
      transform: translate3d(19px, -49px, 0) rotate(18deg) scale(0.88);
    }
    99.9% {
      opacity: 0;
      transform: translate3d(23px, -58px, 0) rotate(27deg) scale(0.64);
    }
  }

  @keyframes frame-aurora-particle-right {
    0%,
    100% {
      opacity: 0;
      transform: translate3d(0, 4px, 0) rotate(24deg) scale(0.62);
    }
    12% {
      opacity: 0.72;
    }
    38% {
      opacity: 0.96;
      transform: translate3d(-3px, -14px, 0) rotate(13deg) scale(0.92);
    }
    68% {
      opacity: 0.9;
      transform: translate3d(-11px, -34px, 0) rotate(-5deg) scale(1.08);
    }
    88% {
      opacity: 0.52;
      transform: translate3d(-19px, -49px, 0) rotate(-18deg) scale(0.88);
    }
    99.9% {
      opacity: 0;
      transform: translate3d(-23px, -58px, 0) rotate(-27deg) scale(0.64);
    }
  }

  @keyframes frame-flame-metal-light {
    0%,
    100% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 2px var(--frame-glow)) brightness(0.94) saturate(1.02);
    }
    50% {
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 5px var(--frame-glow)) brightness(1.18) saturate(1.1);
    }
  }

  @keyframes frame-flame-heat-sweep {
    0% {
      opacity: 0.24;
      -webkit-mask-position: 145% 125%;
      mask-position: 145% 125%;
      filter: brightness(1.08) saturate(1.08) drop-shadow(0 0 1px rgba(251, 146, 60, 0.46));
    }
    50% {
      opacity: 0.66;
      filter: brightness(1.42) saturate(1.22) drop-shadow(0 0 3px rgba(254, 178, 73, 0.78));
    }
    100% {
      opacity: 0.24;
      -webkit-mask-position: -45% -25%;
      mask-position: -45% -25%;
      filter: brightness(1.08) saturate(1.08) drop-shadow(0 0 1px rgba(251, 146, 60, 0.46));
    }
  }

  @keyframes frame-flame-heat-sweep-reverse {
    0% {
      opacity: 0.2;
      -webkit-mask-position: -38% 132%;
      mask-position: -38% 132%;
      filter: brightness(1.08) saturate(1.08);
    }
    50% {
      opacity: 0.58;
      filter: brightness(1.46) saturate(1.24) drop-shadow(0 0 3px rgba(255, 199, 88, 0.8));
    }
    100% {
      opacity: 0.2;
      -webkit-mask-position: 138% -32%;
      mask-position: 138% -32%;
      filter: brightness(1.08) saturate(1.08);
    }
  }

  // 位移段严格线性：火苗匀速抵达终点后不再移动，只在终点缓慢淡出。
  // 错峰的小火苗承担“燃烧感”，不移动主体框、圆环、龙头或双翼。
  @keyframes frame-flame-spark-rise {
    0% {
      opacity: 0;
      transform: translate(-50%, -100%) translateY(0) rotate(var(--flame-angle)) scale(0.76);
    }
    12% {
      opacity: 0.88;
      transform: translate(-50%, -100%) translateY(calc(var(--flame-rise) * -0.1667)) rotate(var(--flame-angle))
        scale(0.82);
    }
    72% {
      opacity: 0.88;
      transform: translate(-50%, -100%) translateY(calc(var(--flame-rise) * -1)) rotate(var(--flame-angle)) scale(0.98);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -100%) translateY(calc(var(--flame-rise) * -1)) rotate(var(--flame-angle)) scale(0.98);
    }
  }

  @keyframes frame-flame-real-embers {
    0%,
    100% {
      opacity: 0.22;
      transform: translate(-50%, -50%);
      filter: brightness(1.04) saturate(1.06) drop-shadow(0 0 1px rgba(249, 115, 22, 0.4));
    }
    42% {
      opacity: 0.64;
      transform: translate(-50%, -50%);
      filter: brightness(1.36) saturate(1.2) drop-shadow(0 0 3px rgba(254, 178, 73, 0.78));
    }
    72% {
      opacity: 0.38;
      transform: translate(-50%, -50%);
      filter: brightness(1.16) saturate(1.12) drop-shadow(0 0 2px rgba(251, 146, 60, 0.56));
    }
  }

  @keyframes frame-ember-rise {
    0% {
      opacity: 0;
      transform: translate(0, 4px) rotate(0deg) scale(0.6);
    }
    32% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-8px, -27px) rotate(140deg) scale(1.1);
    }
  }

  @keyframes frame-ember-rise-left {
    0% {
      opacity: 0;
      transform: translate(0, 4px) rotate(0deg) scale(0.55);
    }
    28% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(10px, -31px) rotate(-125deg) scale(1.08);
    }
  }

  @keyframes frame-flame-tongue {
    0%,
    100% {
      opacity: 0.44;
      filter: drop-shadow(0 0 2px #fb923c) drop-shadow(0 0 4px rgba(220, 38, 38, 0.52));
      transform: rotate(34deg) skewY(-4deg) translateY(1px);
    }
    38% {
      opacity: 0.86;
      filter: drop-shadow(0 0 3px #fde68a) drop-shadow(0 0 5px rgba(239, 68, 68, 0.68));
      transform: rotate(42deg) skewY(5deg) translate(-0.5px, -2px);
    }
    72% {
      opacity: 0.62;
      transform: rotate(38deg) skewY(-2deg) translate(0.5px, -1px);
    }
  }

  @keyframes frame-flame-hot-edge {
    0%,
    100% {
      opacity: 0.5;
      filter: drop-shadow(0 0 3px #fb923c) drop-shadow(0 0 6px rgba(220, 38, 38, 0.6));
      transform: rotate(-8deg);
    }
    44% {
      opacity: 1;
      filter: drop-shadow(0 0 6px #fde68a) drop-shadow(0 0 11px rgba(239, 68, 68, 0.88));
      transform: rotate(9deg);
    }
    72% {
      opacity: 0.76;
      transform: rotate(3deg);
    }
  }

  @keyframes frame-flame-material {
    0%,
    100% {
      opacity: 0.14;
      filter: brightness(1.04) saturate(1.04);
      transform: translate(-50%, -50%);
    }
    34% {
      opacity: 0.42;
      filter: brightness(1.18) saturate(1.14) drop-shadow(0 0 2px rgba(254, 215, 91, 0.64));
      transform: translate(-50%, -50%);
    }
    68% {
      opacity: 0.22;
      filter: brightness(1.1) saturate(1.08);
      transform: translate(-50%, -50%);
    }
  }

  @keyframes frame-flame-side-burn {
    0%,
    100% {
      opacity: 0.34;
      transform: rotate(var(--flame-side-angle)) translateY(1px) skewY(-4deg) scaleX(0.9) scaleY(0.88);
    }
    38% {
      opacity: 0.92;
      transform: rotate(var(--flame-side-angle)) translateY(-2px) skewY(7deg) scaleX(1.04) scaleY(1.08);
    }
    68% {
      opacity: 0.62;
      transform: rotate(var(--flame-side-angle)) translateY(-1px) skewY(-2deg) scaleX(0.97) scaleY(1.01);
    }
  }

  // 传说档共用:追光弧、星轨与巡回亮弧统一走一个旋转轨道,靠时长与方向区分节奏。
  @keyframes frame-legend-ring-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  // 翼辉开合:同源辉光在完整双翼上缓涨缓落;涨落节奏即"张合",翼体像素不动。
  @keyframes frame-neon-pulse {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(1)
        saturate(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.1)
        saturate(1.12);
    }
  }

  @keyframes frame-neon-pixel {
    0%,
    30%,
    74%,
    100% {
      opacity: 0;
    }
    36%,
    68% {
      opacity: 1;
    }
  }

  @keyframes frame-neon-crystal-charge {
    0%,
    100% {
      opacity: 0.08;
    }
    50% {
      opacity: 0.85;
    }
  }

  @keyframes frame-galaxy-breathe {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.08);
    }
  }

  @keyframes frame-galaxy-planet-orbit {
    from {
      transform: rotate(0deg) translateY(-45px);
    }
    to {
      transform: rotate(360deg) translateY(-45px);
    }
  }

  @keyframes frame-galaxy-planet-orbit-minor {
    from {
      transform: rotate(216deg) translateY(-41px);
    }
    to {
      transform: rotate(576deg) translateY(-41px);
    }
  }

  @keyframes frame-galaxy-flow {
    0% {
      opacity: 0;
      -webkit-mask-position: 128% 126%;
      mask-position: 128% 126%;
    }
    18% {
      opacity: 0.5;
    }
    82% {
      opacity: 0.5;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: -28% -26%;
      mask-position: -28% -26%;
    }
  }

  @keyframes frame-dragon-metal-light {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(1)
        saturate(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.035)
        saturate(1.05);
    }
  }

  @keyframes frame-dragon-focus-charge {
    0%,
    100% {
      opacity: 0.16;
      filter: brightness(1.36) saturate(1.12) drop-shadow(0 0 2px rgba(248, 113, 113, 0.48));
    }
    32% {
      opacity: 0.46;
    }
    40%,
    78% {
      opacity: 1;
      filter: brightness(2.2) saturate(1.42) drop-shadow(0 0 6px rgba(248, 113, 113, 0.98));
    }
    55%,
    90% {
      opacity: 0.34;
    }
  }

  @keyframes frame-dragon-trail-breathe {
    0%,
    100% {
      opacity: 0.04;
    }
    32% {
      opacity: 0.32;
    }
    58% {
      opacity: 0.1;
    }
    78% {
      opacity: 0.26;
    }
  }

  // 移动的是高光遮罩，不是图片层；固定 transform 永远不进入关键帧。
  @keyframes frame-dragon-energy-tour {
    0% {
      opacity: 0;
      -webkit-mask-position: 0% 48%;
      mask-position: 0% 48%;
    }
    8% {
      opacity: 0.24;
    }
    38% {
      opacity: 0.18;
      -webkit-mask-position: 46% 100%;
      mask-position: 46% 100%;
    }
    70% {
      opacity: 0.28;
      -webkit-mask-position: 100% 44%;
      mask-position: 100% 44%;
    }
    88% {
      opacity: 0.14;
      -webkit-mask-position: 66% 0%;
      mask-position: 66% 0%;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: 0% 48%;
      mask-position: 0% 48%;
    }
  }

  @keyframes frame-dragon-flame-breathe {
    0%,
    100% {
      opacity: 0.22;
      transform: scale(0.93);
    }
    50% {
      opacity: 0.62;
      transform: scale(1.045);
    }
  }

  @keyframes frame-dragon-energy-orbit {
    0% {
      opacity: 0.42;
      transform: translate(-28px, 0px) scale(0.78);
    }
    12.5% {
      opacity: 0.72;
      transform: translate(-20px, 20px) scale(0.88);
    }
    25% {
      opacity: 0.82;
      transform: translate(0px, 28px) scale(0.96);
    }
    37.5% {
      opacity: 0.9;
      transform: translate(20px, 20px) scale(1.04);
    }
    50% {
      opacity: 1;
      transform: translate(28px, 0px) scale(1.12);
    }
    62.5% {
      opacity: 0.96;
      transform: translate(20px, -20px) scale(1.18);
    }
    75% {
      opacity: 0.76;
      transform: translate(0px, -28px) scale(0.94);
    }
    87.5% {
      opacity: 0.58;
      transform: translate(-20px, -20px) scale(0.84);
    }
    100% {
      opacity: 0.42;
      transform: translate(-28px, 0px) scale(0.78);
    }
  }

  @keyframes frame-dragon-particle-drift {
    0% {
      opacity: 0;
      transform: translate3d(0, 4px, 0) scale(0.42) rotate(0deg);
    }
    16% {
      opacity: 1;
    }
    54% {
      opacity: 0.68;
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--dragon-particle-dx), var(--dragon-particle-dy), 0) scale(0.28) rotate(110deg);
    }
  }

  @keyframes frame-celestial-glow {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 2.5px var(--frame-glow)) brightness(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.06);
    }
  }

  /* 双翼守护开合:静止位=原画合拢位,只向外张开再缓落回位;张至最大时仅轻微提亮。
     只保留 0/50/100 三帧,配合 ease-in-out 形成正弦式呼吸,循环内无中途顿点、首尾无跳帧;
     环体在底图上不参与任何 transform。 */
  @keyframes frame-celestial-wing-flap-left {
    0%,
    100% {
      transform: rotate(0deg);
      filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.14)) brightness(1);
    }
    50% {
      transform: rotate(-5deg);
      filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.14)) brightness(1.06);
    }
  }

  @keyframes frame-celestial-wing-flap-right {
    0%,
    100% {
      transform: rotate(0deg);
      filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.14)) brightness(1);
    }
    50% {
      transform: rotate(5deg);
      filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.14)) brightness(1.06);
    }
  }

  @keyframes frame-celestial-halo-eclipse {
    0%,
    100% {
      opacity: 0.45;
      filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.55));
    }
    38% {
      opacity: 1;
      filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.9));
    }
    64% {
      opacity: 0.75;
      filter: drop-shadow(0 0 5px rgba(167, 139, 250, 0.9));
    }
  }

  @keyframes frame-celestial-dust-rise {
    0% {
      opacity: 0;
      transform: translate3d(0, 6px, 0) scale(0.5);
    }
    30% {
      opacity: 0.95;
    }
    68% {
      opacity: 0.45;
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--dust-dx), -14px, 0) scale(0.85);
    }
  }

  @keyframes frame-celestial-core-charge {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1.12);
    }
  }

  @keyframes frame-library-metal-light {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.07);
    }
  }

  @keyframes frame-library-page-glow {
    0%,
    100% {
      opacity: 0.12;
      -webkit-mask-position: 0 0;
      mask-position: 0 0;
    }
    50% {
      opacity: 0.38;
      -webkit-mask-position: 0 -1.2%;
      mask-position: 0 -1.2%;
    }
  }

  @keyframes frame-library-page-glint {
    0%,
    100% {
      opacity: 0.15;
      transform: scale(0.7) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.15) rotate(45deg);
    }
  }

  @keyframes frame-library-stardust {
    0% {
      opacity: 0;
      transform: translateY(3px);
    }
    25% {
      opacity: 0.9;
    }
    60% {
      opacity: 0.5;
    }
    100% {
      opacity: 0;
      transform: translateY(-9px);
    }
  }

  @keyframes frame-library-current-left {
    0% {
      opacity: 0;
      -webkit-mask-position: 132% 126%;
      mask-position: 132% 126%;
    }
    18% {
      opacity: 0.18;
    }
    50% {
      opacity: 0.44;
    }
    84% {
      opacity: 0.16;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: -32% -24%;
      mask-position: -32% -24%;
    }
  }

  @keyframes frame-library-current-right {
    0% {
      opacity: 0;
      -webkit-mask-position: -30% 124%;
      mask-position: -30% 124%;
    }
    18% {
      opacity: 0.16;
    }
    52% {
      opacity: 0.4;
    }
    86% {
      opacity: 0.14;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: 130% -22%;
      mask-position: 130% -22%;
    }
  }

  @keyframes frame-library-book-tour {
    0%,
    3% {
      opacity: 0;
      -webkit-mask-position: 88% 25%;
      mask-position: 88% 25%;
    }
    10% {
      opacity: 0.84;
    }
    22% {
      opacity: 0;
      -webkit-mask-position: 88% 25%;
      mask-position: 88% 25%;
    }
    26% {
      opacity: 0;
      -webkit-mask-position: 12% 5%;
      mask-position: 12% 5%;
    }
    34% {
      opacity: 0.72;
    }
    46% {
      opacity: 0;
      -webkit-mask-position: 12% 5%;
      mask-position: 12% 5%;
    }
    50% {
      opacity: 0;
      -webkit-mask-position: 4% 77%;
      mask-position: 4% 77%;
    }
    58% {
      opacity: 0.68;
    }
    70% {
      opacity: 0;
      -webkit-mask-position: 4% 77%;
      mask-position: 4% 77%;
    }
    74% {
      opacity: 0;
      -webkit-mask-position: 88% 25%;
      mask-position: 88% 25%;
    }
    82% {
      opacity: 0.76;
    }
    96%,
    100% {
      opacity: 0;
      -webkit-mask-position: 88% 25%;
      mask-position: 88% 25%;
    }
  }

  @keyframes frame-library-page-turn {
    0%,
    3% {
      opacity: 0;
      transform: rotate(var(--library-page-angle)) scaleX(0.18);
    }
    9% {
      opacity: 0.62;
      transform: rotate(var(--library-page-angle)) scaleX(0.9);
    }
    18% {
      opacity: 0.28;
      transform: rotate(var(--library-page-angle)) scaleX(1.08);
    }
    28% {
      opacity: 0;
      transform: rotate(var(--library-page-angle)) scaleX(1.12);
    }
    68% {
      opacity: 0;
      transform: rotate(var(--library-page-angle)) scaleX(0.18);
    }
    75% {
      opacity: 0.58;
      transform: rotate(var(--library-page-angle)) scaleX(0.9);
    }
    84% {
      opacity: 0.24;
      transform: rotate(var(--library-page-angle)) scaleX(1.08);
    }
    94%,
    100% {
      opacity: 0;
      transform: rotate(var(--library-page-angle)) scaleX(1.12);
    }
  }

  @keyframes frame-library-glyph-rise {
    0% {
      opacity: 0;
      transform: translate(0, 0) rotate(var(--library-glyph-angle)) scale(1);
    }
    10% {
      opacity: 1;
      transform: translate(var(--library-glyph-x1), var(--library-glyph-y1)) rotate(var(--library-glyph-angle)) scale(1);
    }
    29% {
      opacity: 1;
      transform: translate(var(--library-glyph-x2), var(--library-glyph-y2)) rotate(var(--library-glyph-angle)) scale(1);
    }
    48%,
    100% {
      opacity: 0;
      transform: translate(var(--library-glyph-x3), var(--library-glyph-y3)) rotate(var(--library-glyph-angle)) scale(1);
    }
  }

  @keyframes frame-library-gem-gather {
    0%,
    12% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.55);
    }
    20% {
      opacity: 0.98;
      transform: translate(-50%, -50%) scale(1.08);
    }
    36% {
      opacity: 0.42;
      transform: translate(-50%, -50%) scale(0.82);
    }
    48%,
    62% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.62);
    }
    70% {
      opacity: 0.74;
      transform: translate(-50%, -50%) scale(0.96);
    }
    80% {
      opacity: 0.28;
      transform: translate(-50%, -50%) scale(0.78);
    }
    90%,
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.62);
    }
  }

  @keyframes frame-constellation-ink {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.07);
    }
  }

  @keyframes frame-constellation-ink-flow {
    0% {
      opacity: 0;
      -webkit-mask-position: 130% 128%;
      mask-position: 130% 128%;
    }
    20% {
      opacity: 0.55;
    }
    80% {
      opacity: 0.55;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: -30% -28%;
      mask-position: -30% -28%;
    }
  }

  @keyframes frame-constellation-pen-light {
    0%,
    100% {
      opacity: 0.2;
    }
    45% {
      opacity: 0.9;
    }
  }

  @keyframes frame-constellation-gather {
    0% {
      opacity: 0;
      transform: translate(var(--gather-x), var(--gather-y)) scale(0.7);
    }
    15% {
      opacity: 0.95;
    }
    70% {
      opacity: 0.85;
    }
    100% {
      opacity: 0;
      transform: translate(0, 0) scale(0.45);
    }
  }

  @keyframes frame-constellation-current-left {
    0% {
      opacity: 0;
      -webkit-mask-position: 132% 126%;
      mask-position: 132% 126%;
    }
    16% {
      opacity: 0.14;
    }
    48% {
      opacity: 0.34;
    }
    84% {
      opacity: 0.12;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: -32% -26%;
      mask-position: -32% -26%;
    }
  }

  @keyframes frame-constellation-current-right {
    0% {
      opacity: 0;
      -webkit-mask-position: -30% 122%;
      mask-position: -30% 122%;
    }
    18% {
      opacity: 0.12;
    }
    52% {
      opacity: 0.3;
    }
    86% {
      opacity: 0.1;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: 130% -22%;
      mask-position: 130% -22%;
    }
  }

  @keyframes frame-constellation-star-link {
    0%,
    2% {
      opacity: 0;
      transform: rotate(var(--constellation-link-angle)) scaleX(0);
    }
    7% {
      opacity: 1;
      transform: rotate(var(--constellation-link-angle)) scaleX(1);
    }
    11% {
      opacity: 0.58;
      transform: rotate(var(--constellation-link-angle)) scaleX(0.86);
    }
    15% {
      opacity: 0.96;
      transform: rotate(var(--constellation-link-angle)) scaleX(1);
    }
    28% {
      opacity: 0.28;
      transform: rotate(var(--constellation-link-angle)) scaleX(1);
    }
    36%,
    100% {
      opacity: 0;
      transform: rotate(var(--constellation-link-angle)) scaleX(1);
    }
  }

  @keyframes frame-constellation-star-pulse {
    0%,
    2% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.45) rotate(0deg);
    }
    7% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.2) rotate(45deg);
    }
    16% {
      opacity: 0.5;
      transform: translate(-50%, -50%) scale(0.78) rotate(78deg);
    }
    25% {
      opacity: 0.88;
      transform: translate(-50%, -50%) scale(1.02) rotate(90deg);
    }
    36%,
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.55) rotate(120deg);
    }
  }

  @keyframes frame-constellation-pen-write {
    0%,
    11% {
      opacity: 0;
      transform: scaleX(0);
    }
    18% {
      opacity: 0.88;
      transform: scaleX(1);
    }
    26% {
      opacity: 0.5;
      transform: scaleX(1);
    }
    34%,
    100% {
      opacity: 0;
      transform: scaleX(1);
    }
  }

  @keyframes frame-constellation-ink-drop {
    0%,
    20% {
      opacity: 0;
      transform: translate(0, 0) scale(0.5);
    }
    24% {
      opacity: 0.72;
    }
    34% {
      opacity: 0;
      transform: translate(-6px, 3px) scale(1.35);
    }
    100% {
      opacity: 0;
      transform: translate(-6px, 3px) scale(1.35);
    }
  }

  @keyframes frame-cloudvault-light {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 3px var(--frame-glow)) brightness(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.06);
    }
  }

  @keyframes frame-cloudvault-cloud-flow {
    0%,
    100% {
      opacity: 0.1;
      -webkit-mask-position: 16% 60%, 84% 24%, 76% 76%;
      mask-position: 16% 60%, 84% 24%, 76% 76%;
    }
    50% {
      opacity: 0.78;
      -webkit-mask-position: 20% 60%, 80% 28%, 80% 72%;
      mask-position: 20% 60%, 80% 28%, 80% 72%;
    }
  }

  @keyframes frame-cloudvault-current-left {
    0% {
      opacity: 0;
      -webkit-mask-position: 132% 126%;
      mask-position: 132% 126%;
    }
    18% {
      opacity: 0.16;
    }
    50% {
      opacity: 0.4;
    }
    84% {
      opacity: 0.14;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: -32% -24%;
      mask-position: -32% -24%;
    }
  }

  @keyframes frame-cloudvault-current-right {
    0% {
      opacity: 0;
      -webkit-mask-position: -30% 124%;
      mask-position: -30% 124%;
    }
    18% {
      opacity: 0.14;
    }
    52% {
      opacity: 0.36;
    }
    86% {
      opacity: 0.12;
    }
    100% {
      opacity: 0;
      -webkit-mask-position: 130% -22%;
      mask-position: 130% -22%;
    }
  }

  @keyframes frame-cloudvault-file-rise {
    0% {
      opacity: 0;
      transform: translate(0, 0) rotate(var(--cloudvault-file-angle));
    }
    8% {
      opacity: 0.96;
      transform: translate(var(--cloudvault-file-x1), var(--cloudvault-file-y1)) rotate(var(--cloudvault-file-angle));
    }
    30% {
      opacity: 1;
      transform: translate(var(--cloudvault-file-x2), var(--cloudvault-file-y2)) rotate(var(--cloudvault-file-angle));
    }
    52%,
    100% {
      opacity: 0;
      transform: translate(var(--cloudvault-file-x3), var(--cloudvault-file-y3)) rotate(var(--cloudvault-file-angle));
    }
  }

  @keyframes frame-cloudvault-gate-pulse {
    0%,
    10% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.5) rotate(0deg);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.14) rotate(45deg);
    }
    28% {
      opacity: 0.38;
      transform: translate(-50%, -50%) scale(0.82) rotate(78deg);
    }
    38%,
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.62) rotate(90deg);
    }
  }

  @keyframes frame-cloudvault-window-light {
    0%,
    42%,
    100% {
      opacity: 0.08;
    }
    55% {
      opacity: 1;
    }
    72% {
      opacity: 0.58;
    }
    86% {
      opacity: 0.16;
    }
  }

  @keyframes frame-cloudvault-stardust {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.7);
    }
    18% {
      opacity: 0.92;
    }
    72% {
      opacity: 0.48;
    }
    100% {
      opacity: 0;
      transform: translate(var(--cloudvault-dust-x), var(--cloudvault-dust-y)) scale(1.08);
    }
  }

  @keyframes frame-cloudvault-pavilion {
    0%,
    100% {
      opacity: 0.06;
    }
    45% {
      opacity: 0.95;
    }
    62% {
      opacity: 0.7;
    }
  }

  @keyframes frame-cloudvault-scroll-glint {
    0%,
    100% {
      opacity: 0.1;
      transform: translateX(-3px);
    }
    50% {
      opacity: 0.85;
      transform: translateX(3px);
    }
  }

  @keyframes frame-eternal-time-light {
    0%,
    100% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 2.5px var(--frame-glow)) brightness(1)
        saturate(1);
    }
    50% {
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.2)) drop-shadow(0 0 5px var(--frame-glow)) brightness(1.06)
        saturate(1.08);
    }
  }

  /* 四季粒子参数化曲线:下落类中段横向飘移+旋转,上浮类渐亮渐散;首尾均透明,循环无跳。 */
  @keyframes frame-eternal-mote-fall {
    0% {
      opacity: 0;
      transform: translate3d(0, -3px, 0) rotate(0deg);
    }
    18% {
      opacity: 0.95;
    }
    55% {
      opacity: 0.75;
      transform: translate3d(calc(var(--mote-dx) * 0.35), calc(var(--mote-dy) * 0.55), 0)
        rotate(calc(var(--mote-spin) * 0.55));
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--mote-dx), var(--mote-dy), 0) rotate(var(--mote-spin));
    }
  }

  @keyframes frame-eternal-mote-rise {
    0% {
      opacity: 0;
      transform: translate3d(0, 5px, 0) scale(0.55);
    }
    30% {
      opacity: 0.95;
    }
    70% {
      opacity: 0.55;
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--mote-dx), var(--mote-dy), 0) scale(0.9);
    }
  }

  /* 三翼共用一条正弦式来回摆曲线:内收 0.4 倍反向、外扬全幅,总摆幅约 1.4 倍 --wing-sway;
     内收侧翼滑入环体与披挂之下,不露缝;暂停/reduced-motion 静止帧仍是原画 0° 位。 */
  @keyframes frame-eternal-wing-sway {
    0%,
    100% {
      transform: rotate(calc(var(--wing-sway) * -0.4));
    }
    50% {
      transform: rotate(var(--wing-sway));
    }
  }

  // 四季辉光沿边中点一年一巡:顶部星冠 -> 左侧春夏 -> 底部华年 -> 右侧秋冬。
  @keyframes frame-eternal-season-tour {
    0% {
      -webkit-mask-position: 50% 0%;
      mask-position: 50% 0%;
    }
    25% {
      -webkit-mask-position: 0% 50%;
      mask-position: 0% 50%;
    }
    50% {
      -webkit-mask-position: 50% 100%;
      mask-position: 50% 100%;
    }
    75% {
      -webkit-mask-position: 100% 50%;
      mask-position: 100% 50%;
    }
    100% {
      -webkit-mask-position: 50% 0%;
      mask-position: 50% 0%;
    }
  }

  @keyframes frame-eternal-crown-flame {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(0.92);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  @keyframes frame-eternal-gem-glint {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  @keyframes frame-eternal-petal-drift {
    0% {
      opacity: 0;
      transform: translate(0, -4px) rotate(0deg);
    }
    20% {
      opacity: 0.95;
    }
    80% {
      opacity: 0.6;
    }
    100% {
      opacity: 0;
      transform: translate(5px, 10px) rotate(140deg);
    }
  }

  @keyframes frame-eternal-firefly {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(2px);
    }
    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
    70% {
      opacity: 0.5;
      transform: translateY(-6px);
    }
  }

  @keyframes frame-eternal-leaf-drift {
    0% {
      opacity: 0;
      transform: translate(0, -3px) rotate(-12deg);
    }
    25% {
      opacity: 0.95;
    }
    75% {
      opacity: 0.55;
    }
    100% {
      opacity: 0;
      transform: translate(-6px, 9px) rotate(30deg);
    }
  }

  @keyframes frame-eternal-snow-drift {
    0% {
      opacity: 0;
      transform: translate(0, -5px) rotate(0deg);
    }
    30% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translate(-3px, 8px) rotate(90deg);
    }
  }

  @keyframes frame-local-twinkle {
    0%,
    100% {
      opacity: 0.22;
      transform: scale(0.62) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.3) rotate(45deg);
    }
  }

  /*
   * 聊天性能档默认暂停全部主题动画，再白名单放行少量低成本身份动效；这样新增主题层也不会
   * 漏出滚动预算。暂停使用 play-state 保留当前帧，不在滚动边界切换 filter。滚动容器只通过
   * 继承变量传入状态，避免页面依赖组件内部类名。
   */
  .avatar-frame--profile-chat *,
  .avatar-frame--profile-chat *::before,
  .avatar-frame--profile-chat *::after {
    animation-play-state: var(--avatar-frame-scroll-secondary-play-state, running) !important;
  }

  .avatar-frame--profile-chat .avatar-frame__wing-layer,
  .avatar-frame--profile-chat .avatar-frame__sunset-cloud,
  .avatar-frame--profile-chat .avatar-frame__dragon-orbit-particles i,
  .avatar-frame--profile-chat .avatar-frame__flame-particle.avatar-frame__scroll-core,
  .avatar-frame--profile-chat .avatar-frame__motion::before,
  .avatar-frame--profile-chat .avatar-frame__motion i:first-child {
    animation-play-state: running !important;
  }

  // 天穹双翼在聊天室持续使用 transform 开合；固定滤镜避免关键帧里的滤镜插值进入滚动合成成本。
  .avatar-frame--profile-chat.avatar-frame--celestial .avatar-frame__wing-layer {
    filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.14)) !important;
  }

  .avatar-frame--motion-paused .avatar-frame__art,
  .avatar-frame--motion-paused .avatar-frame__art-detail,
  .avatar-frame--motion-paused .avatar-frame__wing-layer,
  .avatar-frame--motion-paused .avatar-frame__celestial-dust i,
  .avatar-frame--motion-paused .avatar-frame__eternal-motes i,
  .avatar-frame--motion-paused .avatar-frame__sunset-cloud,
  .avatar-frame--motion-paused .avatar-frame__ocean-current,
  .avatar-frame--motion-paused .avatar-frame__aurora-flow,
  .avatar-frame--motion-paused .avatar-frame__aurora-crystal,
  .avatar-frame--motion-paused .avatar-frame__flame-embers,
  .avatar-frame--motion-paused .avatar-frame__flame-particle,
  .avatar-frame--motion-paused .avatar-frame__dragon-trail,
  .avatar-frame--motion-paused .avatar-frame__dragon-orbit-particles i,
  .avatar-frame--motion-paused .avatar-frame__dragon-particles i,
  .avatar-frame--motion-paused .avatar-frame__bookmark-current,
  .avatar-frame--motion-paused .avatar-frame__bookmark-booklight,
  .avatar-frame--motion-paused .avatar-frame__bookmark-event i,
  .avatar-frame--motion-paused .avatar-frame__constellation-ink,
  .avatar-frame--motion-paused .avatar-frame__constellation-star-route i,
  .avatar-frame--motion-paused .avatar-frame__constellation-pen::before,
  .avatar-frame--motion-paused .avatar-frame__constellation-pen::after,
  .avatar-frame--motion-paused .avatar-frame__cloudvault-current,
  .avatar-frame--motion-paused .avatar-frame__cloudvault-event i,
  .avatar-frame--motion-paused .avatar-frame__motion,
  .avatar-frame--motion-paused .avatar-frame__motion::before,
  .avatar-frame--motion-paused .avatar-frame__motion::after,
  .avatar-frame--motion-paused .avatar-frame__motion i {
    animation: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-frame__art,
    .avatar-frame__art-detail,
    .avatar-frame__wing-layer,
    .avatar-frame__celestial-dust i,
    .avatar-frame__eternal-motes i,
    .avatar-frame__sunset-cloud,
    .avatar-frame__ocean-current,
    .avatar-frame__aurora-flow,
    .avatar-frame__aurora-crystal,
    .avatar-frame__flame-embers,
    .avatar-frame__flame-particle,
    .avatar-frame__dragon-trail,
    .avatar-frame__dragon-orbit-particles i,
    .avatar-frame__dragon-particles i,
    .avatar-frame__bookmark-current,
    .avatar-frame__bookmark-booklight,
    .avatar-frame__bookmark-event i,
    .avatar-frame__constellation-ink,
    .avatar-frame__constellation-star-route i,
    .avatar-frame__constellation-pen::before,
    .avatar-frame__constellation-pen::after,
    .avatar-frame__cloudvault-current,
    .avatar-frame__cloudvault-event i,
    .avatar-frame__motion,
    .avatar-frame__motion::before,
    .avatar-frame__motion::after,
    .avatar-frame__motion i {
      animation: none !important;
    }
  }
</style>
