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
const pages = [
  curve(
    [524, 1072],
    [
      [
        [346, 1034],
        [268, 911],
        [203, 788],
      ],
      [
        [141, 681],
        [105, 583],
        [129, 512],
      ],
      [
        [185, 330],
        [405, 205],
        [589, 133],
      ],
    ],
  ),
  curve(
    [733, 1072],
    [
      [
        [915, 1027],
        [1013, 903],
        [1058, 756],
      ],
      [
        [1098, 645],
        [1115, 553],
        [1140, 465],
      ],
      [
        [1045, 306],
        [827, 200],
        [668, 133],
      ],
    ],
  ),
];
const ribbons = [
  curve(
    [592, 127],
    [
      [
        [425, 145],
        [400, 260],
        [291, 314],
      ],
      [
        [156, 385],
        [76, 433],
        [68, 513],
      ],
      [
        [67, 569],
        [132, 599],
        [203, 643],
      ],
    ],
  ),
  curve(
    [662, 127],
    [
      [
        [797, 157],
        [783, 263],
        [965, 310],
      ],
      [
        [1150, 356],
        [1216, 376],
        [1197, 466],
      ],
      [
        [1180, 523],
        [1101, 561],
        [1069, 608],
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
function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff9d5';
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.14, -size * 0.14, size, 0);
  ctx.quadraticCurveTo(size * 0.14, size * 0.14, 0, size);
  ctx.quadraticCurveTo(-size * 0.14, size * 0.14, -size, 0);
  ctx.quadraticCurveTo(-size * 0.14, -size * 0.14, 0, -size);
  ctx.fill();
  ctx.restore();
}
function lighthouseLamp(ctx: CanvasRenderingContext2D, time: number, peak: number) {
  // Colour belongs to the glass chamber, not a white bloom over the whole gold crown.
  // Keep the original roof, uprights and base readable around this inset lens.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(606, 94);
  ctx.quadraticCurveTo(627, 85, 648, 94);
  ctx.lineTo(648, 134);
  ctx.quadraticCurveTo(627, 140, 606, 134);
  ctx.closePath();
  ctx.clip();
  const glass = ctx.createLinearGradient(604, 0, 650, 0);
  glass.addColorStop(0, '#4b338f');
  glass.addColorStop(0.3, '#6557c9');
  glass.addColorStop(0.55, '#69c9f5');
  glass.addColorStop(1, '#443280');
  ctx.fillStyle = glass;
  ctx.fillRect(603, 86, 48, 55);
  const x = 627 + Math.sin((time * 2 * Math.PI) / 3.6) * 10;
  const lens = ctx.createLinearGradient(x - 13, 0, x + 13, 0);
  lens.addColorStop(0, 'rgba(91,203,255,0)');
  lens.addColorStop(0.4, '#6edcff');
  lens.addColorStop(0.54, '#ecffff');
  lens.addColorStop(1, 'rgba(137,143,255,0)');
  ctx.globalAlpha = 0.88 + peak * 0.12;
  ctx.fillStyle = lens;
  ctx.fillRect(x - 13, 91, 26, 45);
  ctx.restore();
}
const ease = (v) => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
const envelope = (p, a, b, c, d) => ease((p - a) / (b - a)) * (1 - ease((p - c) / (d - c)));
function unfoldLeaf(ctx: CanvasRenderingContext2D, side: number, amount: number, curl: number) {
  // Independent paper leaves: the complete original book stays underneath.
  // The root is fixed; the surface and rolled edge deform, never the frame image.
  ctx.save();
  ctx.translate(side < 0 ? 352 : 902, 1028);
  ctx.scale(side < 0 ? 1 : -1, 1);
  ctx.globalAlpha = 1;
  const spread = amount * 68,
    tipX = -223 - spread,
    tipY = -288 - amount * 58;
  const sheet = new Path2D();
  sheet.moveTo(0, 0);
  sheet.bezierCurveTo(-91 - spread * 0.4, -54, -250 - spread * 0.25, -172, tipX, tipY);
  sheet.bezierCurveTo(-155 - spread * 0.5, -249 - curl * 27, -87, -196, -72, -110);
  sheet.quadraticCurveTo(-35, -34, 0, 0);
  sheet.closePath();
  const fill = ctx.createLinearGradient(tipX, tipY, 18, 15);
  fill.addColorStop(0, '#fffef2');
  fill.addColorStop(0.28, '#f3e4bd');
  fill.addColorStop(0.46, '#fffcf0');
  fill.addColorStop(0.74, '#e3d6ed');
  fill.addColorStop(1, '#fff8dd');
  ctx.fillStyle = fill;
  ctx.fill(sheet);
  ctx.strokeStyle = '#d3a962';
  ctx.lineWidth = 3;
  ctx.stroke(sheet);
  ctx.save();
  ctx.clip(sheet);
  const fold = new Path2D();
  fold.moveTo(tipX, tipY);
  fold.bezierCurveTo(-175 - spread, -180 - curl * 44, -81, -154, -2, -1);
  fold.bezierCurveTo(-110, -124, -213 - spread * 0.6, -190, tipX, tipY);
  fold.closePath();
  const shade = ctx.createLinearGradient(-240, -260, -65, -80);
  shade.addColorStop(0, '#fff4d0');
  shade.addColorStop(0.38, '#c3ade0');
  shade.addColorStop(0.65, '#eee2f7');
  shade.addColorStop(1, '#fffbe8');
  ctx.fillStyle = shade;
  ctx.fill(fold);
  ctx.strokeStyle = '#f8e3af';
  ctx.lineWidth = 3;
  ctx.stroke(fold);
  ctx.strokeStyle = 'rgba(195,150,72,.58)';
  ctx.lineWidth = 1.7;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-25 - i * 9, -35 - i * 9);
    ctx.bezierCurveTo(-98 - i * 10, -117, -128 - spread * 0.35, -199, -178 - spread * 0.5, -246 + i * 12);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}
export type PublicContributionMotionKind = 'epic' | 'legendary';
export function paintPublicContributionFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  kind: PublicContributionMotionKind,
  t: number,
  secondaryTime = t,
) {
  ctx.clearRect(0, 0, size, size);
  // Reduced motion freezes the complete composition, including the permanent leaves.
  ctx.save();
  ctx.scale(size / 1254, size / 1254);
  if (kind === 'epic') {
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
  } else {
    // Permanent paper leaves breathe continuously; 6.4-second light events add accents.
    const phase = (secondaryTime / 6.4) % 1;
    const pagePhase = (secondaryTime * 2 * Math.PI) / 4.8;
    const openLeft = 0.7 + 0.27 * Math.sin(pagePhase);
    const openRight = 0.7 + 0.27 * Math.sin(pagePhase - 0.38);
    unfoldLeaf(ctx, -1, openLeft, Math.sin(pagePhase + 0.3));
    unfoldLeaf(ctx, 1, openRight, Math.sin(pagePhase - 0.08));
    pages.forEach((p, i) => {
      stream(ctx, p, secondaryTime / 4.5 + i * 0.4, 0.36, 10);
      const gather = (phase - 0.13 - i * 0.035) / 0.45;
      if (gather > 0 && gather < 1) stream(ctx, p, gather, 1, 23);
    });
    const peak = envelope(phase, 0.45, 0.58, 0.67, 0.88);
    ribbons.forEach((p, i) => {
      stream(ctx, p, secondaryTime / 5.7 + i * 0.45, 0.4, 12);
      const send = (phase - 0.56 - i * 0.035) / 0.4;
      if (send > 0 && send < 1) stream(ctx, p, send, 1.04, 25);
    });
    // Both beams remain visible and sweep up/down every 3.6 seconds, outside the face.
    [-1, 1].forEach((side, i) => {
      const wave = Math.sin((t * 2 * Math.PI) / 3.6 + i * 0.32);
      ctx.save();
      ctx.translate(627, 115);
      ctx.scale(side, 1);
      ctx.rotate(0.04 + wave * 0.18);
      const length = 340 + peak * 16;
      const g = ctx.createLinearGradient(12, 0, length, 0);
      g.addColorStop(0, 'rgba(89,183,248,' + (0.84 + peak * 0.12) + ')');
      g.addColorStop(0.26, 'rgba(96,105,209,.76)');
      g.addColorStop(0.65, 'rgba(117,76,192,.48)');
      g.addColorStop(1, 'rgba(126,87,205,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(9, -5);
      ctx.lineTo(length, -42);
      ctx.lineTo(length, 42);
      ctx.closePath();
      ctx.fill();
      // A narrow blue centre gives the beam a direction at 30–46px preview sizes.
      const core = ctx.createLinearGradient(9, 0, length, 0);
      core.addColorStop(0, 'rgba(161,235,255,.96)');
      core.addColorStop(0.4, 'rgba(82,151,228,.72)');
      core.addColorStop(1, 'rgba(111,84,195,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(9, -3);
      ctx.lineTo(length * 0.94, -7);
      ctx.lineTo(length * 0.94, 7);
      ctx.lineTo(9, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    lighthouseLamp(ctx, t, peak);
    [
      [193, 829],
      [1041, 735],
      [421, 1056],
    ].forEach(([x, y], i) => {
      const p = (secondaryTime / 3.8 + i * 0.33) % 1;
      const a = Math.sin(Math.PI * p) ** 2;
      star(ctx, x + Math.sin(p * Math.PI) * 11, y - p * 40, 10 + 5 * a, 0.8 * a);
    });
  }
  ctx.restore();
}
