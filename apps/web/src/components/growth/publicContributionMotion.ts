import { paintLighthouseLegendaryMotion } from './knowledgeLighthouseMotion';

// Curves use the original 1254 × 1254 illustration coordinates.
// They follow the page edges and outer light ribbons; no light crosses the avatar.
type Point = [number, number];
const curve = (start: Point, segments: [Point, Point, Point][]) => {
  const points = [start];
  let p = start;
  for (const [a, b, end] of segments) {
    for (let n = 1; n <= 75; n++) {
      const t = n / 75,
        q = 1 - t;
      points.push([
        q * q * q * p[0] + 3 * q * q * t * a[0] + 3 * q * t * t * b[0] + t * t * t * end[0],
        q * q * q * p[1] + 3 * q * q * t * a[1] + 3 * q * t * t * b[1] + t * t * t * end[1],
      ]);
    }
    p = end;
  }
  let length = 0;
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    distances.push(length);
  }
  return { points, distances, length };
};
const epic = [
  curve(
    [244, 885],
    [
      [
        [105, 753],
        [110, 532],
        [198, 367],
      ],
      [
        [277, 245],
        [440, 191],
        [576, 194],
      ],
    ],
  ),
  curve(
    [1010, 885],
    [
      [
        [1149, 753],
        [1144, 532],
        [1056, 367],
      ],
      [
        [977, 245],
        [814, 191],
        [678, 194],
      ],
    ],
  ),
];
function pointAt(path, fraction) {
  const d = Math.max(0, Math.min(1, fraction)) * path.length;
  let lo = 0,
    hi = path.distances.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (path.distances[m] < d) lo = m;
    else hi = m;
  }
  const span = path.distances[hi] - path.distances[lo];
  const f = span ? (d - path.distances[lo]) / span : 0;
  return [
    path.points[lo][0] + (path.points[hi][0] - path.points[lo][0]) * f,
    path.points[lo][1] + (path.points[hi][1] - path.points[lo][1]) * f,
  ];
}
function light(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number, lilac = false) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, 'rgba(255,255,247,' + alpha + ')');
  g.addColorStop(0.2, 'rgba(255,246,199,' + alpha * 0.98 + ')');
  g.addColorStop(0.5, (lilac ? 'rgba(187,150,255,' : 'rgba(255,194,72,') + alpha * 0.68 + ')');
  g.addColorStop(1, 'rgba(255,215,130,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function stream(
  ctx: CanvasRenderingContext2D,
  path: ReturnType<typeof curve>,
  phase: number,
  strength = 1,
  width = 15,
  tint = '255,243,201',
) {
  const u = ((phase % 1) + 1) % 1;
  const start = Math.max(0, u - 0.26),
    end = Math.min(1, u);
  const a = pointAt(path, start),
    b = pointAt(path, end);
  const fade = Math.min(1, u * 10, (1 - u) * 12) * strength;
  if (fade <= 0) return;
  const gradient = ctx.createLinearGradient(a[0], a[1], b[0] + 0.01, b[1] + 0.01);
  gradient.addColorStop(0, 'rgba(' + tint + ',0)');
  gradient.addColorStop(0.32, 'rgba(174,137,246,' + 0.58 * fade + ')');
  gradient.addColorStop(0.7, 'rgba(218,199,255,' + 0.94 * fade + ')');
  gradient.addColorStop(1, 'rgba(255,255,245,' + 0.98 * fade + ')');
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  for (let k = 1; k <= 30; k++) {
    const p = pointAt(path, start + ((end - start) * k) / 30);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width * 2.2;
  ctx.globalAlpha = 0.3;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.globalAlpha = 1;
  ctx.stroke();
  light(ctx, b[0], b[1], 31, 0.95 * fade);
}
export type PublicContributionMotionKind = 'epic' | 'legendary';
export function paintPublicContributionFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  kind: PublicContributionMotionKind,
  t: number,
  secondaryTime = t,
  reduced = false,
) {
  if (kind === 'legendary') {
    paintLighthouseLegendaryMotion(ctx, size, secondaryTime + 0.55, reduced);
    return;
  }
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / 1254, size / 1254);

  // One continuous paired flow channel, plus a low-intensity lamp accent.
  epic.forEach((p, i) => stream(ctx, p, t / 2.9 + i * 0.16, 0.95, 15));
  const breathe = 0.5 + 0.27 * Math.sin(t * 2.7);
  light(ctx, 626 + Math.sin(t * 2.8) * 5, 137, 69, breathe);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(596, 183);
  ctx.bezierCurveTo(569, 137, 626, 106, 618, 66);
  ctx.bezierCurveTo(658, 105, 661, 144, 642, 184);
  ctx.closePath();
  ctx.clip();
  light(ctx, 625 + Math.sin(t * 3.1) * 11, 132 + Math.cos(t * 2.9) * 17, 45, 0.85);
  ctx.restore();

  ctx.restore();
}
