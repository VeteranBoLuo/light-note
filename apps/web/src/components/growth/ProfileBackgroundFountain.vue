<template>
  <div class="profile-background-fountain" :class="{ 'is-running': running }">
    <canvas ref="canvas" width="1536" height="512" />
    <img class="profile-background-fountain__note" :src="note" alt="" decoding="async" />
    <img class="profile-background-fountain__note is-second" :src="note" alt="" decoding="async" />
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import note from '@/assets/profile-backgrounds/fountain-note.webp';

  const props = defineProps<{ image: HTMLImageElement | null; running: boolean }>();
  const canvas = ref<HTMLCanvasElement | null>(null);
  // 内容坐标统一为原画的 1920 × 640，不参与界面密度缩放。
  const width = 1920;
  const height = 640;
  const centerX = 1282;
  const centerY = 519;
  const tipY = 329;
  const water = [
    [0, 450],
    [690, 450],
    [760, 470],
    [980, 478],
    [1160, 470],
    [1450, 490],
    [1600, 526],
    [1780, 563],
    [1920, 594],
    [1920, 640],
    [0, 640],
  ];
  let context: CanvasRenderingContext2D | null = null;
  let frameId: number | undefined;
  let previousTime: number | undefined;
  let elapsed = 0;

  function stop() {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    frameId = undefined;
    previousTime = undefined;
  }

  function draw(time: number) {
    const image = props.image;
    const target = canvas.value;
    const c = context;
    if (!c || !target || !image?.naturalWidth || !image.naturalHeight) return;
    c.setTransform(target.width / width, 0, 0, target.height / height, 0, 0);
    c.clearRect(0, 0, width, height);
    c.save();
    c.beginPath();
    water.forEach(([x, y], index) => (index ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.clip();
    const sourceScale = image.naturalHeight / height;
    for (let y = 450; y < height; y += 2) {
      const depth = Math.min(1, (y - 450) / 100);
      const shift = (Math.sin(y * 0.13 - time * 3.4) * 2.9 + Math.sin(y * 0.055 - time * 2.1) * 1.5) * depth;
      c.drawImage(image, 0, y * sourceScale, image.naturalWidth, 2 * sourceScale, shift, y, width, 2);
    }
    c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const phase = (time / 2.2 + i / 5) % 1;
      const opacity = Math.sin(Math.PI * phase) * 0.42;
      c.strokeStyle = `rgba(207,176,255,${opacity})`;
      c.lineWidth = 1.8 * (1 - phase) + 0.5;
      c.beginPath();
      c.ellipse(centerX, centerY, 9 + phase * 265, 2 + phase * 40, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = `rgba(255,220,173,${opacity * 0.5})`;
      c.beginPath();
      c.ellipse(centerX, centerY + 1, 12 + phase * 263, 3 + phase * 40, 0, 0.15, 1.65);
      c.stroke();
    }
    const glow = c.createRadialGradient(centerX, centerY, 0, centerX, centerY, 43);
    glow.addColorStop(0, `rgba(230,194,255,${0.2 + 0.06 * Math.sin(time * 6)})`);
    glow.addColorStop(1, 'rgba(180,120,255,0)');
    c.fillStyle = glow;
    c.save();
    c.translate(centerX, centerY);
    c.scale(1, 0.38);
    c.translate(-centerX, -centerY);
    c.fillRect(centerX - 43, centerY - 43, 86, 86);
    c.restore();
    c.restore();
    // 墨流仅沿笔尖下方流动，水面裁切不随涟漪移动。
    c.save();
    c.beginPath();
    c.rect(centerX - 8, tipY + 3, 16, centerY - tipY - 3);
    c.clip();
    c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const phase = (time * 1.12 + i / 5) % 1;
      const y = tipY + 5 + phase * (centerY - tipY - 8);
      const x = centerX + Math.sin(time * 5 + phase * 8) * 1.2;
      c.strokeStyle = `rgba(245,225,255,${Math.sin(Math.PI * phase) * 0.85})`;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x, y - 11);
      c.quadraticCurveTo(x + 1.5, y, x, y + 5);
      c.stroke();
    }
    c.restore();
  }

  function frame(now: number) {
    frameId = undefined;
    if (!props.running) return;
    if (previousTime === undefined || now - previousTime >= 1000 / 30) {
      elapsed += previousTime === undefined ? 0 : Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      draw(elapsed);
    }
    frameId = requestAnimationFrame(frame);
  }

  watch(
    [canvas, () => props.image, () => props.running],
    () => {
      stop();
      const target = canvas.value;
      // Canvas 不可用时保留清晰底图及纸笺，装饰失败不影响身份内容。
      context = target?.getContext('2d') ?? null;
      if (context && props.running) frameId = requestAnimationFrame(frame);
    },
    { flush: 'post', immediate: true },
  );
  onBeforeUnmount(stop);
</script>

<style scoped lang="less">
  .profile-background-fountain,
  .profile-background-fountain canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .profile-background-fountain__note {
    position: absolute;
    width: 8.8%;
    height: auto;
    left: 44%;
    top: 17%;
    transform-origin: 50% 65%;
    animation: fountain-note-float 6.6s ease-in-out infinite alternate;
    animation-play-state: paused;
  }
  .profile-background-fountain__note.is-second {
    left: 81%;
    top: 32%;
    width: 6.6%;
    animation-delay: -2.8s;
    animation-direction: alternate-reverse;
  }
  .is-running .profile-background-fountain__note {
    animation-play-state: running;
  }
  @keyframes fountain-note-float {
    from {
      transform: translate(-6%, -14%) rotate(-15deg);
    }
    to {
      transform: translate(6%, 14%) rotate(-3deg);
    }
  }
</style>
