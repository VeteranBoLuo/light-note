/* 水族游动：侧面原画生成有厚度的双面网格，沿连续航向旋转。
   身体结构保持刚性，尾鳍、外缘鱼鳍和水族肢体使用局部动作。
   镜头切换只映射水域坐标，保留路线、速度、相位与转身进度。 */
const FishMotion = (() => {
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const smooth = (n) => {
    const v = clamp(n);
    return v * v * (3 - 2 * v);
  };
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const FLIP_SECONDS = 2.6;
  const NX = 48,
    NY = 28; // 网格：头尾方向 48 段、上下 28 段
  const portraits = new Map();
  const atlases = new Map();
  let current = null;

  // 按鱼种：tail 尾鳍最大摆角（弧度）、fin 鳍的扇动幅度（贴图比例）、hinge 尾柄位置、beat 每秒摆尾次数、thick 身体厚度（宽/高）
  const SPECIES = {
    neon: { tail: 0.55, fin: 0.006, hinge: 0.25, beat: 2, thick: 0.45 },
    medaka: { tail: 0.55, fin: 0.006, hinge: 0.26, beat: 1.9, thick: 0.45 },
    blue: { tail: 0.5, fin: 0.006, hinge: 0.28, beat: 1.7, thick: 0.45 },
    clown: { tail: 0.5, fin: 0.008, hinge: 0.25, beat: 1.6, thick: 0.5 },
    tang: { tail: 0.45, fin: 0.008, hinge: 0.24, beat: 1.3, thick: 0.3 },
    butterfly: { tail: 0.4, fin: 0.008, hinge: 0.22, beat: 1.2, thick: 0.25 },
    discus: { tail: 0.38, fin: 0.01, hinge: 0.2, beat: 1, thick: 0.2 },
    angel: { tail: 0.35, fin: 0.012, hinge: 0.22, beat: 0.9, thick: 0.18 },
    amber: { tail: 0.5, fin: 0.008, hinge: 0.3, beat: 1.1, thick: 0.6 },
    pearl: { tail: 0.6, fin: 0.014, hinge: 0.36, beat: 1, thick: 0.7 },
    ink: { tail: 0.6, fin: 0.014, hinge: 0.36, beat: 1, thick: 0.7 },
    moon: { tail: 0.65, fin: 0.016, hinge: 0.38, beat: 0.9, thick: 0.7 },
    guppy: { tail: 0.7, fin: 0.012, hinge: 0.4, beat: 1.4, thick: 0.4 },
    betta: { tail: 0.55, fin: 0.018, hinge: 0.42, beat: 0.8, thick: 0.4 },
    arowana: { tail: 0.35, fin: 0.006, hinge: 0.24, beat: 0.8, thick: 0.45 },
    lion: { tail: 0.35, fin: 0.014, hinge: 0.22, beat: 0.8, thick: 0.45 },
    turtlefish: { tail: 0.45, fin: 0.008, hinge: 0.26, beat: 1.1, thick: 0.5 },
    puffer: { tail: 0.45, fin: 0.01, hinge: 0.2, beat: 1.4, thick: 0.85 },
    tuna: { tail: 0.35, fin: 0.003, hinge: 0.25, beat: 1.2, thick: 0.75 },
    reef: { tail: 0.4, fin: 0.003, hinge: 0.3, beat: 0.6, thick: 0.7 },
    hammer: { tail: 0.4, fin: 0.003, hinge: 0.3, beat: 0.6, thick: 0.65 },
    whale: { tail: 0.3, fin: 0.002, hinge: 0.3, beat: 0.45, thick: 0.85 },
    ray: { tail: 0, fin: 0, hinge: 0, beat: 0.5, thick: 0.15 },
    seahorse: { tail: 0, fin: 0, hinge: 0, beat: 1.2, thick: 0.35 },
  };
  // 第三批：每种鱼明确配置体型、摆尾与巡游节奏，鳗形鱼和鳐用独立身体形变。
  Object.assign(SPECIES, {
    zebra: { tail: 0.56, fin: 0.006, hinge: 0.25, beat: 2.3, thick: 0.42, cruise: 0.56, turn: 1.4, hover: 0.2 },
    platy: { tail: 0.5, fin: 0.009, hinge: 0.27, beat: 1.5, thick: 0.55, cruise: 0.34, turn: 1.8, hover: 0.3 },
    cory: { tail: 0.48, fin: 0.012, hinge: 0.28, beat: 1.8, thick: 0.65, cruise: 0.28, turn: 1.9, hover: 0.55, lane: "bottom" },
    ryukin: { tail: 0.65, fin: 0.018, hinge: 0.36, beat: 0.9, thick: 0.8, cruise: 0.24, turn: 2.2, hover: 0.4 },
    gourami: { tail: 0.4, fin: 0.014, hinge: 0.24, beat: 1, thick: 0.32, cruise: 0.26, turn: 2, hover: 0.45 },
    pleco: { tail: 0.38, fin: 0.01, hinge: 0.27, beat: 0.8, thick: 0.4, cruise: 0.13, turn: 2.4, hover: 0.65, lane: "bottom" },
    bitterling: { tail: 0.5, fin: 0.008, hinge: 0.25, beat: 1.9, thick: 0.3, cruise: 0.4, turn: 1.6, hover: 0.3 },
    loach: { tail: 0, fin: 0.005, hinge: 0, beat: 1.1, thick: 0.6, cruise: 0.26, turn: 2.1, hover: 0.5, lane: "bottom" },
    trout: { tail: 0.4, fin: 0.006, hinge: 0.25, beat: 1.5, thick: 0.62, cruise: 0.42, turn: 1.8, hover: 0.12 },
    char: { tail: 0.42, fin: 0.007, hinge: 0.25, beat: 1.3, thick: 0.62, cruise: 0.36, turn: 2, hover: 0.18 },
    salmon: { tail: 0.4, fin: 0.005, hinge: 0.26, beat: 1, thick: 0.65, cruise: 0.26, turn: 2.4, hover: 0.08 },
    sturgeon: { tail: 0.42, fin: 0.008, hinge: 0.26, beat: 0.75, thick: 0.55, cruise: 0.2, turn: 2.6, hover: 0.1 },
    rummy: { tail: 0.6, fin: 0.006, hinge: 0.26, beat: 2.4, thick: 0.4, cruise: 0.56, turn: 1.4, hover: 0.2 },
    ram: { tail: 0.45, fin: 0.012, hinge: 0.25, beat: 1.6, thick: 0.36, cruise: 0.33, turn: 1.7, hover: 0.4 },
    oscar: { tail: 0.42, fin: 0.01, hinge: 0.24, beat: 1, thick: 0.55, cruise: 0.25, turn: 2.1, hover: 0.35 },
    redtail: { tail: 0.4, fin: 0.008, hinge: 0.28, beat: 0.8, thick: 0.72, cruise: 0.21, turn: 2.4, hover: 0.25, lane: "bottom" },
    eel: { tail: 0, fin: 0.006, hinge: 0, beat: 0.65, thick: 0.8, cruise: 0.19, turn: 3.5, hover: 0.1, serpentine: true },
    arapaima: { tail: 0.34, fin: 0.005, hinge: 0.23, beat: 0.65, thick: 0.7, cruise: 0.16, turn: 2.6, hover: 0.08 },
    damsel: { tail: 0.54, fin: 0.01, hinge: 0.24, beat: 2, thick: 0.4, cruise: 0.46, turn: 1.5, hover: 0.3 },
    chromis: { tail: 0.6, fin: 0.007, hinge: 0.26, beat: 2.2, thick: 0.35, cruise: 0.5, turn: 1.5, hover: 0.18 },
    boxfish: { tail: 0.3, fin: 0.014, hinge: 0.21, beat: 2.1, thick: 0.9, cruise: 0.19, turn: 2.3, hover: 0.55 },
    moorish: { tail: 0.36, fin: 0.018, hinge: 0.2, beat: 1, thick: 0.24, cruise: 0.28, turn: 2.2, hover: 0.3 },
    parrot: { tail: 0.4, fin: 0.01, hinge: 0.25, beat: 1, thick: 0.62, cruise: 0.24, turn: 2.3, hover: 0.4 },
    mandarin: { tail: 0.4, fin: 0.016, hinge: 0.27, beat: 1.4, thick: 0.55, cruise: 0.17, turn: 2.2, hover: 0.6, lane: "bottom" },
    flyingfish: { tail: 0.45, fin: 0.016, hinge: 0.24, beat: 1.8, thick: 0.5, cruise: 0.48, turn: 1.7, hover: 0.12, lane: "upper" },
    lantern: { tail: 0.5, fin: 0.008, hinge: 0.26, beat: 1.5, thick: 0.5, cruise: 0.3, turn: 1.8, hover: 0.35 },
    swordfish: { tail: 0.32, fin: 0.004, hinge: 0.18, finRig:'sword', beat: 1.1, thick: 0.65, cruise: 0.24, turn: 2.6, hover: 0.04 },
    angler: { tail: 0.28, fin: 0.012, hinge: 0.22, beat: 0.85, thick: 0.95, cruise: 0.13, turn: 2.6, hover: 0.6 },
    sunfish: { tail: 0, fin: 0.012, hinge: 0, finRig:'sun', beat: 0.7, thick: 0.34, cruise: 0.16, turn: 2.6, hover: 0.25 },
    oarfish: { tail: 0, fin: 0.006, hinge: 0, beat: 0.45, thick: 0.28, cruise: 0.14, turn: 4, hover: 0.12, serpentine: true },
    seabream: { tail: 0.44, fin: 0.009, hinge: 0.23, beat: 1.2, thick: 0.4, cruise: 0.32, turn: 1.9, hover: 0.25 },
    mackerel: { tail: 0.45, fin: 0.005, hinge: 0.25, beat: 1.7, thick: 0.58, cruise: 0.46, turn: 1.6, hover: 0.08 },
    flounder: { tail: 0.34, fin: 0.016, hinge: 0.2, beat: 0.85, thick: 0.18, cruise: 0.16, turn: 2.4, hover: 0.6, lane: "bottom" },
    garibaldi: { tail: 0.44, fin: 0.012, hinge: 0.24, beat: 1.2, thick: 0.42, cruise: 0.31, turn: 2, hover: 0.4 },
    seadragon: { tail: 0, fin: 0, hinge: 0, beat: 0.9, thick: 0.3, cruise: 0.16, turn: 2.5, hover: 0.55 },
    manta: { tail: 0, fin: 0, hinge: 0, beat: 0.4, thick: 0.24, cruise: 0.18, turn: 2.6, hover: 0.08 },
    rasbora: { tail:.48, fin:.008, hinge:.26, beat:2.1, thick:.42, cruise:.46, turn:1.6, hover:.22 },
    galaxy: { tail:.52, fin:.014, hinge:.28, beat:2.4, thick:.48, cruise:.42, turn:1.5, hover:.3 },
    killifish: { tail:.42, fin:.018, hinge:.31, beat:1.3, thick:.38, cruise:.28, turn:2, hover:.4, lane:"upper" },
    glasscat: { tail:.34, fin:.006, hinge:.24, beat:1.6, thick:.32, cruise:.25, turn:2.2, hover:.5 },
    bichir: { tail:0, fin:.012, hinge:0, beat:.72, thick:.72, cruise:.19, turn:3.1, hover:.35, serpentine:true, lane:"bottom" },
    paddlefish: { tail:.65, fin:.010, hinge:.18, finRig:'paddle', beat:.9, thick:.56, cruise:.23, turn:3.3, hover:.05 },
    frogfish: { tail:.12, fin:.022, hinge:.22, beat:.7, thick:1.1, cruise:.11, turn:3, hover:.7, lane:"bottom" },
    flashlight: { tail:.38, fin:.009, hinge:.26, beat:1.5, thick:.65, cruise:.28, turn:2, hover:.4 },
    jawfish: { tail:.4, fin:.014, hinge:.27, beat:1.2, thick:.7, cruise:.22, turn:2.1, hover:.55 },
    batfish: { tail:.22, fin:.025, hinge:.19, beat:.65, thick:.3, cruise:.16, turn:3, hover:.45 },
    sawfish: { tail:.75, fin:.012, hinge:.11, finRig:'saw', beat:.8, thick:.25, cruise:.19, turn:3.6, hover:.04 },
    ribboneel: { tail:0, fin:.004, hinge:0, beat:.65, thick:.35, cruise:.2, turn:3.6, hover:.2, serpentine:true },
  });
  // cruise：巡游速度（体长/秒）；turn：掉头用时（秒）；hover：到点后悬停的概率
  function gait(kind) {
    if (typeof CreatureMotion !== "undefined" && CreatureMotion.PROFILES[kind]) return CreatureMotion.gait(kind);
    const group = ["whale", "reef", "hammer", "tuna", "arowana"].includes(kind)
      ? { cruise: 0.18, turn: 2.6, hover: 0.05 }
      : ["betta", "moon", "guppy", "pearl", "ink", "angel", "discus", "puffer", "butterfly", "lion"].includes(kind)
        ? { cruise: 0.3, turn: 1.9, hover: 0.4 }
        : { cruise: 0.5, turn: 1.5, hover: 0.25 };
    const g={ ...group, ...(SPECIES[kind] || SPECIES.blue) };
    return {...g,cruise:g.cruise*.62,turn:Math.max(g.turn,group.cruise===.18?3.8:2.2)};
  }

  // 鱼的轮廓：每列的中心与“身体”半高（去掉鳍的凸起），用于判断哪里是鳍
  function bodyShape(rgba, w, h) {
    const COLS = NX + 1;
    const c = new Float32Array(COLS),
      half = new Float32Array(COLS);
    for (let i = 0; i < COLS; i++) {
      const x = Math.min(w - 1, Math.round((i / (COLS - 1)) * (w - 1)));
      let top = -1,
        bottom = -1;
      for (let y = 0; y < h; y++)
        if (rgba[(y * w + x) * 4 + 3] > 60) {
          if (top < 0) top = y;
          bottom = y;
        }
      c[i] = top < 0 ? 0.5 : (top + bottom) / 2 / h;
      half[i] = top < 0 ? 0 : (bottom - top) / 2 / h;
    }
    // 鳍是轮廓上的凸起：取邻近几列的最小半高再平滑，得到身体本身的半高
    const body = new Float32Array(COLS);
    for (let i = 0; i < COLS; i++) {
      let m = Infinity;
      for (let k = -5; k <= 5; k++) m = Math.min(m, half[clamp(i + k, 0, COLS - 1)]);
      body[i] = m;
    }
    const smoothBody = body.map((_, i) => {
      let sum = 0,
        n = 0;
      for (let k = -3; k <= 3; k++) {
        sum += body[clamp(i + k, 0, COLS - 1)];
        n++;
      }
      return sum / n;
    });
    return { c, body: smoothBody };
  }
  // 某点属于鳍的程度（0 身体 → 1 鳍）：在身体轮廓之外、尾柄之前
  function finWeight(u, v, shape, g, bind={minU:0,maxU:1}) {
    const i = Math.round(u * NX);
    const q=clamp((u-bind.minU)/(bind.maxU-bind.minU));
    if(g.finRig){
      const v0=bind.minV??0,v1=bind.maxV??1,t=(v-v0)/(v1-v0),span=(a,b)=>smooth((q-a)/.04)*smooth((b-q)/.04);
      if(g.finRig==='sword')return Math.max(span(.23,.62)*smooth((.40-t)/.12),span(.22,.58)*smooth((t-.80)/.12));
      if(g.finRig==='sun')return span(.18,.48)*Math.max(smooth((.26-t)/.12),smooth((t-.77)/.12));
      // 长吻与躯干不参与形变；只绑定背鳍、臀鳍及胸鳍伸出身体的部分。
      return g.finRig==='paddle'?Math.max(span(.24,.44)*smooth((.32-t)/.15),span(.28,.55)*smooth((t-.72)/.15),span(.17,.31)*smooth((t-.70)/.15))
        :Math.max(span(.18,.40)*smooth((.30+.55*q-t)/.15),span(.24,.48)*smooth((t-(.48+.65*q))/.15));
    }
    const off = Math.abs(v - shape.c[i]),
      body = shape.body[i];
    if (body <= 0 || q > .78 || off < body*.9) return 0;
    return smooth((off - body*.9) / Math.max(0.02, body * 0.3)) * smooth((q - g.hinge - 0.02) / 0.06) * smooth((0.9 - q) / 0.08);
  }
  function contentBounds(rgba,w,h) {
    let minX=w,minY=h,maxX=0,maxY=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>40){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    return minX>=maxX?{minU:0,maxU:1,minV:0,maxV:1}:{minU:minX/w,maxU:(maxX+1)/w,minV:minY/h,maxV:(maxY+1)/h};
  }
  // 从侧面图（RGBA，w×h，对应贴图 100×60 单位）充气出立体身体：每个网格点的半厚度、鳍的权重、正面法线
  function inflate(rgba, w, h, g) {
    const sw = Math.round(w / 2),
      sh = Math.round(h / 2),
      INF = 1e9;
    // 半分辨率上做距离变换（到轮廓外最近像素的距离）
    const dist = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const inside=rgba[(y * 2 * w + x * 2) * 4 + 3] > (g.wholeBody ? 40 : 100);
        // 素材贴到图片边缘时，也把图片外视作轮廓外，避免距离保持无穷、整片失去厚度。
        dist[y * sw + x] = inside ? (x===0||y===0||x===sw-1||y===sh-1?1:INF) : 0;
      }
    const relax = (i, j, c) => {
      if (dist[j] + c < dist[i]) dist[i] = dist[j] + c;
    };
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x;
        if (x) relax(i, i - 1, 1);
        if (y) {
          relax(i, i - sw, 1);
          if (x) relax(i, i - sw - 1, 1.41);
          if (x < sw - 1) relax(i, i - sw + 1, 1.41);
        }
      }
    for (let y = sh - 1; y >= 0; y--)
      for (let x = sw - 1; x >= 0; x--) {
        const i = y * sw + x;
        if (x < sw - 1) relax(i, i + 1, 1);
        if (y < sh - 1) {
          relax(i, i + sw, 1);
          if (x < sw - 1) relax(i, i + sw + 1, 1.41);
          if (x) relax(i, i + sw - 1, 1.41);
        }
      }
    let dmax = 1;
    for (const d of dist) if (d < INF && d > dmax) dmax = d;
    const shape = bodyShape(rgba, w, h),bind=contentBounds(rgba,w,h);
    const cols = NX + 1,
      total = cols * (NY + 1);
    const active = new Uint8Array(total);
    const thick = new Float32Array(total),
      fin = new Float32Array(total);
    // 半分辨率像素 → 贴图单位：贴图宽 100 单位对应 sw 像素
    const unit = 100 / sw;
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++) {
        const u = i / NX,
          v = j / NY;
        const d = dist[Math.min(sh - 1, Math.round(v * (sh - 1))) * sw + Math.min(sw - 1, Math.round(u * (sw - 1)))];
        const k = j * cols + i;
        // 只用实际有像素的网格及相邻单元计算身体边界，透明贴图留白不算鱼身。
        for (const dx of [-1,0,1]) for (const dy of [-1,0,1]) {
          const ax=clamp(Math.round((u+dx/NX)*(w-1)),0,w-1), ay=clamp(Math.round((v+dy/NY)*(h-1)),0,h-1);
          if (rgba[(ay*w+ax)*4+3]>12) active[k]=1;
        }
        fin[k] = g.wholeBody ? 0 : finWeight(u, v, shape, g,bind);
        // 圆润的截面：厚度 ∝ √(到轮廓距离 × 最大距离)；鳍、尾鳍很薄
        const q=(u-bind.minU)/(bind.maxU-bind.minU);
        const tailThin = g.hinge ? 0.15 + 0.85 * smooth((q - g.hinge + 0.06) / 0.1) : 1;
        thick[k] = !d || d >= INF ? 0 : g.thick * Math.sqrt(d * dmax) * unit * tailThin * (1 - 0.85 * fin[k]);
      }
    // 抹平网格上的台阶
    const soft = new Float32Array(total);
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++) {
        if (!thick[j * cols + i]) continue;
        let sum = 0,
          n = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di,
              jj = j + dj;
            if (ii < 0 || jj < 0 || ii > NX || jj > NY) continue;
            sum += thick[jj * cols + ii];
            n++;
          }
        soft[j * cols + i] = sum / n;
      }
    // 正面法线（贴图单位）：(-∂h/∂x, -∂h/∂y, 1)
    const normal = new Float32Array(total * 3),
      du = 100 / NX,
      dv = 60 / NY;
    for (let j = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++) {
        const k = j * cols + i;
        const hx = (soft[j * cols + Math.min(NX, i + 1)] - soft[j * cols + Math.max(0, i - 1)]) / (2 * du);
        const hy = (soft[Math.min(NY, j + 1) * cols + i] - soft[Math.max(0, j - 1) * cols + i]) / (2 * dv);
        const l = Math.hypot(hx, hy, 1);
        normal[k * 3] = -hx / l;
        normal[k * 3 + 1] = -hy / l;
        normal[k * 3 + 2] = 1 / l;
      }
    return { thick: soft, fin, normal, shape, active,bind };
  }
  // 在透明轮廓附近把正反表面焊到同一圈零厚度顶点。
  // 外侧保留单层原画，薄鳍与抗锯齿边缘不会因背面重叠形成第二道轮廓。
  function sealMesh(rgba,w,h,body) {
    const cols=NX+1,points=[],front=[],back=[],solidFront=[],lookup=new Map();
    const alpha=(u,v)=>rgba[(clamp(Math.round(v*(h-1)),0,h-1)*w+clamp(Math.round(u*(w-1)),0,w-1))*4+3];
    const sample=(values,u,v)=>{
      const x=clamp(u)*NX,y=clamp(v)*NY,i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j;
      const at=(xx,yy)=>values[Math.min(NY,yy)*cols+Math.min(NX,xx)];
      return at(i,j)*(1-a)*(1-b)+at(i+1,j)*a*(1-b)+at(i,j+1)*(1-a)*b+at(i+1,j+1)*a*b;
    };
    const grid=Array.from({length:cols*(NY+1)},(_,k)=>{
      const u=(k%cols)/NX,v=Math.floor(k/cols)/NY;
      return {u,v,a:alpha(u,v),thick:u===0||u===1||v===0||v===1?0:body.thick[k],fin:body.fin[k],active:!!body.active[k]};
    });
    const crossing=(a,b)=>{
      const t=clamp((100-a.a)/(b.a-a.a)),u=a.u+(b.u-a.u)*t,v=a.v+(b.v-a.v)*t;
      return {u,v,a:100,thick:0,fin:sample(body.fin,u,v),active:true};
    };
    const clip=(tri,inside)=>{
      const polygon=[];
      for(let i=0;i<tri.length;i++){
        const a=tri[i],b=tri[(i+1)%tri.length],ai=(a.a>100)===inside,bi=(b.a>100)===inside;
        if(ai)polygon.push(a);
        if(ai!==bi)polygon.push(crossing(a,b));
      }
      return polygon;
    };
    const vertex=(p,side)=>{
      const sign=p.thick>1e-7?side:0,key=`${p.u.toFixed(7)}:${p.v.toFixed(7)}:${sign}`;
      if(!lookup.has(key)){lookup.set(key,points.length);points.push({...p,side:sign});}
      return lookup.get(key);
    };
    const fan=(poly,side,out)=>{
      for(let i=1;i+1<poly.length;i++){
        const tri=[poly[0],poly[i],poly[i+1]].map(p=>vertex(p,side));
        out.push(...(side<0?tri.reverse():tri));
      }
    };
    for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){
      const a=y*cols+x;
      for(const ids of [[a,a+1,a+cols],[a+cols,a+1,a+cols+1]]){
        const tri=ids.map(i=>grid[i]),inner=clip(tri,true),outer=clip(tri,false);
        fan(inner,1,front);fan(outer.map(p=>({...p,thick:0})),1,front);
        if(inner.some(p=>p.thick>1e-7)){fan(inner,1,solidFront);fan(inner,-1,back);}
      }
    }
    return {points,indices:new Uint16Array([...front,...back]),frontCount:front.length,solidIndices:new Uint16Array([...solidFront,...back]),data:new Float32Array(points.length*6)};
  }
  // 尾鳍此刻绕尾柄转过的角度（弧度）：尾柄之前为 0
  function tailAngle(u, s, g) {
    const q=g.bind?(u-g.bind.minU)/(g.bind.maxU-g.bind.minU):u;
    if (!g.tail || q >= g.hinge) return 0;
    return g.tail * (s.vary || 1) * s.amp * Math.sin(s.phase) * smooth((g.hinge - q) / 0.08);
  }
  // 魟鱼扇翅、海马背鳍（贴图比例位移）
  function special(kind, u, v, phase, intensity) {
    if(kind==="frogfish") {
      const paw=smooth((v-.55)/.35)*smooth((u-.2)/.25)*(1-smooth((u-.85)/.12));
      return [.012*paw*Math.cos(phase+u*12),.026*paw*Math.sin(phase+u*12),.016*paw*Math.cos(phase+u*12)];
    }
    if (kind === "loach") {
      const tail = smooth((.88 - u) / .8);
      const wave = Math.sin(phase - u * 8);
      return [0, .016 * tail * wave, .065 * tail * wave * intensity];
    }
    if (kind === "seahorse" || kind === "seadragon") {
      const fin = Math.exp(-Math.pow((u - 0.29) / 0.16, 2) - Math.pow((v - 0.48) / 0.22, 2));
      return [0.013 * fin * Math.sin(phase * 3 + v * 6), 0.004 * fin * Math.cos(phase * 3)];
    }
    if (kind === "ray" || kind === "manta") {
      const wing = smooth((Math.abs(v - 0.5) - 0.1) / 0.35) * smooth((u - 0.15) / 0.25);
      const a = phase - u * 3;
      return [0.01 * wing * Math.cos(a) * intensity, 0.05 * wing * Math.sin(a) * intensity, .05 * wing * Math.cos(a) * intensity];
    }
    return null;
  }
  // 直身素材沿等长脊柱蒙皮。波从头传向尾，摆幅经历舒展/弯曲周期；
  // 掉头时后半身滞后形成弧线，而不是把一张固定 S 形图片整体旋转。
  function serpentineFrames(s) {
    const frames = new Array(NX + 1);
    const envelope = 0.12 + 0.88 * Math.pow(Math.sin(s.phase / 2), 2);
    const amp = Math.min(1.35, s.amp) * (s.vary || 1) * envelope;
    const turn = s.mode === "turn" ? Math.sin(Math.PI * clamp(s.turnT)) * Math.sign(s.yawFrom - s.yawTo) : 0;
    function axes(u) {
      const tail = 1 - u;
      const wave = Math.sin(s.phase - tail * 5.5) * Math.pow(tail, 0.85);
      const yaw = 0.62 * amp * wave + turn * 0.95 * tail * tail;
      // 鳗形鱼主要沿水平侧向推进；不把侧摆复制成同幅度的上下折叠。
      const pitch = 0.025 * amp * Math.sin(s.phase*.5) * tail * tail;
      const c = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      return { t: [c * cp, sp, sn * cp], up: [-c * sp, cp, -sn * sp], front: [-sn, 0, c] };
    }
    let p = [50, 0, 0];
    for (let i = NX; i >= 0; i--) {
      frames[i] = { p: [...p], ...axes(i / NX) };
      if (i) {
        const t = axes((i - 0.5) / NX).t;
        p = p.map((n, j) => n - (100 / NX) * t[j]);
      }
    }
    const center = frames[NX / 2].p;
    for (const frame of frames) frame.p = frame.p.map((n, j) => n - center[j]);
    return frames;
  }
  // 略俯视的正交镜头，让左右摆尾在侧身时也有可见行程，转身仍使用真实厚度。
  function cameraPoint(p){const a=.32,c=Math.cos(a),s=Math.sin(a);return [p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c];}
  // 绕竖直轴转身，有厚度的正反面在正面朝镜头时仍保持可见宽度。
  function place(s, g, x, y, z, u, skinned=false) {
    const theta = skinned?0:tailAngle(u, s, g);
    if (theta) {
      const hinge=g.bind?g.bind.minU+g.hinge*(g.bind.maxU-g.bind.minU):g.hinge;
      const hx = (hinge - .5) * 100, dx = x - hx;
      x = hx + dx * Math.cos(theta) + z * Math.sin(theta);
      z = -dx * Math.sin(theta) + z * Math.cos(theta);
    }
    const pitch = clamp(s.pitch || 0, -.26, .26);
    const pitchedX = x * Math.cos(pitch) - y * Math.sin(pitch);
    const py = x * Math.sin(pitch) + y * Math.cos(pitch);
    return [pitchedX * Math.cos(s.yaw) + z * Math.sin(s.yaw), py,
      -pitchedX * Math.sin(s.yaw) + z * Math.cos(s.yaw)];
  }
  // 镜头变化后，当前路线与转身必须连续；缩放只改变坐标和速度单位。
  function remapSwimmer(s, from, to, bodyLength) {
    const map = (v, lo, hi) => to[lo] + clamp((v-from[lo])/Math.max(1e-9,from[hi]-from[lo]))*(to[hi]-to[lo]);
    s.x=map(s.x,'minX','maxX');s.y=map(s.y,'minY','maxY');
    if(s.target) s.target={x:map(s.target.x,'minX','maxX'),y:map(s.target.y,'minY','maxY')};
    if(Number.isFinite(s.goal)) s.goal=map(s.goal,'minX','maxX');
    if(Number.isFinite(s.homeY)) s.homeY=map(s.homeY,'minY','maxY');
    const ratio=bodyLength/(s.BL||bodyLength);
    for(const key of ['speed','legSpeed','vx','vy','scale']) if(Number.isFinite(s[key])) s[key]*=ratio;
    s.BL=bodyLength;s.bounds=to;
    return s;
  }

  // 相交路线只轻推游动深度，避免小鱼长时间贴在大鱼身上；贴底生物不抬离底面。
  function separateSwimmers(residents,dt) {
    for(const a of residents) {
      if(!a.free)continue;
      let push=0;
      for(const b of residents) {
        if(a===b)continue;
        const dx=a.point.x-b.point.x,dy=a.point.y-b.point.y,rx=a.rx+b.rx,ry=a.ry+b.ry;
        if(Math.abs(dx)>=rx||Math.abs(dy)>=ry)continue;
        const direction=Math.abs(dy)>.002?Math.sign(dy):a.id<b.id?-1:1;
        push+=direction*(1-Math.abs(dx)/rx)*(1-Math.abs(dy)/ry)*.2;
      }
      const target=clamp(push,-.18,.18),s=a.state;
      s.avoidDepth??=0;s.avoidDepth+=clamp(target-s.avoidDepth,-.025*dt,.025*dt);
    }
  }

  // 优先沿当前方向游完一条长路线，到边缘才缓慢掉头，避免在狭小舱内反复折返。
  function nextLeg(s, bounds, g, rng) {
    const span = bounds.maxX - bounds.minX;
    const room = (d) => (d > 0 ? bounds.maxX - s.x : s.x - bounds.minX);
    const minLeg = Math.min(2.8 * s.BL, span * 0.68);
    let dir = s.dir;
    if (room(dir) < minLeg || room(-dir)>minLeg && rng() < 0.14) dir = -dir;
    if (room(dir) < minLeg && room(-dir) > room(dir)) dir = -dir;
    const reach = Math.max(0, room(dir) - s.BL * 0.2);
    const len = Math.min(reach, Math.max(minLeg,reach*.65) + rng() * Math.max(0, reach - Math.max(minLeg,reach*.65)));
    s.target = {
      x: s.x + dir * len,
      y: clamp(s.y + (rng() - 0.5) * (bounds.maxY - bounds.minY) * 0.75, bounds.minY, bounds.maxY),
    };
    s.legSpeed = g.cruise * s.BL * (0.85 + rng() * 0.3);
    if (dir !== s.dir) {
      s.dir = dir;
      s.mode = "turn";
      s.turnT = 0;
      s.yawFrom = s.yaw;
      s.yawTo = dir > 0 ? 0 : Math.PI;
      s.zdir = rng() < 0.5 ? -1 : 1;
    } else s.mode = "cruise";
  }

  // 纯函数：推进一条鱼一个时间步，便于测试
  function step(s, dt, bounds, g, rng = Math.random) {
    const cruise = g.cruise * s.BL;
    if (!s.mode) nextLeg(s, bounds, g, rng);
    if (s.mode === "hover") {
      s.hoverLeft -= dt;
      if (s.hoverLeft <= 0) nextLeg(s, bounds, g, rng);
    } else if (s.mode === "cruise") {
      const ahead = (s.target.x - s.x) * s.dir;
      // 掉头需要的距离：减速段大约走过 0.32 × 速度 × 掉头时长
      const stopDist = 0.32 * s.speed * g.turn + s.BL * 0.15;
      const wall = s.dir > 0 ? bounds.maxX - s.x : s.x - bounds.minX;
      if (ahead <= s.BL * 0.15 || wall < stopDist) {
        if (rng() < g.hover && wall >= stopDist) {
          s.mode = "hover";
          s.hoverLeft = 1.2 + rng() * 1.8;
        } else nextLeg(s, bounds, g, rng);
      }
    }
    if (s.mode === "turn") {
      s.turnT += dt / g.turn;
      const p = ease(Math.min(1, s.turnT));
      s.yaw = s.yawFrom + (s.yawTo - s.yawFrom) * p;
      if (s.turnT >= 1) {
        s.yaw = s.yawTo;
        s.mode = "cruise";
      }
    }
    // 速度：巡游按每段的速度，掉头时放慢，悬停时几乎停下
    const want = s.mode === "hover" ? 0.018 * s.BL : s.mode === "turn" ? s.legSpeed * 0.6 : s.legSpeed;
    s.speed += (want - s.speed) * (1 - Math.exp(-dt * (s.mode === "hover" ? 1.6 : 1.1)));
    // 俯仰：朝目标高度缓慢抬头/低头，角度很小；悬停和掉头时回平
    const dy = s.target.y - s.y;
    const wantPitch = s.mode === "cruise" ? clamp(Math.atan2(dy, Math.abs(s.target.x - s.x) + 2 * s.BL), -0.26, 0.26) : 0;
    s.pitch += clamp(wantPitch - s.pitch, -0.5 * dt, 0.5 * dt);
    // 摆尾：频率和力度随速度变化，掉头时加一点力
    const rel = s.speed / cruise;
    const wantAmp = clamp(0.28 + 0.72 * rel, 0.28, 1.25) + (s.mode === "turn" ? 0.25 : 0);
    s.amp += (wantAmp - s.amp) * (1 - Math.exp(-dt * 2));
    s.phase += dt * Math.PI * 2 * g.beat * (0.35 + 0.65 * clamp(rel, 0, 1.4)) * (s.mode === "turn" ? 1.2 : 1);
    // 每次摆尾带来一点前冲，速度不是匀速的
    const surge = 1 + 0.05 * s.amp * Math.sin(s.phase * 2);
    const v = s.speed * surge;
    s.vx = v * Math.cos(s.yaw) * Math.cos(s.pitch);
    s.vy = v * Math.sin(s.pitch);
    s.x = clamp(s.x + s.vx * dt, bounds.minX, bounds.maxX);
    s.y = clamp(s.y + s.vy * dt, bounds.minY, bounds.maxY);
    s.drift += dt * 0.13;
    s.flip = s.mode === "turn" ? Math.max(1e-6, Math.min(0.999999, s.turnT)) : 0;
    return s;
  }

  // 多条鱼之间的远近：缓慢起伏；掉头时朝镜头或背离镜头
  function pose(s) {
    return { z: 0.6 * Math.sin(s.drift) + 0.9 * (s.zdir || 1) * Math.abs(Math.sin(s.yaw)) };
  }

  function makeSwimmer(f, i, g, rng = Math.random) {
    const BL = 86 * (f.scale || 1);
    return {
      // 个体差异：同一种鱼摆幅也不完全一样
      vary: 0.85 + rng() * 0.3,
      x: f.cx,
      y: f.cy,
      BL,
      dir: (f.facing = rng() < .5 ? -1 : 1),
      yaw: f.facing > 0 ? 0 : Math.PI,
      speed: g.cruise * BL * 0.8,
      legSpeed: g.cruise * BL,
      pitch: 0,
      amp: 0.8,
      phase: rng() * Math.PI * 2,
      drift: rng() * Math.PI * 2,
      zdir: i % 2 ? 1 : -1,
      mode: null,
      target: null,
      vx: 0,
      vy: 0,
      flip: 0,
    };
  }

  async function atlas(file) {
    if (!atlases.has(file)) {
      atlases.set(
        file,
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = "knowledge-garden-v19/" + file;
        }).catch((error) => {
          atlases.delete(file);
          throw error;
        }),
      );
    }
    return atlases.get(file);
  }

  async function portrait(kind) {
    if (!portraits.has(kind)) {
      portraits.set(
        kind,
        (async () => {
          const sprite = FISH_SPRITES[kind];
          const image = await atlas(sprite ? sprite.file : `creature-${kind}.webp`);
          const canvas = document.createElement("canvas");
          canvas.width = 500;
          canvas.height = 300;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!sprite) {
            ctx.drawImage(image, 0, 0, 500, 300);
            return canvas;
          }
          const [x, y, w, h] = sprite.box;
          const ratio = Math.min(500 / w, 300 / h);
          ctx.setTransform(ratio, 0, 0, ratio, (500 - w * ratio) / 2 - x * ratio, (300 - h * ratio) / 2 - y * ratio);
          ctx.clip(new Path2D(sprite.clip));
          ctx.drawImage(image, 0, 0);
          return canvas;
        })().catch((error) => {
          portraits.delete(kind);
          throw error;
        }),
      );
    }
    return portraits.get(kind);
  }

  // 跨重建记住每条鱼的游动状态（按 鱼编号:种类），重绘或换舱后接着游；场景切换时由界面调用 forget() 清空
  const memory = new Map();
  const residentKey = (el) => `${el.dataset.fish}:${el.dataset.species}`;
  const modalOpen = () => {
    const m = document.getElementById("modal");
    return !!m && !m.hidden;
  };
  function forget() {
    current?.destroy();
    current = null;
    memory.clear();
  }
  // 落水的水花：画在鱼缸元素上（舱内坐标 x，水面 y = 288）
  function splash(art, x) {
    const tank = art.parentElement;
    if (!tank) return;
    const VW = art.viewBox.baseVal.width || 1536;
    const el = document.createElement("span");
    el.className = "tank-splash";
    el.setAttribute("aria-hidden", "true");
    el.style.left = (x / VW) * 100 + "%";
    el.style.top = (((+art.dataset.waterTop || 288) - 100) / 850) * 100 + "%";
    el.innerHTML = "<i></i><i></i><i></i><i></i><i></i><b></b><b></b>";
    tank.append(el);
    setTimeout(() => el.remove(), 1400);
  }

  function mount() {
    const art = document.querySelector("#tankSpot .aquarium-art");
    if (current?.art === art) {
      current.sync();
      return;
    }
    current?.destroy();
    current = null;
    // 以文件方式打开时浏览器禁止把本地图片作为 WebGL 纹理，保留静态插画
    if (!art || location.protocol === "file:") return;
    // 鱼和水族共用单面局部动作网格和深度排序；路线及解剖形变仍各自配置。
    // 空鱼缸也建好画布，之后放进来的鱼直接投放
    const residents = Array.from(art.querySelectorAll(".tank-resident")).filter((el) => FISH_SPRITES[el.dataset.species] || CreatureMotion.PROFILES[el.dataset.species]);
    const canvas = document.createElement("canvas");
    canvas.className = "tank-swim-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
    if (!gl) return;
    const program = gl.createProgram();
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      if (ok) gl.attachShader(program, shader);
      gl.deleteShader(shader);
      if (!ok) throw Error("Fish shader unavailable");
    }
    try {
      compile(gl.VERTEX_SHADER, "attribute vec3 p;attribute vec2 uv;attribute float l;varying vec2 v;varying float s;void main(){v=uv;s=l;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,p.z,1.);}");
      // 几乎透明的边缘不写深度，避免挡住身后的另一面
      compile(gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 v;varying float s;uniform sampler2D tex;uniform float shade;void main(){vec4 c=texture2D(tex,v);if(c.a<.06)discard;gl_FragColor=vec4(min(c.rgb*s*shade,vec3(c.a)),c.a);}");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("Fish shader unavailable");
    } catch {
      gl.deleteProgram(program);
      return;
    }
    const vertices = gl.createBuffer();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    for (const [name, size, offset] of [
      ["p", 3, 0],
      ["uv", 2, 12],
      ["l", 1, 20],
    ]) {
      const attr = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, size, gl.FLOAT, false, 24, offset);
    }
    const shadeLoc = gl.getUniformLocation(program, "shade");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    // 养鱼舱加宽后舱内坐标随之变宽，玻璃右边界由渲染时写入
    const VW = art.viewBox.baseVal.width || 1536,
      glassRight = +art.dataset.glassRight || 1390,
      waterTop = +art.dataset.waterTop || 288,
      waterBottom = +art.dataset.waterBottom || 680;
    const fish = [];
    const habitat = typeof GardenHabitat !== "undefined" ? GardenHabitat : null;
    const courtyard = !!art.closest?.(".seaside-courtyard");
    let layoutKey = "";
    function layoutFish(width, height) {
      if (!courtyard || !habitat || !width || !height) return;
      const mobile = document.documentElement.classList.contains("light-note-mobile-rendering");
      const key = `${width}:${height}:${mobile}:${fish.length}`;
      if (key === layoutKey) return;
      layoutKey = key;
      const poly = habitat.water(mobile);
      // 场景镜头尺度只随视口改变。
      // 种田底图的水仓比旧舱更高更窄：按标定预览的比例（锦鲤约占舱宽 8%）放大镜头
      const staged = typeof FarmStage !== "undefined" && !!FarmStage.habitat();
      const camera = Math.min(staged ? 1.05 : .7, height / width * 2.1);
      const waterWidth=Math.max(...poly.map(p=>p[0]))-Math.min(...poly.map(p=>p[0]));
      for (const f of fish) {
        let scale = Math.min(f.scale*camera,waterWidth*VW*.28/130), box = null;
        const halfY = (+f.element.dataset.halfHeight / f.scale || 36) + 10;
        for (let n = 0; n < 70; n++) {
          box = habitat.swimField(poly, 65 * scale / VW, halfY * scale * width / (VW * height));
          if (box && box.maxX - box.minX > .52) break;
          scale *= .96;
        }
        if (!box) continue;
        const previous = f.layoutBounds;
        const ratio = (axis, min, max, initial) => previous
          ? previous[max] > previous[min] ? clamp((f.swim[axis]-previous[min])/(previous[max]-previous[min])) : 1
          : Number.isFinite(+f.element.dataset[initial]) ? +f.element.dataset[initial] : .5;
        const rx = ratio("x","minX","maxX","homeX"), ry = ratio("y","minY","maxY","homeY");
        f.displayScale = scale;
        f.waterPolygon = poly;
        f.waterField = box;
        f.bounds = {minX:box.minX*VW,maxX:box.maxX*VW,minY:100+box.minY*850,maxY:100+box.maxY*850};
        if (f.creature && CreatureMotion.PROFILES[f.kind].habitat === "bottom" || f.gait.lane === "bottom") f.bounds.minY = f.bounds.maxY;
        else if (f.gait.lane === "upper") f.bounds.maxY = f.bounds.minY+(f.bounds.maxY-f.bounds.minY)*.45;
        const x = f.bounds.minX + rx * (f.bounds.maxX-f.bounds.minX), y = f.bounds.minY + ry * (f.bounds.maxY-f.bounds.minY);
        f.layoutBounds = {...f.bounds};
        if(previous) remapSwimmer(f.swim,previous,f.bounds,86*scale);
        else {
          const seededX=clamp(rx+(Math.random()-.5)*.16,.04,.96);
          const seededY=clamp(ry+(Math.random()-.5)*.12,.04,.96);
          Object.assign(f.swim,{x:f.bounds.minX+seededX*(f.bounds.maxX-f.bounds.minX),y:f.bounds.minY+seededY*(f.bounds.maxY-f.bounds.minY),BL:86*scale,bounds:f.bounds});
          f.swim.homeY=f.swim.y;f.swim.goal=f.swim.x;
        }
        if(f.creature) f.swim.scale=scale;
        f.cx=x; f.cy=y;
        // 无 WebGL 或单种纹理失败时，同样保持静态备用图的比例与位置。
        const sy=scale*850*width/(VW*height),point=habitat.fieldPoint(box,x/VW,(y-100)/850);
        f.element.setAttribute("transform",`translate(${point.x*VW-50*scale} ${100+point.y*850-30*sy}) scale(${scale} ${sy})`);
        f.element.dataset.waterBounds=JSON.stringify({minX:box.minX,maxX:box.maxX,minY:box.minY,maxY:box.maxY});
        f.element.dataset.displayScale=scale.toFixed(4);
      }
    }
    function addFish(el, i, drop) {
      const f = {
        key: residentKey(el),
        element: el,
        kind: el.dataset.species,
        scale: +el.dataset.scale,
        cx: +el.dataset.cx,
        cy: +el.dataset.cy,
        facing: +el.dataset.facing,
        texture: null,
      };
      f.creature = !!CreatureMotion.PROFILES[f.kind];
      f.gait = gait(f.kind);
      const halfW = 58 * f.scale,
        halfH = +el.dataset.halfHeight || 36 * f.scale;
      f.bounds = {
        minX: Math.min(f.cx, 80 + halfW + 8),
        maxX: Math.max(f.cx, glassRight - halfW - 8),
        minY: Math.min(f.cy, waterTop + halfH),
        maxY: Math.max(f.cy, waterBottom - halfH),
      };
      if (f.gait.lane === "bottom") f.bounds.minY = Math.max(f.bounds.minY, f.bounds.maxY - 65);
      if (f.gait.lane === "upper") f.bounds.maxY = Math.min(f.bounds.maxY, f.bounds.minY + 85);
      if (f.creature && CreatureMotion.PROFILES[f.kind].habitat === "bottom") f.bounds.minY = f.bounds.maxY = f.cy;
      f.cy = clamp(f.cy, f.bounds.minY, f.bounds.maxY);
      f.swim = f.creature ? CreatureMotion.create(f, i) : makeSwimmer(f, i, f.gait);
      f.swim.time = 0;
      const saved = memory.get(f.key);
      // 记得的鱼接着原来的位置游；新来的鱼从水面投放（弹框开着时先等着，关掉后再落水）
      if (saved) {
        const { bounds: previousBounds, ...pose } = saved;
        Object.assign(f.swim, pose);
        // 换成手机窄舱时保留相对位置，不能把所有旧 x 坐标钳到右墙。
        if (previousBounds) {
          if (courtyard) f.layoutBounds = {...previousBounds};
          else remapSwimmer(f.swim,previousBounds,f.bounds,86*f.scale);
        }
      }
      else if (drop) f.enter = { t: -1 };
      if (!courtyard || !saved) {
        f.swim.x = clamp(f.swim.x, f.bounds.minX, f.bounds.maxX);
        f.swim.y = clamp(f.swim.y, f.bounds.minY, f.bounds.maxY);
      }
      if (f.creature && !saved) { f.swim.homeY = f.cy; f.swim.goal = f.swim.x; }
      fish.push(f);
      return f;
    }
    // 整缸重建时（首次进入、重新渲染、手机换舱档）：之前见过别的鱼、唯独没见过这条，说明它是刚放进来的
    const dropNew = memory.size > 0;
    residents.forEach((el, i) => addFish(el, i, dropNew));
    let destroyed = false,
      ready = false,
      raf = 0,
      last = 0,
      visible = true,
      frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    observer.observe(art);
    async function load(f) {
      try {
        const image = await portrait(f.kind);
        if (destroyed || f.gone) return;
        const rgba=image.getContext("2d").getImageData(0,0,image.width,image.height).data;
        f.body = inflate(rgba,image.width,image.height,f.gait);
        f.mesh=sealMesh(rgba,image.width,image.height,f.body);
        f.mesh.elements=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,f.mesh.elements);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,f.mesh.indices,gl.STATIC_DRAW);
        f.rigGait={...f.gait,bind:f.body.bind};
        const texture = gl.createTexture();
        f.texture = texture;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        f.element.dataset.motionReady = "true";
        f.element.dataset.bodyMotion = f.creature ? CreatureMotion.PROFILES[f.kind].body : f.gait.serpentine ? "spine-wave" : f.gait.tail?"tail-fin-rig":"fins";
        f.element.dataset.motionBind=JSON.stringify(f.body.bind);
        f.element.dataset.bodyDepth = Math.max(...f.body.thick).toFixed(2);
        frame = 0;
      } catch {
        f.body = null;
        if (f.texture) { gl.deleteTexture(f.texture); f.texture = null; }
        if(f.mesh?.elements){gl.deleteBuffer(f.mesh.elements);f.mesh=null;}
        delete f.element.dataset.motionReady;
        f.element.dataset.motionError = "image";
      }
    }
    Promise.all(fish.map(load))
      .then(() => {
        if (destroyed) return;
        ready = true;
        art.after(canvas);
        art.classList.add("fish-motion-ready");
        canvas.dataset.motion = "volume-continuous-v19";
      })
      .catch(() => {
        if (current?.art === art) {
          current.destroy();
          current = null;
        }
      });

    function draw(now) {
      if (destroyed) return;
      raf = requestAnimationFrame(draw);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!ready || !visible || document.hidden) return;
      const ratio=GardenHabitat.rasterScale(art.clientWidth,art.clientHeight,devicePixelRatio||1,document.documentElement.classList.contains('light-note-mobile-rendering'));
      const width = Math.min(2048, Math.round(art.clientWidth * ratio));
      const height = Math.round(art.clientHeight ? art.clientHeight * (width / art.clientWidth) : (width * 850) / VW);
      const resized = canvas.width !== width || canvas.height !== height;
      if (resized) {
        canvas.width = width;
        canvas.height = height;
      }
      layoutFish(width, height);
      const still = reduced.matches;
      const pendingEntry = !modalOpen() && fish.some((f) => f.body && f.enter && f.enter.t < 0);
      if (still && frame && !resized && !pendingEntry) return;
      gl.viewport(0, 0, width, height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);
      if(courtyard) gl.scissor(0,0,width,height);
      else gl.scissor(Math.floor((80 / VW) * width), Math.floor(((950 - waterBottom) / 850) * height), Math.ceil(((glassRight - 80) / VW) * width), Math.ceil(((waterBottom - waterTop) / 850) * height));
      for (const f of fish)
        if (f.enter && f.enter.t < 0 && f.body && !modalOpen()) {
          if (still) f.enter = null;
          else {
            f.enter.t = 0;
            splash(art, f.cx);
          }
        }
      const live = fish.filter((f) => f.body && !(f.enter && f.enter.t < 0));
      if (!still)
        for (const f of live) {
          f.swim.time += dt;
          if (f.enter) dropIn(f, dt);
          else if (f.leave) swimOut(f, dt);
          else if (f.creature) CreatureMotion.step(f.swim, dt, f.swim.time);
          else step(f.swim, dt, f.bounds, f.gait);
          if (!f.enter && !f.leave) { f.swim.x=clamp(f.swim.x,f.bounds.minX,f.bounds.maxX); f.swim.y=clamp(f.swim.y,f.bounds.minY,f.bounds.maxY); }
        }
      for (let i = fish.length - 1; i >= 0; i--) if (fish[i].gone) fish.splice(i, 1);
      // 远的先画，近的后画；每条鱼单独做深度测试
      for (const f of live) {
        const anchored = f.creature && CreatureMotion.PROFILES[f.kind].anchored;
        f.pose = still || anchored ? { z: 0 } : pose(f.swim);
      }
      if(!still)separateSwimmers(live.filter(f=>f.waterField&&!f.enter&&!f.leave).map(f=>({
        id:f.key,state:f.swim,point:habitat.fieldPoint(f.waterField,f.swim.x/VW,clamp((f.swim.y-100)/850+(f.swim.avoidDepth||0))),
        rx:42*(f.displayScale||f.scale)/VW,ry:(+f.element.dataset.halfHeight/f.scale||30)*(f.displayScale||f.scale)*width/(VW*height),
        free:!(f.creature&&(CreatureMotion.PROFILES[f.kind].anchored||CreatureMotion.PROFILES[f.kind].habitat==='bottom'))&&f.gait.lane!=='bottom',
      })),dt);
      const order = live.filter((f) => !f.gone).sort((a, b) => a.pose.z - b.pose.z);
      for (const f of order) {
        const s = f.swim,
          g = f.gait,
          body = f.body;
        const mesh=f.mesh,data=mesh.data,count=mesh.points.length;
        const k = f.displayScale || f.scale;
        const depth=(s.y-100)/850+(s.avoidDepth||0);
        const position=f.waterField ? habitat.fieldPoint(f.waterField,s.x/VW,f.enter||f.leave?depth:clamp(depth)) : {x:s.x/VW,y:(s.y-100)/850};
        const spine = !still && g.serpentine ? serpentineFrames(s) : null;
        for(let n=0;n<count;n++) {
              const point=mesh.points[n],u=point.u,v=point.v,i=Math.round(u*NX),o=n*6;
              const qu=(u-body.bind.minU)/(body.bind.maxU-body.bind.minU),qv=(v-body.bind.minV)/(body.bind.maxV-body.bind.minV);
              const extra = still || g.serpentine ? null : f.creature ? CreatureMotion.deform(f.kind, u, v, s.time + s.t0, s.amp,body.bind) : special(f.kind, qu, qv, s.phase, s.amp);
              let x = (u - 0.5) * 100,
                y = (v - 0.5) * 60,
                z = point.thick * point.side;
              if (extra) {
                x += extra[0] * 100;
                y += extra[1] * 60;
                z += (extra[2] || 0) * 100;
              } else if (!still && point.fin) {
                // 鳍：沿鳍从前往后的波纹，上下扇、并向两侧轻摆
                const a = s.phase * 1.2 - u * 7,
                  amp = g.fin * 1.8 * (s.vary || 1) * (0.6 + 0.4 * s.amp) * point.fin;
                y += amp * 60 * Math.sign(v - body.shape.c[i]) * Math.sin(a);
                x += amp * 50 * Math.sin(a + 0.8);
                z += amp * 160 * Math.sin(a + 1.6);
              }
              if (spine) {
                const b = spine[i];
                const local=x-(i/NX-.5)*100;
                [x, y, z] = b.p.map((p, axis) => p + b.t[axis]*local+b.up[axis] * y + b.front[axis] * z);
              }
              const placed=still ? [x * (Math.cos(s.yaw) >= 0 ? 1 : -1), y, 0] : place(s, f.rigGait, x, y, z, u,!!spine);
              const [px,py,pz]=still||f.creature?placed:cameraPoint(placed);
              data[o] = position.x + px * k / VW;
              data[o + 1] = courtyard ? position.y + py * k * width / (VW * height) : (s.y + py * k - 100) / 850;
              data[o + 2] = clamp(-pz / 300, -0.99, 0.99);
              data[o + 3] = u;
              data[o + 4] = v;
              data[o + 5] = .93 + .07 * Math.abs(Math.cos(s.yaw));
            }
        if (f.waterPolygon && !f.enter && !f.leave) {
          let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
          for(let n=0;n<count;n++) { if(!mesh.points[n].active) continue; const o=n*6;l=Math.min(l,data[o]);r=Math.max(r,data[o]);t=Math.min(t,data[o+1]);b=Math.max(b,data[o+1]); }
          const center={x:(l+r)/2,y:(t+b)/2};
          const safe=habitat.fitBody(center,f.waterPolygon,(r-l)/2,(b-t)/2);
          const dx=safe.x-center.x,dy=safe.y-center.y;
          for(let n=0;n<count;n++) {data[n*6]+=dx;data[n*6+1]+=dy;}
          // 路线坐标存的是水柱深度；网格形变的最后一层保护不能反写导航，
          // 否则转身时轮廓变化会不断把鱼推向右侧或向上挤。
          if(!f.waterField){s.x+=dx*VW;s.y+=dy*850;}
          if(frame%10===0) f.element.dataset.bodyBox=JSON.stringify([l+dx,t+dy,r+dx,b+dy]);
        }
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(shadeLoc, 1);
        gl.bindTexture(gl.TEXTURE_2D, f.texture);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.elements);
        gl.drawElements(gl.TRIANGLES,still?mesh.frontCount:mesh.indices.length,gl.UNSIGNED_SHORT,0);
        if (frame % 10 === 0) {
          f.element.dataset.swimState = s.mode === "turn" ? "turning" : s.mode === "hover" ? "hovering" : "forward";
          f.element.dataset.at = `${Math.round(s.x)},${Math.round(s.y)}`;
          f.element.dataset.yaw = s.yaw.toFixed(2);
          f.element.dataset.motionPhase = s.phase.toFixed(3);
          f.element.dataset.motionTime = s.time.toFixed(3);
          if (spine) f.element.dataset.bodyBend = Math.hypot(...spine[0].p.map((p, axis) => p - spine[NX].p[axis])).toFixed(2);
        }
      }
      frame++;
      canvas.dataset.frame = String(frame);
    }
    // 落水：从水面上方扎进来，先快后慢、头朝下，停稳后摆正开始游
    function dropIn(f, dt) {
      const s = f.swim,
        e = f.enter;
      e.t += dt;
      const p = Math.min(1, e.t / 1.25),
        ease = 1 - Math.pow(1 - p, 3);
      const top = waterTop - 40 * f.scale,
        goal = clamp(f.cy, f.bounds.minY, f.bounds.maxY);
      s.x = f.cx;
      s.y = top + (goal - top) * ease;
      s.pitch = 0.75 * (1 - ease);
      s.amp = 1.3;
      s.phase += dt * 9 * (1 - 0.6 * p);
      if (p >= 1) {
        f.enter = null;
        s.pitch = 0;
        s.mode = null;
      }
    }
    // 收回：抬头加速游出水面
    function swimOut(f, dt) {
      const s = f.swim;
      f.leave.t += dt;
      s.pitch = Math.max(-0.7, s.pitch - dt * 2);
      s.y -= s.BL * (2 + f.leave.t * 6) * dt;
      s.phase += dt * 10;
      if (s.y < waterTop - 60 * f.scale || f.leave.t > 1.6) {
        f.gone = true;
        if (f.texture) gl.deleteTexture(f.texture);
        if(f.mesh?.elements){gl.deleteBuffer(f.mesh.elements);f.mesh.elements=null;}
      }
    }
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      if (destroyed) return;
      current?.destroy();
      current = null;
    });
    raf = requestAnimationFrame(draw);
    current = {
      art,
      // 同一鱼缸里增减住客：已有的鱼继续游，新来的投放，被收回的游走
      sync() {
        frame = 0;
        const els = Array.from(art.querySelectorAll(".tank-resident")).filter((el) => FISH_SPRITES[el.dataset.species] || CreatureMotion.PROFILES[el.dataset.species]);
        const keys = new Set(els.map(residentKey));
        for (const f of fish)
          if (!keys.has(f.key) && !f.leave) {
            if (reduced.matches || (f.enter && f.enter.t < 0)) {
              f.gone = true;
              if (f.texture) { gl.deleteTexture(f.texture); f.texture = null; }
              if(f.mesh?.elements){gl.deleteBuffer(f.mesh.elements);f.mesh.elements=null;}
            }
            else f.leave = { t: 0 };
          }
        els.forEach((el, i) => {
          const f = fish.find((x) => x.key === residentKey(el) && !x.leave && !x.gone);
          if (f) {
            f.element = el;
            if (f.body) {
              el.dataset.motionReady = "true";
              el.dataset.bodyMotion = f.creature ? CreatureMotion.PROFILES[f.kind].body : f.gait.serpentine ? "spine-wave" : "fins";
              el.dataset.bodyDepth = Math.max(...f.body.thick).toFixed(2);
            }
          }
          else {
            memory.delete(residentKey(el));
            load(addFish(el, i, true));
          }
        });
        if (!ready && fish.length) {
          ready = true;
          art.after(canvas);
          art.classList.add("fish-motion-ready");
        }
      },
      destroy() {
        fish.forEach((f) => {
          if (!f.gone && !f.leave) memory.set(f.key, { ...f.swim, target:f.swim.target ? {...f.swim.target} : null, bounds: { ...f.bounds } });
        });
        destroyed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        art.classList.remove("fish-motion-ready");
        art.querySelectorAll("[data-motion-ready]").forEach((el) => delete el.dataset.motionReady);
        canvas.remove();
        fish.forEach((f) => {
          if (f.texture) gl.deleteTexture(f.texture);
          if(f.mesh?.elements)gl.deleteBuffer(f.mesh.elements);
        });
        gl.deleteBuffer(vertices);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      },
    };
  }
  return { mount, forget, splash, remapSwimmer, separateSwimmers, gait, step, pose, makeSwimmer, inflate, sealMesh, contentBounds, bodyShape, finWeight, tailAngle, place, cameraPoint, special, serpentineFrames, SPECIES, FLIP_SECONDS, NX, NY };
})();
if (typeof module !== "undefined") module.exports = FishMotion;
