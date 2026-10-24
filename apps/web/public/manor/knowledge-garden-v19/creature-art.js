/* 非鱼类水族：代码逐笔绘制（Canvas 2D），可静态出图（图鉴、揭晓卡），也可逐帧绘制（养鱼舱里的动画）
   绘制坐标统一为 100×60 的盒子，与鱼的贴图一致；t 是秒 */
const CreatureArt = (() => {
  const TAU = Math.PI * 2;
  const cache = new Map();
  const rand = (seed) => {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  };
  const pulse = (t, period, offset = 0) => Math.pow(Math.max(0, Math.sin(((t + offset) / period) * TAU)), 2);

  // 伞盖：上半是穹顶，下沿是透视里的一圈伞缘
  function bell(ctx, cx, top, rx, ry, rim, scallop = 0, lobes = 16) {
    const base = top + ry;
    ctx.beginPath();
    ctx.moveTo(cx - rx, base);
    ctx.bezierCurveTo(cx - rx, base - ry * 0.9, cx - rx * 0.5, top, cx, top);
    ctx.bezierCurveTo(cx + rx * 0.5, top, cx + rx, base - ry * 0.9, cx + rx, base);
    for (let i = 1; i <= lobes; i++) {
      const a = (i / lobes) * Math.PI;
      const x = cx + rx * Math.cos(a),
        y = base + rim * Math.sin(a);
      const am = ((i - 0.5) / lobes) * Math.PI;
      ctx.quadraticCurveTo(cx + rx * Math.cos(am) * 1.01, base + (rim + scallop) * Math.sin(am) + scallop * 0.6, x, y);
    }
    ctx.closePath();
  }
  function radial(ctx, x, y, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  // 细丝：从 (x, y) 垂下，随时间轻摆
  function thread(ctx, x, y, len, sway, width, color) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + sway * 0.3, y + len * 0.35, x + sway, y + len * 0.65, x + sway * 1.4, y + len);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  // 褶边带子（口腕）：沿一条摆动的中线，两侧起伏
  function ribbon(ctx, x, y, len, width, t, k, fill, edge) {
    const left = [],
      right = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const cx = x + Math.sin(t * 0.9 + k * 1.7 + s * 3.2) * 3.2 * s + Math.sin(t * 0.5 + k) * 1.5 * s;
      const cy = y + len * s;
      const w = width * (1 - s * 0.6) * (0.75 + 0.25 * Math.sin(s * 22 + t * 2 + k));
      left.push([cx - w, cy]);
      right.push([cx + w, cy]);
    }
    ctx.beginPath();
    left.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    right.reverse().forEach(([px, py]) => ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = edge;
    ctx.stroke();
  }

  function moonjelly(ctx, t, o) {
    const c = pulse(t, 2.8),
      cx = 50,
      rx = 25 * (1 - 0.1 * c),
      ry = 12.5 * (1 + 0.16 * c),
      top = 6 + 2 * c,
      base = top + ry,
      rim = rx * 0.2;
    // 触手与口腕在伞后
    const r = rand(7);
    for (let k = 0; k < 56; k++) {
      const a = (k / 56) * TAU;
      if (Math.sin(a) > 0) continue;
      thread(ctx, cx + rx * Math.cos(a) * 0.98, base + rim * Math.sin(a), 6 + r() * 6, Math.sin(t * 1.4 + k) * 1.6, 0.28, "rgba(225,238,255,.28)");
    }
    for (let k = 0; k < 4; k++) ribbon(ctx, cx - 6 + k * 4, base + 1, 13 + k % 2 * 3, 1.6, t, k, "rgba(238,226,252,.34)", "rgba(255,255,255,.35)");
    ctx.save();
    bell(ctx, cx, top, rx, ry, rim, 0.8, 24);
    ctx.fillStyle = radial(ctx, cx - rx * 0.25, top + ry * 0.4, 1, cx, top + ry * 0.7, rx * 1.05, [
      [0, "rgba(255,255,255,.62)"],
      [0.55, "rgba(214,232,252,.36)"],
      [1, "rgba(168,204,242,.22)"],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.stroke();
    ctx.clip();
    // 四枚淡紫色生殖腺环（透视里排成一圈）
    for (let k = 0; k < 4; k++) {
      const a = TAU * (k / 4 + 0.125) + t * 0.05;
      const gx = cx + Math.cos(a) * rx * 0.36,
        gy = top + ry * 0.78 + Math.sin(a) * rim * 0.9;
      const back = Math.sin(a) < 0;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 4.4, 2.3, 0, 0, TAU);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = back ? "rgba(206,150,214,.42)" : "rgba(214,140,222,.82)";
      ctx.stroke();
      ctx.fillStyle = back ? "rgba(236,196,240,.12)" : "rgba(240,190,244,.24)";
      ctx.fill();
    }
    // 伞面高光
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.35, top + ry * 0.35, rx * 0.35, ry * 0.22, -0.35, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fill();
    ctx.restore();
    // 前排触手
    for (let k = 0; k < 56; k++) {
      const a = (k / 56) * TAU;
      if (Math.sin(a) <= 0) continue;
      thread(ctx, cx + rx * Math.cos(a) * 0.98, base + rim * Math.sin(a), 6 + r() * 6, Math.sin(t * 1.4 + k) * 1.6, 0.3, "rgba(240,247,255,.4)");
    }
  }

  function purplejelly(ctx, t, o) {
    const c = pulse(t, 3.4),
      cx = 50,
      rx = 21 * (1 - 0.09 * c),
      ry = 12 * (1 + 0.15 * c),
      top = 3 + 1.5 * c,
      base = top + ry,
      rim = rx * 0.22;
    const r = rand(11);
    // 长触手（伞后）
    for (let k = 0; k < 10; k++) {
      const a = Math.PI + (k / 9) * Math.PI;
      ctx.beginPath();
      const x = cx + rx * Math.cos(a) * 0.95,
        y = base + rim * Math.sin(a);
      ctx.moveTo(x, y);
      const sw = Math.sin(t * 0.7 + k) * 4;
      ctx.bezierCurveTo(x + sw, y + 14, x - sw, y + 28, x + sw * 0.6, y + 46 + r() * 8);
      ctx.lineWidth = 0.45;
      ctx.strokeStyle = "rgba(150,62,96,.42)";
      ctx.stroke();
    }
    // 口腕：长长的紫色褶边带
    for (let k = 0; k < 4; k++) ribbon(ctx, cx - 5 + k * 3.4, base + 1, 34 + (k % 2) * 6, 2.4, t, k, "rgba(196,140,214,.52)", "rgba(120,60,140,.5)");
    ctx.save();
    bell(ctx, cx, top, rx, ry, rim, 1.2, 16);
    ctx.fillStyle = radial(ctx, cx - rx * 0.2, top + ry * 0.35, 1, cx, top + ry * 0.7, rx, [
      [0, "rgba(255,250,244,.9)"],
      [0.6, "rgba(244,226,222,.72)"],
      [1, "rgba(226,196,200,.6)"],
    ]);
    ctx.fill();
    ctx.clip();
    // 十六道紫纹从伞顶放射到伞缘
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI;
      const x = cx + rx * Math.cos(a),
        y = base + rim * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx, top + 1);
      ctx.quadraticCurveTo(cx + (x - cx) * 0.95, top + ry * 0.25, x, y);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = "rgba(112,44,128,.62)";
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, top + ry * 0.3, rx * 0.3, ry * 0.2, -0.3, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fill();
    ctx.restore();
    bell(ctx, cx, top, rx, ry, rim, 1.2, 16);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(120,52,120,.55)";
    ctx.stroke();
  }

  function immortal(ctx, t, o) {
    const c = pulse(t, 1.5),
      cx = 50,
      rx = 13 * (1 - 0.12 * c),
      ry = 15 * (1 + 0.1 * c),
      top = 8 + 1.5 * c,
      base = top + ry,
      rim = rx * 0.24;
    const r = rand(5);
    for (let k = 0; k < 70; k++) {
      const a = (k / 70) * TAU;
      thread(ctx, cx + rx * Math.cos(a) * 0.97, base + rim * Math.sin(a), 9 + r() * 6, Math.sin(t * 1.8 + k * 0.7) * 2.2, 0.25, Math.sin(a) > 0 ? "rgba(255,246,240,.55)" : "rgba(255,240,236,.3)");
    }
    ctx.save();
    bell(ctx, cx, top, rx, ry, rim, 0.4, 20);
    ctx.fillStyle = radial(ctx, cx - 3, top + 5, 1, cx, top + ry * 0.6, rx * 1.1, [
      [0, "rgba(255,255,255,.5)"],
      [1, "rgba(220,230,250,.2)"],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.stroke();
    ctx.restore();
    // 伞中一盏红灯：十字形的胃
    ctx.save();
    ctx.shadowColor = "rgba(255,40,30,.8)";
    ctx.shadowBlur = 5;
    const gy = top + ry * 0.62;
    for (let k = 0; k < 4; k++) {
      const a = TAU * (k / 4) + 0.3;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 3.2, gy + Math.sin(a) * 1.3, 2.4, 1.4, a, 0, TAU);
      ctx.fillStyle = "rgba(230,40,36,.85)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, gy, 3, 2.2, 0, 0, TAU);
    ctx.fillStyle = radial(ctx, cx - 0.8, gy - 0.6, 0.2, cx, gy, 3, [
      [0, "#ffb39a"],
      [0.5, "#ff3b2f"],
      [1, "#a8101c"],
    ]);
    ctx.fill();
    ctx.restore();
  }

  function combjelly(ctx, t, o) {
    const cx = 50,
      cy = 30 + Math.sin(t * 0.8) * 1.2,
      rx = 12.5,
      ry = 19;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fillStyle = radial(ctx, cx - 4, cy - 8, 1, cx, cy, ry, [
      [0, "rgba(255,255,255,.34)"],
      [0.7, "rgba(214,234,252,.16)"],
      [1, "rgba(190,220,248,.26)"],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.stroke();
    // 体内的消化腔
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 3, 11, 0, 0, TAU);
    ctx.fillStyle = "rgba(255,226,214,.16)";
    ctx.fill();
    // 八列栉板：细密的短栉片，一道彩虹亮带沿着每一列从上往下流过（贴图只烘焙身体，栉板在舱里逐帧叠加）
    if (!o.noRows) combRows(ctx, t, cx, cy, rx, ry);
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy - 10, 3.2, 6, -0.3, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.fill();
    ctx.restore();
  }
  function combRows(ctx, t, cx = 50, cy = 30 + Math.sin(t * 0.8) * 1.2, rx = 12.5, ry = 19) {
    const rows = [-0.95, -0.66, -0.3, 0.3, 0.66, 0.95, -0.5, 0.5];
    rows.forEach((p, k) => {
      const back = k >= 6;
      // 先画栉列本身：一条淡淡的细线
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const s = 0.07 + (i / 30) * 0.86;
        const x = cx + rx * p * Math.sin(Math.PI * s) * (back ? 0.75 : 1),
          y = cy - ry + 2 * ry * s;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineWidth = 0.35;
      ctx.strokeStyle = back ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.28)";
      ctx.stroke();
      for (let i = 0; i < 26; i++) {
        const s = 0.08 + (i / 25) * 0.84;
        const x = cx + rx * p * Math.sin(Math.PI * s) * (back ? 0.75 : 1),
          y = cy - ry + 2 * ry * s;
        // 亮带位置随时间下移，栉片经过亮带时显出彩虹色
        const band = Math.pow(0.5 + 0.5 * Math.cos((s * 2.2 - t * 0.55 - k * 0.13) * TAU), 6);
        const hue = (s * 300 + k * 35 - t * 90) % 360;
        const a = (back ? 0.18 : 0.35) + band * (back ? 0.35 : 0.65);
        ctx.beginPath();
        const dx = 0.55 * (p >= 0 ? 1 : -1);
        ctx.moveTo(x - dx * 0.6, y - 0.25);
        ctx.lineTo(x + dx * 0.6, y + 0.25);
        ctx.lineWidth = back ? 0.35 : 0.5;
        ctx.strokeStyle = `hsla(${(hue + 360) % 360},95%,${68 + band * 14}%,${a})`;
        ctx.stroke();
      }
    });
  }

  function seaangel(ctx, t, o) {
    const cx = 50,
      bob = Math.sin(t * 2.2 * TAU * 0.5) * 0.8,
      head = 13 + bob;
    const flap = Math.sin(t * 2.2 * Math.PI);
    // 两片翼足：在颈部两侧扇动
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * 3.5, head + 7);
      ctx.rotate(side * (0.25 + 0.75 * flap));
      ctx.beginPath();
      ctx.ellipse(side * 9, 0, 9.5, 4.2, side * 0.15, 0, TAU);
      ctx.fillStyle = radial(ctx, side * 6, -1, 0.5, side * 9, 0, 10, [
        [0, "rgba(246,250,255,.62)"],
        [1, "rgba(206,224,248,.3)"],
      ]);
      ctx.fill();
      ctx.lineWidth = 0.45;
      ctx.strokeStyle = "rgba(255,255,255,.6)";
      ctx.stroke();
      ctx.restore();
    }
    // 身体：上圆下尖
    ctx.beginPath();
    ctx.moveTo(cx, head - 5.5);
    ctx.bezierCurveTo(cx + 6.2, head - 5.5, cx + 6.5, head + 3, cx + 4.2, head + 6);
    ctx.bezierCurveTo(cx + 7.5, head + 12, cx + 4, head + 26, cx, head + 33);
    ctx.bezierCurveTo(cx - 4, head + 26, cx - 7.5, head + 12, cx - 4.2, head + 6);
    ctx.bezierCurveTo(cx - 6.5, head + 3, cx - 6.2, head - 5.5, cx, head - 5.5);
    ctx.fillStyle = radial(ctx, cx - 2, head + 2, 0.5, cx, head + 12, 22, [
      [0, "rgba(255,255,255,.66)"],
      [1, "rgba(206,224,250,.34)"],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = "rgba(255,255,255,.62)";
    ctx.stroke();
    // 心口一点橙红
    ctx.save();
    ctx.shadowColor = "rgba(255,110,40,.7)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.ellipse(cx, head + 15, 3.1, 7.5, 0, 0, TAU);
    ctx.fillStyle = radial(ctx, cx - 0.8, head + 12, 0.3, cx, head + 15, 7.5, [
      [0, "#ffc27a"],
      [0.5, "#ff7a2c"],
      [1, "#c2401a"],
    ]);
    ctx.fill();
    ctx.restore();
    // 头顶两粒小红点
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * 1.6, head - 3.6, 0.8, 0, TAU);
      ctx.fillStyle = "rgba(240,96,60,.8)";
      ctx.fill();
    }
  }

  // 章鱼的一条腕：从根部按曲率卷出去，越到末端越细，内侧一排吸盘
  function arm(ctx, x, y, angle, len, width, curl, t, k, colors, suckers) {
    const n = 26,
      pts = [];
    let a = angle,
      px = x,
      py = y;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      pts.push([px, py, a, s]);
      a += ((curl * Math.pow(s, 2.6) * 3.2 + Math.sin(t * 0.7 + k * 1.3 + s * 3) * 0.1) / n) * 6;
      px += (Math.cos(a) * len) / n;
      py += (Math.sin(a) * len) / n;
    }
    const left = [],
      right = [];
    for (const [px2, py2, a2, s] of pts) {
      const w = width * Math.pow(1 - s, 0.85) + 0.25;
      left.push([px2 + Math.cos(a2 - Math.PI / 2) * w, py2 + Math.sin(a2 - Math.PI / 2) * w]);
      right.push([px2 + Math.cos(a2 + Math.PI / 2) * w, py2 + Math.sin(a2 + Math.PI / 2) * w]);
    }
    ctx.beginPath();
    left.forEach(([px2, py2], i) => (i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2)));
    right.reverse().forEach(([px2, py2]) => ctx.lineTo(px2, py2));
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y, pts[n][0], pts[n][1]);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = colors[2];
    ctx.stroke();
    if (suckers)
      for (let i = 3; i < n - 2; i += 2) {
        const [px2, py2, a2, s] = pts[i];
        const w = width * Math.pow(1 - s, 0.85);
        ctx.beginPath();
        ctx.arc(px2 + Math.cos(a2 + Math.PI / 2) * w * 0.7, py2 + Math.sin(a2 + Math.PI / 2) * w * 0.7, Math.max(0.25, w * 0.42), 0, TAU);
        ctx.fillStyle = suckers;
        ctx.fill();
      }
    return pts;
  }
  function octopus(ctx, t, o, palette) {
    const p = palette || {
      mantle: ["#f0a07a", "#bf5a34", "#6c2717"],
      arm: ["#c9643b", "#e8a07a", "rgba(90,30,18,.55)"],
      back: ["#8e3d24", "#b8694a", "rgba(70,24,14,.5)"],
      sucker: "rgba(255,226,200,.85)",
      spot: "rgba(120,40,24,.35)",
    };
    const breathe = 1 + 0.035 * Math.sin(t * 1.6);
    // 后排四条腕
    [
      [3.05, 34, -0.35],
      [2.75, 30, -0.55],
      [0.15, 32, 0.4],
      [0.45, 28, 0.6],
    ].forEach(([a, len, curl], k) => arm(ctx, 49 + k * 3, 37, a, len, 2.4, curl, t, k + 4, p.back, null));
    // 外套膜（头后的囊）
    ctx.save();
    ctx.translate(46, 22);
    ctx.rotate(-0.5);
    ctx.scale(breathe, breathe);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 10.5, 0, 0, TAU);
    ctx.fillStyle = radial(ctx, -4, -4, 1, 0, 0, 15, [
      [0, p.mantle[0]],
      [0.55, p.mantle[1]],
      [1, p.mantle[2]],
    ]);
    ctx.fill();
    const r = rand(23);
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.ellipse((r() - 0.5) * 22, (r() - 0.5) * 16, 0.8 + r() * 1.4, 0.5 + r() * 0.9, r() * 3, 0, TAU);
      ctx.fillStyle = p.spot;
      ctx.fill();
    }
    ctx.restore();
    if (palette?.rings) palette.rings(ctx, t, 46, 22);
    // 头部与眼睛
    ctx.beginPath();
    ctx.ellipse(55, 30, 8, 6.5, 0.2, 0, TAU);
    ctx.fillStyle = radial(ctx, 53, 27, 1, 55, 30, 9, [
      [0, p.mantle[0]],
      [1, p.mantle[1]],
    ]);
    ctx.fill();
    // 前排四条腕，带吸盘
    const front = [
      [2.55, 40, -0.9],
      [2.05, 34, -1.1],
      [0.95, 36, 1.1],
      [0.45, 40, 0.9],
    ].map(([a, len, curl], k) => arm(ctx, 50 + k * 3, 36, a, len, 3, curl, t, k, p.arm, p.sucker));
    if (palette?.rings) front.forEach((pts, k) => palette.armRings(ctx, t, pts, k));
    ctx.beginPath();
    ctx.ellipse(59.5, 27.5, 2.6, 2.3, 0, 0, TAU);
    ctx.fillStyle = "#f3d27a";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(59.6, 27.6, 1.6, 0.55, 0, 0, TAU);
    ctx.fillStyle = "#1c120c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(58.8, 26.8, 0.45, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fill();
  }
  function blueringed(ctx, t, o) {
    const glow = 0.55 + 0.45 * Math.max(0, Math.sin(t * 1.3));
    const ring = (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.lineWidth = r * 0.55;
      ctx.strokeStyle = "rgba(48,30,14,.85)";
      ctx.stroke();
      ctx.lineWidth = r * 0.3;
      ctx.strokeStyle = `rgba(70,${190 + 50 * glow},255,${0.6 + 0.4 * glow})`;
      ctx.shadowColor = "rgba(60,200,255,.8)";
      ctx.shadowBlur = 3 * glow;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    octopus(ctx, t, o, {
      mantle: ["#f2d896", "#cfa556", "#7c5a26"],
      arm: ["#caa052", "#ead08e", "rgba(90,62,24,.5)"],
      back: ["#9c7838", "#c49c5c", "rgba(70,50,20,.45)"],
      sucker: "rgba(255,240,200,.8)",
      spot: "rgba(120,86,36,.25)",
      rings(c, tt, x, y) {
        c.save();
        c.translate(x, y);
        c.rotate(-0.55);
        [
          [-6, -3, 1.8],
          [0, -5, 2],
          [5, -1, 1.7],
          [-3, 3, 1.6],
          [3, 4, 1.5],
          [-9, 1, 1.3],
          [8, -5, 1.2],
        ].forEach(([rx, ry, r]) => ring(rx, ry, r));
        c.restore();
      },
      armRings(c, tt, pts) {
        for (let i = 4; i < pts.length - 4; i += 5) ring(pts[i][0], pts[i][1], 1.1 * (1 - pts[i][3] * 0.6));
      },
    });
  }

  function starfish(ctx, t, o) {
    const cx = 50,
      cy = 41,
      R = 30,
      inner = 0.34;
    const sq = 0.5; // 平躺在沙上，透视压扁
    const lens = [0, 1, 2, 3, 4].map((k) => 1 + 0.05 * Math.sin(t * 0.5 + k * 1.7));
    const pt = (th) => {
      const k = Math.round(((th + Math.PI / 2) / TAU) * 5 + 5) % 5;
      const shape = Math.pow(0.5 + 0.5 * Math.cos(5 * (th + Math.PI / 2)), 1.7);
      const r = R * (inner + (1 - inner) * shape * lens[k]);
      return [cx + r * Math.cos(th), cy + r * Math.sin(th) * sq];
    };
    // 投影
    ctx.save();
    ctx.filter = "blur(1.5px)";
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 2.5, R * 0.62, R * 0.24, 0, 0, TAU);
    ctx.fillStyle = "rgba(40,50,30,.22)";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const [x, y] = pt((i / 200) * TAU);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = radial(ctx, cx - 4, cy - 3, 1, cx, cy, R * 0.9, [
      [0, "#ff9c6a"],
      [0.45, "#ec5a33"],
      [1, "#a92f1f"],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(110,30,18,.7)";
    ctx.stroke();
    // 每条腕中线的高光与疣突
    for (let k = 0; k < 5; k++) {
      const th = -Math.PI / 2 + (k / 5) * TAU;
      const L = R * lens[k] * 0.92;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(th) * L, cy + Math.sin(th) * L * sq);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "rgba(255,190,140,.28)";
      ctx.stroke();
      for (let i = 1; i <= 7; i++) {
        const s = i / 8,
          w = (1 - s) * 3.4;
        for (const side of [-1, 0, 1]) {
          const x = cx + Math.cos(th) * L * s + Math.cos(th + Math.PI / 2) * w * side,
            y = cy + (Math.sin(th) * L * s + Math.sin(th + Math.PI / 2) * w * side) * sq;
          ctx.beginPath();
          ctx.arc(x, y, (side ? 0.55 : 0.8) * (1 - s * 0.5), 0, TAU);
          ctx.fillStyle = side ? "rgba(255,214,160,.8)" : "rgba(255,236,196,.95)";
          ctx.fill();
        }
      }
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3, 1.6, 0, 0, TAU);
    ctx.fillStyle = "rgba(255,226,180,.9)";
    ctx.fill();
  }

  function nautilus(ctx, t, o) {
    const cx = 44,
      cy = 30 + Math.sin(t * 0.9) * 0.8,
      R = 19;
    // 触手：从壳口伸出
    const r = rand(31);
    for (let k = 0; k < 22; k++) {
      const a = -0.6 + (k / 21) * 1.3;
      const len = 7 + r() * 6;
      ctx.beginPath();
      const x = cx + R * 0.98,
        y = cy + 2 + a * 9;
      ctx.moveTo(x, y);
      const sw = Math.sin(t * 1.2 + k) * 1.3;
      ctx.quadraticCurveTo(x + len * 0.6, y + a * 4 + sw, x + len, y + a * 7 + sw * 1.5);
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = "rgba(246,226,200,.85)";
      ctx.stroke();
    }
    // 壳：外圈 + 壳口
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.82, cy - R * 0.62);
    ctx.bezierCurveTo(cx + R * 0.2, cy - R * 1.12, cx - R * 1.05, cy - R * 0.85, cx - R * 1.02, cy + R * 0.02);
    ctx.bezierCurveTo(cx - R * 0.98, cy + R * 0.95, cx + R * 0.2, cy + R * 1.12, cx + R * 0.88, cy + R * 0.66);
    ctx.bezierCurveTo(cx + R * 1.08, cy + R * 0.35, cx + R * 1.1, cy - R * 0.35, cx + R * 0.82, cy - R * 0.62);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, cx - 6, cy - 7, 1, cx, cy, R * 1.1, [
      [0, "#fffaf0"],
      [0.6, "#f2e2c4"],
      [1, "#d7bf96"],
    ]);
    ctx.fill();
    ctx.clip();
    // 虎纹：从脐部放射、火焰状弯曲，只在壳的后半部
    for (let k = 0; k < 13; k++) {
      const a = Math.PI * 0.2 + (k / 12) * Math.PI * 1.25;
      ctx.beginPath();
      const ux = cx - 4,
        uy = cy;
      ctx.moveTo(ux + Math.cos(a) * 4, uy + Math.sin(a) * 4);
      const mx = ux + Math.cos(a + 0.35) * R * 0.7,
        my = uy + Math.sin(a + 0.35) * R * 0.7;
      ctx.quadraticCurveTo(mx, my, ux + Math.cos(a + 0.15) * R * 1.3, uy + Math.sin(a + 0.15) * R * 1.3);
      ctx.lineWidth = 2.4 + (k % 3) * 0.6;
      ctx.strokeStyle = "rgba(156,70,36,.72)";
      ctx.stroke();
    }
    // 壳口附近的珍珠光泽
    ctx.beginPath();
    ctx.ellipse(cx + R * 0.6, cy, R * 0.45, R * 0.75, 0, 0, TAU);
    ctx.fillStyle = "rgba(255,250,240,.22)";
    ctx.fill();
    ctx.restore();
    // 脐部小漩涡
    ctx.beginPath();
    ctx.arc(cx - 4, cy, 2.6, 0, TAU);
    ctx.fillStyle = "rgba(90,50,30,.55)";
    ctx.fill();
    // 头罩与眼
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.82, cy - R * 0.62);
    ctx.quadraticCurveTo(cx + R * 1.25, cy - R * 0.55, cx + R * 1.2, cy - R * 0.05);
    ctx.quadraticCurveTo(cx + R * 0.95, cy + R * 0.05, cx + R * 0.86, cy - R * 0.2);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, cx + R, cy - R * 0.45, 0.5, cx + R, cy - R * 0.3, R * 0.5, [
      [0, "#b8784a"],
      [1, "#6e3c22"],
    ]);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(cx + R * (0.95 + (i % 3) * 0.08), cy - R * (0.45 - Math.floor(i / 3) * 0.18), 0.55, 0, TAU);
      ctx.fillStyle = "rgba(255,240,220,.7)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx + R * 1.06, cy + R * 0.08, 1.7, 0, TAU);
    ctx.fillStyle = "#2b1a12";
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(255,230,190,.7)";
    ctx.stroke();
  }

  const DRAW = { moonjelly, purplejelly, immortal, combjelly, seaangel, octopus: (c, t, o) => octopus(c, t, o), blueringed, starfish, nautilus };
  // 在 100×60 盒子里画一只；silhouette 为图鉴里未发现时的剪影
  function draw(ctx, kind, t = 0.9, opts = {}) {
    const f = DRAW[kind];
    if (!f) return;
    ctx.save();
    f(ctx, t, opts);
    ctx.restore();
  }
  function dataURL(kind, silhouette = false) {
    const key = kind + (silhouette ? ":s" : "");
    if (cache.has(key)) return cache.get(key);
    if (typeof document === "undefined") return "";
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    ctx.scale(5, 5);
    draw(ctx, kind, 0.9);
    if (silhouette) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "rgba(135,160,153,.65)";
      ctx.fillRect(0, 0, 500, 300);
    }
    const url = canvas.toDataURL("image/png");
    cache.set(key, url);
    return url;
  }
  // 精细贴图：上面的造型在离线时补上立体光影（充气高度 → 法线 → 漫反射、湿润高光、轮廓光、缝隙阴影；水母类做成菲涅尔玻璃感）
  const sprites = new Map();
  function sprite(kind) {
    if (!sprites.has(kind) && typeof Image !== "undefined") {
      const img = new Image();
      img.src = `knowledge-garden-v19/creature-${kind}.webp`;
      sprites.set(kind, img);
    }
    return sprites.get(kind);
  }
  // 舱里的动画：贴图切成细条，按行或列错开——伞盖收缩、触手和腕摆动、翼足扇动
  const bellPulse = (top, bottom, period, sway) => (y, t) => {
    const c = pulse(t, period);
    if (y < bottom) return [0, 1 - 0.1 * c * (1 - (0.3 * (y - top)) / (bottom - top))];
    const k = Math.min(1, (y - bottom) / 26);
    return [Math.sin(t * 1.4 - (y - bottom) * 0.22) * sway * k, 1 - 0.06 * c];
  };
  const DEFORM = {
    moonjelly: { rows: bellPulse(5, 21, 2.8, 1.6) },
    purplejelly: { rows: bellPulse(3, 16, 3.4, 2.4) },
    immortal: { rows: bellPulse(8, 25, 1.5, 1.4) },
    octopus: { rows: (y, t) => [y > 30 ? 1.4 * Math.sin(t * 0.8 + y * 0.2) * ((y - 30) / 26) : 0, 1] },
    blueringed: { rows: (y, t) => [y > 30 ? 1.2 * Math.sin(t * 0.9 + y * 0.22) * ((y - 30) / 26) : 0, 1] },
    seaangel: { cols: (x, t) => -Math.sin(t * 2.2 * Math.PI) * Math.max(0, Math.abs(x - 50) - 5) * 0.32 },
    nautilus: { cols: (x, t) => (x > 60 ? 0.9 * Math.sin(t * 1.3 + x * 0.35) * ((x - 60) / 16) : 0) },
  };
  function drawSprite(ctx, kind, t) {
    const img = sprite(kind);
    if (!img || !img.complete || !img.naturalWidth) return draw(ctx, kind, t);
    const W = img.naturalWidth,
      H = img.naturalHeight,
      d = DEFORM[kind];
    if (!d) ctx.drawImage(img, 0, 0, 100, 60);
    else if (d.rows)
      for (let y = 0; y < 60; y += 1) {
        const [dx, k] = d.rows(y + 0.5, t);
        ctx.drawImage(img, 0, (y / 60) * H, W, H / 60, 50 - 50 * k + dx, y, 100 * k, 1.35);
      }
    else
      for (let x = 0; x < 100; x += 1) {
        const dy = d.cols(x + 0.5, t);
        ctx.drawImage(img, (x / 100) * W, 0, W / 100, H, x, dy, 1.35, 60);
      }
    // 栉水母的彩虹栉板逐帧流动
    if (kind === "combjelly") combRows(ctx, t, 50, 30 + Math.sin(t * 0.8) * 1.2);
  }
  return { draw, drawSprite, sprite, dataURL, combRows, kinds: Object.keys(DRAW) };
})();
if (typeof module !== "undefined") module.exports = CreatureArt;
