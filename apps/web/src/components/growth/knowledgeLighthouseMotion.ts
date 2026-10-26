// Artwork-space geometry for the new 1254px illustration. The ring and portrait
// are never drawn or transformed here: only independent leaves and light paths.
const ART = 1254;
export const LIGHTHOUSE_MOTION_PAD = 80;
export const LIGHTHOUSE_MOTION_SIZE = ART + 2 * LIGHTHOUSE_MOTION_PAD;
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const p = clamp(x);
  return p * p * (3 - 2 * p);
};
const fade = (p: number) => ease(p / 0.12) * ease((1 - p) / 0.16);

type Point = [number, number];
function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const q = 1 - t;
  return [
    q ** 3 * a[0] + 3 * q * q * t * b[0] + 3 * q * t * t * c[0] + t ** 3 * d[0],
    q ** 3 * a[1] + 3 * q * q * t * b[1] + 3 * q * t * t * c[1] + t ** 3 * d[1],
  ];
}
export function lighthouseRoute(side: number, phase: number): Point {
  const p = clamp(phase);
  const point =
    p < 0.52
      ? cubic([485, 1148], [185, 1180], [55, 869], [124, 626], p / 0.52)
      : cubic([124, 626], [65, 367], [311, 187], [583, 135], (p - 0.52) / 0.48);
  return [side < 0 ? point[0] : ART - point[0], point[1]];
}
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number, violet = false) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255,252,228,${alpha})`);
  gradient.addColorStop(0.24, `rgba(${violet ? '162,155,255' : '255,209,92'},${alpha * 0.8})`);
  gradient.addColorStop(1, `rgba(${violet ? '109,74,218' : '222,145,32'},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, violet = false) {
  if (alpha < 0.01) return;
  glow(ctx, x, y, size * 2.7, alpha * 0.65, violet);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  for (let n = 1; n < 8; n++) {
    const r = n % 2 ? size * 0.22 : size;
    const a = (n * Math.PI) / 4 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff9db';
  ctx.strokeStyle = violet ? '#8060cf' : '#b57b25';
  ctx.lineWidth = 1.8;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function page(ctx: CanvasRenderingContext2D, side: number, time: number) {
  // Both spine endpoints stay fixed on the original open book. A new top leaf
  // curls above the complete book underneath; no baked frame pixels are copied.
  const phase = (time * TAU) / 3.8 + (side < 0 ? 0 : -1.15);
  const lift = 0.5 + 0.5 * Math.sin(phase);
  const tip: Point = [342 + lift * 46, 1089 - lift * 102];
  ctx.save();
  if (side > 0) {
    ctx.translate(ART, 0);
    ctx.scale(-1, 1);
  }
  const sheet = new Path2D();
  sheet.moveTo(604, 1114);
  sheet.bezierCurveTo(535, 1080, 448, 1071 - lift * 35, tip[0], tip[1]);
  sheet.bezierCurveTo(390, 1022 - lift * 26, 477, 1007 - lift * 14, 604, 1072);
  sheet.quadraticCurveTo(608, 1090, 604, 1114);
  const paper = ctx.createLinearGradient(420, 994 - lift * 25, 500, 1122);
  paper.addColorStop(0, '#fffef0');
  paper.addColorStop(0.32, '#fff6d9');
  paper.addColorStop(0.57, '#f2dca5');
  paper.addColorStop(0.72, '#fffbed');
  paper.addColorStop(1, '#bea0ba');
  ctx.fillStyle = paper;
  ctx.strokeStyle = '#c38a35';
  ctx.lineWidth = 3;
  ctx.fill(sheet);
  ctx.stroke(sheet);
  ctx.save();
  ctx.clip(sheet);
  for (let line = 0; line < 4; line++) {
    ctx.beginPath();
    ctx.moveTo(576 - line * 2, 1080 + line * 6);
    ctx.bezierCurveTo(
      501,
      1034 + line * 7 - lift * 5,
      442,
      1043 + line * 6 - lift * 15,
      386 + line * 3,
      1069 + line * 3 - lift * 45,
    );
    ctx.strokeStyle = line === 0 ? '#fffdf0' : 'rgba(180,125,46,.48)';
    ctx.lineWidth = line === 0 ? 4 : 1.6;
    ctx.stroke();
  }
  const fold = new Path2D();
  fold.moveTo(...tip);
  fold.bezierCurveTo(414, 1050 - lift * 42, 511, 1061, 604, 1114);
  fold.bezierCurveTo(500, 1070, 414, 1090 - lift * 43, ...tip);
  const curl = ctx.createLinearGradient(430, 1040, 450, 1098);
  curl.addColorStop(0, '#e7c8a4');
  curl.addColorStop(0.4, '#fffbec');
  curl.addColorStop(0.85, '#dfbd70');
  curl.addColorStop(1, '#b58a93');
  ctx.fillStyle = curl;
  ctx.fill(fold);
  ctx.restore();
  ctx.restore();
}

function stream(ctx: CanvasRenderingContext2D, side: number, progress: number, strength: number) {
  if (progress <= 0 || progress >= 1) return;
  const head = lighthouseRoute(side, progress);
  const start = Math.max(0, progress - 0.19);
  const tail = lighthouseRoute(side, start);
  const alpha = fade(progress) * strength;
  const color = ctx.createLinearGradient(tail[0], tail[1], head[0] + 0.01, head[1] + 0.01);
  color.addColorStop(0, 'rgba(151,109,229,0)');
  color.addColorStop(0.4, `rgba(147,107,234,${alpha * 0.7})`);
  color.addColorStop(0.82, `rgba(255,207,105,${alpha})`);
  color.addColorStop(1, `rgba(255,251,217,${alpha})`);
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const p = lighthouseRoute(side, start + ((progress - start) * i) / 24);
    if (i === 0) ctx.moveTo(...p);
    else ctx.lineTo(...p);
  }
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 22;
  ctx.globalAlpha = 0.26;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 6.5;
  ctx.stroke();
  star(ctx, ...head, 14, alpha, side > 0);
}

export function paintLighthouseLegendaryMotion(
  ctx: CanvasRenderingContext2D,
  pixels: number,
  time: number,
  reduced = false,
) {
  ctx.clearRect(0, 0, pixels, pixels);
  if (reduced) return; // The complete raster is the accessible still fallback.
  ctx.save();
  ctx.scale(pixels / LIGHTHOUSE_MOTION_SIZE, pixels / LIGHTHOUSE_MOTION_SIZE);
  ctx.translate(LIGHTHOUSE_MOTION_PAD, LIGHTHOUSE_MOTION_PAD);
  // Hard exclusion for the avatar: even trails and soft light cannot cross it.
  ctx.beginPath();
  ctx.rect(-80, -80, LIGHTHOUSE_MOTION_SIZE, LIGHTHOUSE_MOTION_SIZE);
  ctx.moveTo(968, 690.6);
  ctx.arc(626, 690.6, 342, 0, TAU);
  ctx.closePath();
  ctx.clip('evenodd');
  page(ctx, -1, time);
  page(ctx, 1, time);
  const event = (time % 7.2) / 7.2;
  [-1, 1].forEach((side, index) => {
    stream(ctx, side, (time / 4.2 + index * 0.37) % 1, 0.7);
    const surge = (event - 0.2 - index * 0.055) / 0.43;
    stream(ctx, side, surge, 1.05);
    // Continuous moving grains follow the paper/metal silhouette, rather than
    // random flickering over the whole frame. Fixed seeds make pause deterministic.
    for (let i = 0; i < 11; i++) {
      const p = (time / (5.4 + i * 0.17) + i * 0.091 + index * 0.047) % 1;
      const point = lighthouseRoute(side, p);
      const x = point[0] + side * (19 + 17 * Math.sin(i * 2.7 + p * 9));
      const y = point[1] + 13 * Math.cos(i * 4.3 + p * 8);
      const alpha = fade(p) * (0.58 + (i % 3) * 0.15);
      glow(ctx, x, y, 16 + (i % 4), alpha * 0.8, i % 3 === 0);
      ctx.beginPath();
      ctx.arc(x, y, 5 + (i % 3), 0, TAU);
      ctx.fillStyle = i % 3 === 0 ? '#bca0ff' : '#ffe39a';
      ctx.strokeStyle = i % 3 === 0 ? '#8663bf' : '#bd8c3f';
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Three distinct outer sparks are readable at list sizes without a glow wash.
    for (let i = 0; i < 3; i++) {
      const p = (time / 3.4 + i / 3 + index * 0.12) % 1;
      const angle = 0.65 + i * 0.83;
      const x = 627 + side * (Math.sin(angle) * 610 + Math.sin(p * Math.PI) * 24);
      const y = 690 + Math.cos(angle) * 504 - p * 70;
      star(ctx, x, y, 14 + 8 * Math.sin(p * Math.PI), 0.95 * fade(p), i === 1);
    }
    const release = (event - 0.62 - index * 0.02) / 0.27;
    if (release > 0 && release < 1.2) {
      for (let i = 0; i < 3; i++) {
        const p = release - i * 0.06;
        if (p <= 0 || p >= 1) continue;
        const x = 627 + side * (35 + p * (185 + i * 64));
        const y = 130 - Math.sin(p * Math.PI) * (64 - i * 15) + p * 48;
        star(ctx, x, y, 11 + i * 2, fade(p) * 0.9, i === 1);
      }
    }
  });
  // A small moving highlight traces the bottom faceted stone, never scales it.
  const gemAngle = (time * TAU) / 3.8;
  star(ctx, 627 + Math.sin(gemAngle) * 20, 1125 + Math.cos(gemAngle) * 32, 10, 0.8, true);
  ctx.restore();
}
