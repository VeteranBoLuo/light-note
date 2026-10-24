/* 庄园里的小动物：兔子、麻雀、青蛙、蜻蜓。逐帧在一张 2D 画布上绘制（分层渐变做出体积、地面投影、近大远小），
   各自按习性活动，并能点击互动：
   - 兔子：在草地上休息、短跳；点击完成一次小跳，不出现爱心
   - 麻雀：PC四只、手机两只在小路活动；点到便飞往另一处小路；只由第一只投递每日种子
   - 青蛙（PC）：蹲在垂钓栈桥边，点它跳入水中，停留几秒后沿弧线跳回原处
   - 蜻蜓（PC）：悬停、巡游；点击随机跟随手指、盘旋或掠过
   兔子在草地活动，麻雀可在田间小路巡游；落点避开菜地、养鱼舱、顶部信息栏与操作坞；减少动态效果时不出现 */
const GardenCritters = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (p) => p * p * (3 - 2 * p);
  let current = null;

  // ---------- 绘制（局部坐标：脚下为原点，朝右，单位 = 身长） ----------
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function rgrad(ctx, x, y, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function shadow(ctx, rx, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, rx * 0.2, 0, 0, TAU);
    ctx.fillStyle = rgrad(ctx, 0, 0, 0, 0, 0, rx, [
      [0, "rgba(30,50,20,.45)"],
      [1, "rgba(30,50,20,0)"],
    ]);
    ctx.fill();
    ctx.restore();
  }
  function eye(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = "#1d140e";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.38, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fill();
  }

  // 使用同一张身体纹理做连续蒙皮，低头、抬头与跳跃不切换离散帧。
  let rabbitAtlas;
  function rabbitFrame() {
    if (!rabbitAtlas && typeof Image !== "undefined") {
      rabbitAtlas = new Image();
      rabbitAtlas.src = "knowledge-garden-v19/courtyard/rabbit-motion.webp";
    }
    return rabbitAtlas;
  }
  function drawRabbit(ctx, r) {
    const { lift = 0, chew = 0 } = r.pose;
    shadow(ctx, .48 * (1 - lift), .75 - lift);
    if(GardenAnimals3D.update('rabbit',{x:r.x,y:r.y,size:r.drawSize,face:r.face,head:r.skin.head,mode:r.state,jumping:r.state==='hop',hop:r.hop,lift,time:r.age,distance:r.from&&r.target?Math.hypot(r.target.x-r.from.x,r.target.y-r.from.y)/Math.max(1,r.drawSize||1):1}))return;
    const img = rabbitFrame();
    if (!img?.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.translate(0, -lift);
    ctx.scale(1, 1 + chew * .006);
    GardenAnimalPose.draw(ctx,img,{x:0,y:0,w:512,h:512},{x:-.8,y:-1.34,w:1.6,h:1.6},'rabbit',r.skin);
    ctx.restore();
  }

  // 麻雀：hop 小跳、peck 啄食、flap 扑翅（飞行时）
  function drawSparrow(ctx, b) {
    const { lift, peck, flap, flying } = b.pose;
    shadow(ctx, 0.36 * (flying ? 0.5 : 1), flying ? 0.25 : 0.8);
    ctx.save();
    ctx.translate(0, -lift);
    ctx.rotate(flying ? -0.1 : 0.15 * peck);
    // 尾巴
    ctx.beginPath();
    ctx.moveTo(-0.22, -0.3);
    ctx.lineTo(-0.52, -0.42 - (flying ? 0 : 0.06));
    ctx.lineTo(-0.5, -0.32);
    ctx.closePath();
    ctx.fillStyle = "#6b4a2f";
    ctx.fill();
    // 腿
    if (!flying) {
      ctx.strokeStyle = "#a8794f";
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(-0.02, -0.12);
      ctx.lineTo(-0.04, 0);
      ctx.moveTo(0.06, -0.12);
      ctx.lineTo(0.07, 0);
      ctx.stroke();
    }
    // 身体
    ctx.beginPath();
    ctx.ellipse(0, -0.28, 0.27, 0.17, -0.12, 0, TAU);
    ctx.fillStyle = rgrad(ctx, -0.05, -0.38, 0.01, 0, -0.28, 0.3, [
      [0, "#c9a27a"],
      [0.6, "#a0764f"],
      [1, "#6f4e33"],
    ]);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.06, -0.2, 0.17, 0.08, -0.15, 0, TAU);
    ctx.fillStyle = "rgba(236,226,208,.85)";
    ctx.fill();
    // 翅膀：停着时贴在身上；飞行时是带飞羽的尖翼，绕肩部上下扇动
    const wing = (angle, far) => {
      ctx.save();
      ctx.translate(-0.02, -0.36);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0.06, 0);
      ctx.quadraticCurveTo(-0.05, -0.2, -0.3, -0.42);
      ctx.lineTo(-0.27, -0.33);
      ctx.lineTo(-0.36, -0.36);
      ctx.lineTo(-0.29, -0.25);
      ctx.lineTo(-0.37, -0.25);
      ctx.lineTo(-0.27, -0.16);
      ctx.quadraticCurveTo(-0.14, -0.04, -0.08, 0.04);
      ctx.closePath();
      ctx.fillStyle = grad(ctx, -0.3, -0.4, 0.05, 0, far
        ? [[0, "#4a3220"], [1, "#7a5638"]]
        : [[0, "#5a3c26"], [0.55, "#94693f"], [1, "#c09466"]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(240,226,200,.55)";
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(-0.04, -0.06);
      ctx.lineTo(-0.2, -0.24);
      ctx.stroke();
      ctx.restore();
    };
    if (flying) {
      const a = Math.sin(flap);
      wing(-0.2 + 0.9 * a, true);
    } else {
      ctx.save();
      ctx.translate(-0.04, -0.33);
      ctx.rotate(0.15);
      ctx.beginPath();
      ctx.ellipse(-0.1, 0, 0.2, 0.09, 0.1, 0, TAU);
      ctx.fillStyle = grad(ctx, -0.2, -0.1, 0.1, 0.1, [
        [0, "#5a3c26"],
        [0.5, "#8c6340"],
        [1, "#b48a5e"],
      ]);
      ctx.fill();
      ctx.strokeStyle = "rgba(240,226,200,.6)";
      ctx.lineWidth = 0.012;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-0.24 + i * 0.07, -0.03);
        ctx.lineTo(-0.12 + i * 0.07, 0.04);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 头
    const hx = 0.22 + 0.06 * peck,
      hy = -0.42 + 0.22 * peck;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.12, 0, TAU);
    ctx.fillStyle = rgrad(ctx, hx - 0.03, hy - 0.04, 0.01, hx, hy, 0.13, [
      [0, "#a4835f"],
      [1, "#5e432c"],
    ]);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + 0.04, hy + 0.05, 0.07, 0.05, 0, 0, TAU);
    ctx.fillStyle = "#efe6d6";
    ctx.fill();
    eye(ctx, hx + 0.05, hy - 0.02, 0.025);
    ctx.beginPath();
    ctx.moveTo(hx + 0.1, hy - 0.01);
    ctx.lineTo(hx + 0.2, hy + 0.02);
    ctx.lineTo(hx + 0.1, hy + 0.04);
    ctx.closePath();
    ctx.fillStyle = "#3d3229";
    ctx.fill();
    if (flying) wing(-0.35 + 1.05 * Math.sin(flap + 0.25), false);
    ctx.restore();
  }

  // 两格青蛙图分别为蹲坐和伸腿跳跃，默认朝向右下；脚底锚定码头边缘。
  let frogAtlas;
  function frogFrame() {
    if (!frogAtlas && typeof Image !== "undefined") {
      frogAtlas = new Image();
      frogAtlas.src = "knowledge-garden-v19/courtyard/frog-jump-r5.png";
    }
    return frogAtlas;
  }
  function drawFrog(ctx, f) {
    const { lift = 0, frame = 0 } = f.pose;
    const img = frogFrame();
    if (!img?.complete || !img.naturalWidth) return;
    shadow(ctx, .36 * (1 - lift * .5), .55 - lift * .35);
    ctx.save();
    ctx.translate(0, -lift);
    const jumping = frame >= 3 && frame <= 4;
    const cell = img.naturalWidth / 2;
    // 两帧躯干保持相同大小；跳跃时伸腿，整幅沿弧线离开码头。
    ctx.drawImage(img, jumping ? cell : 0, 0, cell, img.naturalHeight, jumping ? -.93 : -.58, jumping ? -1.08 : -1.02, 1.32, 1.32 * img.naturalHeight / cell);
    ctx.restore();
  }

  // 蜻蜓（俯视略侧）：翅膀高速扇动做成半透明的虚影
  function drawDragonfly(ctx, d, t) {
    ctx.save();
    ctx.rotate(d.heading);
    const flutter = d.perched ? 0.15 : 1;
    for (const [x, len, phase] of [
      [0.07, 0.34, 0],
      [-0.02, 0.31, 1.6],
    ]) {
      for (const side of [-1, 1]) {
        const a = side * (0.95 + 0.35 * flutter * Math.sin(t * 60 + phase));
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(len / 2, 0, len / 2, 0.048, 0, 0, TAU);
        ctx.fillStyle = `rgba(214,240,246,${d.perched ? 0.5 : 0.28})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.6)";
        ctx.lineWidth = 0.008;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0.02, 0);
        ctx.lineTo(len * 0.95, 0.005);
        ctx.strokeStyle = "rgba(60,90,100,.35)";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(len * 0.86, -0.02, 0.012, 0, TAU);
        ctx.fillStyle = "rgba(40,60,70,.55)";
        ctx.fill();
        ctx.restore();
      }
    }
    // 腹部
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.022);
    ctx.lineTo(-0.62, -0.012);
    ctx.lineTo(-0.62, 0.012);
    ctx.lineTo(-0.05, 0.022);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, -0.6, 0, 0, 0, [
      [0, "#1d5b7a"],
      [1, "#3fa3c4"],
    ]);
    ctx.fill();
    for (let i = 1; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.05 - i * 0.08, -0.02);
      ctx.lineTo(-0.05 - i * 0.08, 0.02);
      ctx.strokeStyle = "rgba(10,40,60,.6)";
      ctx.lineWidth = 0.01;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0.04, 0, 0.09, 0.05, 0, 0, TAU);
    ctx.fillStyle = "#2c7d6f";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.15, 0, 0.05, 0.065, 0, 0, TAU);
    ctx.fillStyle = rgrad(ctx, 0.14, -0.02, 0.005, 0.15, 0, 0.07, [
      [0, "#9be6d8"],
      [1, "#1f6a5e"],
    ]);
    ctx.fill();
    ctx.restore();
  }

  function drawRipple(ctx, r) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - r.age / 1.1, 0, 1);
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.size * (0.3 + r.age), r.size * (0.3 + r.age) * 0.32, 0, 0, TAU);
    ctx.strokeStyle = "rgba(235,255,250,.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 行为 ----------
  function mount(scene, gifts = {}) {
    unmount();
    if (!scene || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const courtyard = scene.classList.contains("seaside-courtyard");
    const compactGarden = () => document.documentElement.classList.contains("light-note-mobile-rendering");
    const gardenAnimals = () => !compactGarden() || scene.dataset.manorArea!=="bay";
    const waterAnimals = () => !compactGarden();
    const lawn = () => GardenHabitat.lawn(compactGarden(), W, H, unit() * .75);
    rabbitFrame();
    const canvas = document.createElement("canvas");
    canvas.className = "critter-layer";
    canvas.setAttribute("aria-hidden", "true");
    scene.prepend(canvas);
    const frogHit = document.createElement("button");
    frogHit.className = "frog-hit";
    frogHit.type = "button";
    frogHit.hidden = true;
    frogHit.setAttribute("aria-label", "轻触青蛙，看它跳水再回来");
    frogHit.addEventListener("click", e => { e.stopPropagation(); interact(frog); syncFrogHit(); });
    scene.prepend(frogHit);
    const rabbitHit = document.createElement("button");
    rabbitHit.className = "rabbit-hit";
    rabbitHit.type = "button";
    rabbitHit.setAttribute("aria-label", "轻触兔子，看它小跳回应");
    rabbitHit.addEventListener("click", e => { e.stopPropagation(); interact(rabbit); });
    scene.prepend(rabbitHit);
    const ctx = canvas.getContext("2d");
    let W = 0,
      H = 0,
      dpr = 1,
      blocks = [], birdBlocks = [], calibratedBirds = false,
      pond = null,
      lilies = [],
      animalsReady = false, measuredProfile = "", calledSpot = null;
    function measure() {
      const r = scene.getBoundingClientRect();
      const oldW=W, oldH=H, profile=String(compactGarden());
      dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      if (canvas.width !== Math.round(W * dpr)) canvas.width = Math.round(W * dpr);
      if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr);
      const rel = (el, pad = 0) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { l: b.left - r.left - pad, t: b.top - r.top - pad, r: b.right - r.left + pad, b: b.bottom - r.top + pad };
      };
      const plotBlocks = (scene.querySelectorAll ? [...scene.querySelectorAll(".farm-plot, #freshPond")] : []).map(el=>rel(el,2));
      const sharedBlocks = [
        // 封存与建成设备、鱼舱和菜单仍不能作为落点。
        ...(scene.querySelectorAll ? [...scene.querySelectorAll(".scene-facility, #purifierSpot")].filter(el=>!el.hidden) : []).map(el=>rel(el,4)),
        rel(scene.querySelector("#tankSpot"), 6),
        rel(scene.querySelector(".game-dock"), 10),
        rel(scene.querySelector(".game-hud"), 10),
      ].filter(Boolean);
      blocks = [...plotBlocks,...sharedBlocks];
      // 已标定的 PC 路线沿真实石路行走。地块点击框包含植株和路面，不能用它排除道路落点。
      calibratedBirds = typeof FarmStage !== "undefined" && FarmStage.cal()?.birdRoutes?.length;
      birdBlocks = calibratedBirds ? sharedBlocks : blocks;
      pond = rel(scene.querySelector(courtyard ? "#pondSpot" : "#pondSpot .pond-art"));
      // 睡莲大致位置（灵池图里右半边的三片）
      lilies = pond
        ? [
            [0.6, 0.55],
            [0.68, 0.62],
            [0.55, 0.62],
          ].map(([u, v]) => ({ x: pond.l + (pond.r - pond.l) * u, y: pond.t + (pond.b - pond.t) * v }))
        : [];
      if (animalsReady && (W!==oldW || H!==oldH || profile!==measuredProfile)) {
        calledSpot = null;
        for (const c of [rabbit]) {
          Object.assign(c,GardenHabitat.onLawn({x:c.x*W/Math.max(1,oldW),y:c.y*H/Math.max(1,oldH)},lawn()));
          c.state=c===rabbit?"idle":"ground";c.timer=3;c.playHops=0;c.pendingAction=null;c.reactionLeft=0;c.pose={lift:0,frame:0};
        }
        sparrows.forEach(b=>{b.x=0;b.y=0;b.fly=null;});
        sparrows.forEach(b => { Object.assign(b, freeBirdSpot(b) || {x:lawn().cx,y:lawn().cy}); b.state="ground";b.timer=2.4+b.id*1.9;b.fly=null;b.trip=null;b.carrying=false;b.pose={}; });
        placeFrog();frog.state="sit";frog.timer=2;frog.jump=null;frog.pose={};ripples.length=0;
        syncFrogHit();
      }
      measuredProfile=profile;
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scene);
    // 树长大、舱体扩建后障碍区域会变，定时重新量一次
    const remeasure = setInterval(measure, 2000);
    const blocked = (x, y, pad = 0) => {
      if (courtyard) {
        if (!GardenHabitat.inLawn({ x, y }, lawn())) return true;
        return false;
      }
      return x < 12 || x > W - 12 || y < H * 0.4 || y > H - 8 || blocks.some((b) => x > b.l - pad && x < b.r + pad && y > b.t - pad && y < b.b + pad);
    };
    const depth = (y) => clamp(0.62 + (0.55 * (y / H - 0.4)) / 0.5, 0.55, 1.2);
    const unit = () => Math.min(W, H * 1.6) * (courtyard ? (compactGarden() ? .10 : .045) : .068);
    function freeSpot(near, radius, tries = 40) {
      for (let i = 0; i < tries; i++) {
        const { cx, cy, rx, ry } = lawn();
        const x = near ? near.x + (Math.random() - 0.5) * radius * 2 : courtyard ? cx + (Math.random() - .5) * rx * 2 : W * (0.05 + Math.random() * 0.9),
          y = near ? near.y + (Math.random() - 0.5) * radius : courtyard ? cy + (Math.random() - .5) * ry * 2 : H * (0.45 + Math.random() * 0.45);
        if (!blocked(x, y, unit() * 0.8)) return { x, y };
      }
      return null;
    }

    // 兔子
    const rabbit = { kind: "rabbit", x: 0, y: 0, face: Math.random()<.5?-1:1, state: "idle", timer: 1.5+Math.random()*4, hop: 0, hops: 0, target: null, earT: Math.random()*3, blinkT: 1+Math.random()*4, startled: 0, pose: {},skin:GardenAnimalPose.create(),age:Math.random()*3,reactionLeft:0 };
    const rStart = freeSpot(null) || { x: lawn().cx, y: lawn().cy };
    Object.assign(rabbit, rStart);
    // 麻雀
    const sparrows = Array.from({length:compactGarden()?2:4},(_,i) => ({ kind: "sparrow", id:i,routeStep:-1, x: 0, y: 0, face: Math.random()<.5?-1:1, state: "ground", timer: 2.4 + i*1.9+Math.random()*2.5, hop: 0, peck: 0, fly: null, away: 0, pose: {} }));
    sparrows.forEach((b) => Object.assign(b, freeBirdSpot(b) || { x: lawn().cx+(b.id-1.5)*unit()*1.5, y: lawn().cy }));
    // 青蛙
    const frog = { kind: "frog", x: 0, y: 0, face: 1, state: "sit", timer: 2+Math.random()*4, sacT: Math.random()*3, jump: null, hidden: 0, blinkT: 1+Math.random()*4, pose: {} };
    function placeFrog() {
      if (!pond) return false;
      if (courtyard) {
        const shore = GardenHabitat.frogShore(compactGarden(), W, H);
        const perches=shore.perches||[shore.home];
        frog.perchIndex??=Math.floor(Math.random()*perches.length);
        const home=perches[frog.perchIndex%perches.length];
        Object.assign(frog, home, {home, water:shore.water, face:shore.face, homeFace:shore.face});
        return true;
      }
      const w = pond.r - pond.l,
        h = pond.b - pond.t;
      const spots = [
        [0.08, 0.45, 1],
        [0.15, 0.78, 1],
        [0.92, 0.5, -1],
      ];
      const [u, v, f] = spots[Math.floor(Math.random() * spots.length)];
      frog.x = pond.l + w * u;
      frog.y = pond.t + h * v;
      frog.face = f;
      frog.home = { x: frog.x, y: frog.y };
      frog.homeFace = f;
      return true;
    }
    placeFrog();
    function frogSize() { return Math.max(compactGarden()?34:32,unit()*.55*depth(frog.y)); }
    function syncFrogHit() {
      frogHit.hidden = !waterAnimals() || !pond || frog.state !== "sit";
      frogHit.disabled = frogHit.hidden;
      if (pond) {
        frogHit.style.left = `${frog.home.x}px`;
        frogHit.style.top = `${frog.home.y-frogSize()*.22}px`;
      }
    }
    syncFrogHit();
    // 蜻蜓
    const fly = { kind: "dragonfly", x: W * 0.6, y: H * 0.55, vx: 0, vy: 0, heading: 0, state: "hover", timer: 1, target: null, perched: false, pose: {} };
    animalsReady = true;
    const ripples = [];

    function startHops(target) {
      if (!target) return;
      const safe = GardenHabitat.onLawn(target, lawn());
      const dx = safe.x - rabbit.x, dy = safe.y - rabbit.y;
      const ratio = Math.min(1, unit() * .95 / Math.max(1, Math.hypot(dx, dy)));
      rabbit.target = { x: rabbit.x + dx * ratio, y: rabbit.y + dy * ratio };
      rabbit.from = { x: rabbit.x, y: rabbit.y };
      rabbit.state = "hop"; rabbit.hop = 0;
      rabbit.face = dx >= 0 ? 1 : -1;
    }
    function rabbitAction(action) {
      const r=rabbit,l=lawn();calledSpot=null;r.pendingAction=null;r.age=0;
      if(action==='hop'){r.playHops=1;startHops(freeSpot(r,unit())||{x:r.x,y:r.y});}
      else if(action==='play'){r.playHops=3;startHops(freeSpot(r,unit()*2.5)||{x:l.cx+(r.x>l.cx?-.65:.65)*l.rx,y:l.cy});}
      else if(action==='call'){r.playHops=0;calledSpot={x:l.cx+(r.x>l.cx?-.65:.65)*l.rx,y:l.cy};startHops(calledSpot);}
      else {r.playHops=0;r.state='alert';r.timer=3.5;}
    }
    function updateRabbit(dt, t) {
      const r = rabbit;
      r.age+=dt;r.reactionLeft=Math.max(0,r.reactionLeft-dt);
      let lift = 0, frame = 0, chew = 0;
      if (r.state === "hop") {
        r.hop = Math.min(1, r.hop + dt / .62);
        const pose = GardenHabitat.rabbitHop(r.hop);
        frame = pose.frame; lift = pose.lift*(r.playHops?1.15:.88);
        r.x = r.from.x + (r.target.x - r.from.x) * pose.travel;
        r.y = r.from.y + (r.target.y - r.from.y) * pose.travel;
        if (r.hop >= 1) {
          r.state = Math.random() < .35 ? "alert" : "idle";
          r.timer = 4 + Math.random() * 5;
          if(r.pendingAction)rabbitAction(r.pendingAction);
          else if(r.playHops>0){r.playHops--;if(r.playHops){r.state="hop-pause";r.timer=1.1+Math.random()*.6;}else{r.state="alert";r.timer=2;}}
          else if (calledSpot && Math.hypot(r.x - calledSpot.x, r.y - calledSpot.y) > 3) startHops(calledSpot);
          else calledSpot = null;
        }
      } else {
        r.timer -= dt;
        if(r.state==="alert")frame=2;
        if (r.timer <= 0) {
          const l=lawn(),next=freeSpot(r,unit()*2)||(r.playHops?{x:l.cx+(r.x>l.cx?-.65:.65)*l.rx,y:l.cy}:null);
          if(next)startHops(next);else r.timer=2;
        }
      }
      if (courtyard) Object.assign(r, GardenHabitat.onLawn(r, lawn()));
      r.pose = { lift, frame, chew };
      GardenAnimalPose.advance(r.skin,GardenAnimalPose.targets('rabbit',r.state,r.age,r.hop),dt);
    }
    function freeBirdSpot(near, hop = false) {
      const clear = p => p.x > 12 && p.x < W - 12 && p.y > H * .24 && p.y < H - 12 && !birdBlocks.some(b => p.x > b.l && p.x < b.r && p.y > b.t && p.y < b.b);
      const stops = GardenHabitat.birdRoute(compactGarden(), W, H,near?.id||0,sparrows.length).filter(clear);
      if (!stops.length) return null;
      const free=p=>sparrows.every(other=>other===near||!other.x||(Math.hypot(other.x-p.x,other.y-p.y)>unit()*1.1&&(!other.fly||other.state==="ground"||Math.hypot(other.fly.tx-p.x,other.fly.ty-p.y)>unit()*1.1)));
      if (near && hop) {
        const home = stops.reduce((a, p) => Math.hypot(p.x - near.x, p.y - near.y) < Math.hypot(a.x - near.x, a.y - near.y) ? p : a);
        const next={ x: home.x + (Math.random() - .5) * unit() * .28, y: home.y + (Math.random() - .5) * unit() * .06 };
        return clear(next)&&free(next)?next:null;
      }
      const previous=near?.x?(near.routeStep??-1):Math.floor(Math.random()*stops.length)-1;
      for(let i=1;i<=stops.length;i++) {
        const index=(previous+i)%stops.length,p=stops[index];
        if(free(p)&&(!near?.x||Math.hypot(p.x-near.x,p.y-near.y)>unit()*.45)) {if(near)near.routeStep=index;return p;}
      }
      return null;
    }
    let giftWait = 6;
    function updateSparrow(b, dt, t) {
      let lift = 0, peck = 0;
      if (b === sparrows[0] && !b.trip && gifts.needsSeed?.()) {
        giftWait -= dt;
        if (giftWait <= 0 && b.state === "ground") {
          b.trip = "out";
          birdTrip(b, {x: W + unit(), y: H * .20}, "fly");
        }
      }
      if (b.state === "away") {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.trip = "return"; b.carrying = true;
          const gift = gifts.giftPoint?.();
          // 从画面右侧回来，停在种子右后方，种子落在鸟喙前而非身体下。
          const next = gift ? {x:gift.x + Math.max(26,unit()*.62), y:gift.y + 3} : freeBirdSpot(b) || {x:lawn().cx,y:lawn().cy};
          birdTrip(b, next, "fly");
        }
        return;
      }
      if (b.state === "fly" || b.state === "hop") {
        const f = b.fly;
        f.p = Math.min(1, f.p + dt / f.duration);
        const p = GardenHabitat.smooth(f.p);
        Object.assign(b,GardenHabitat.birdFlight(f,f.p));
        lift = Math.sin(Math.PI * p) * (b.state === "fly" ? 1.5+b.id*.25 : .16);
        if (f.p >= 1) {
          if (b.trip === "out") { b.state = "away"; b.timer = 3; }
          else {
            b.state = "ground"; b.timer = 3+b.id*1.3+Math.random()*4;
            if (b.trip === "return") { b.trip = null; b.carrying = false; giftWait = 6; b.timer = 1.1; gifts.deliverSeed?.(); }
          }
        }
      } else {
        b.timer -= dt;
        peck = b.timer < 2 ? Math.max(0, Math.sin(t * 5)) : 0;
        if (b.timer <= 0) {
          if (Math.random() < .45) flee(b);
          else {
            const next = freeBirdSpot(b, true);
            if (next) birdTrip(b, next, "hop");
            else b.timer = 3;
          }
        }
      }
      b.pose = { lift, peck, flap: t * 26, flying: b.state === "fly" };
    }
    function birdTrip(b, next, state) {
      b.fly = { fx: b.x, fy: b.y, tx: next.x, ty: next.y, p: 0,
        bendX:state==="fly"?(b.id%2?1:-1)*unit()*(.3+b.id*.12):0,bendY:state==="fly"?-unit()*(.3+b.id*.14):0,
        duration: state === "fly" ? Math.max(1.6+b.id*.2, Math.hypot(next.x - b.x, next.y - b.y) / (108+b.id*17)) : .45+b.id*.04 };
      b.face = next.x > b.x ? 1 : -1; b.state = state;
    }
    function flee(b) {
      if (b.state !== "ground") return;
      const next = freeBirdSpot(b);
      if (next) birdTrip(b, next, "fly");
    }
    function updateFrog(dt, t) {
      if (!pond) return;
      const f = frog;
      f.blinkT -= dt;
      if (f.blinkT < -0.12) f.blinkT = 3 + Math.random() * 3;
      let lift = 0,
        frame = 0,
        sac = 0;
      if (f.state === "sit") {
        f.timer -= dt;
        f.sacT += dt;
        if (f.timer < 0) {
          // 呱呱：喉囊连鼓两下
          sac = Math.max(0, Math.sin(-f.timer * 12)) * (f.timer > -0.55 ? 1 : 0);
          if (f.timer < -0.6) f.timer = 3 + Math.random() * 4;
        }
        sac = Math.max(sac, 0.15 + 0.1 * Math.sin(f.sacT * 3));
      } else if (f.state === "jump") {
        const j = f.jump;
        j.p += dt / 0.82;
        const p = Math.min(1, j.p);
        // 前 18% 时间压低身体蓄力，再伸腿离开栈桥。
        const travel = clamp((p - .18) / .82, 0, 1);
        frame = p < .18 ? 2 : p < .34 ? 3 : p < .85 ? 4 : 5;
        f.x = j.fx + (j.tx - j.fx) * travel;
        f.y = j.fy + (j.ty - j.fy) * travel;
        lift = Math.sin(Math.PI * travel) * 1.4;
        if (p >= 1) {
          f.state = "under";
          f.hidden = 3 + Math.random() * 3;
          ripples.push({ x: f.x, y: f.y, age: 0, size: unit() * 1.2 }, { x: f.x, y: f.y, age: -0.2, size: unit() * 0.9 });
        }
      } else if (f.state === "return") {
        const j=f.jump;j.p=Math.min(1,j.p+dt/.65);
        f.x=j.fx+(j.tx-j.fx)*j.p;f.y=j.fy+(j.ty-j.fy)*j.p;
        lift=Math.sin(Math.PI*j.p)*.7;
        frame=j.p<.2?3:j.p<.8?4:5;
        if(j.p>=1){f.state="sit";f.timer=2;f.face=f.homeFace;frame=0;}
      } else if (f.state === "under") {
        f.hidden -= dt;
        if (f.hidden <= 0 && pond) {
          const old={x:f.x,y:f.y};
          f.jump={fx:old.x,fy:old.y,tx:f.home.x,ty:f.home.y,p:0};
          f.x=old.x;f.y=old.y;f.state="return";f.face=f.home.x>old.x?1:-1;
          ripples.push({x:old.x,y:old.y,age:0,size:unit()*.7});
        }
      }
      f.pose = { lift, sac, frame, blink: f.blinkT < 0 };
      syncFrogHit();
    }
    function updateFly(dt, t) {
      const d = fly;
      d.reactionLeft=Math.max(0,(d.reactionLeft||0)-dt);
      // 上空活动范围独立于草地；悬停围绕固定锚点，绝不逐帧累加漂移。
      const region = GardenHabitat.air(compactGarden(), W, H);
      if (!d.anchor || d.layout !== `${W}:${H}`) {
        // 入场沿既有巡航空域随机分布，后续悬停仍围绕锚点，避免首帧固定演出。
        const angle=Math.random()*TAU,radius=Math.sqrt(Math.random())*.75;
        d.anchor = {x:region.cx+Math.cos(angle)*region.rx*radius,y:region.cy+Math.sin(angle)*region.ry*radius};
        d.x = d.anchor.x; d.y = d.anchor.y; d.layout = `${W}:${H}`;
        d.state = "hover"; d.timer = 2+Math.random()*5; d.hoverAge = Math.random()*2;d.heading=Math.random()*TAU;
      }
      if(d.playLeft>0) {
        d.playLeft-=dt;
        const target=GardenHabitat.onLawn(d.lure||{x:d.anchor.x+Math.sin(t*1.2)*unit(),y:d.anchor.y+Math.cos(t*1.2)*unit()*.45},region);
        const dx=target.x-d.x,dy=target.y-d.y,dist=Math.hypot(dx,dy),step=Math.min(dist,85*dt);
        if(dist>1){d.x+=dx/dist*step;d.y+=dy/dist*step;const heading=Math.atan2(dy,dx);d.heading+=Math.atan2(Math.sin(heading-d.heading),Math.cos(heading-d.heading))*(1-Math.exp(-dt*5));}
        d.state="play";
        if(d.playLeft<=0){d.anchor={x:d.x,y:d.y};d.state="hover";d.timer=4;d.hoverAge=0;d.lure=null;}
        return;
      }
      if(d.state==='orbit') {
        const r=d.orbit;r.p=Math.min(1,r.p+dt/4);const angle=TAU*ease(r.p);
        // 花边初始锚点可能在巡航空域外。绕当前位置画连续轨迹，不能逐帧投影到空域造成首帧闪现。
        const point={x:r.x+Math.sin(angle)*unit()*.9,y:r.y+(1-Math.cos(angle))*unit()*.25};
        const dx=point.x-d.x,dy=point.y-d.y;d.x=point.x;d.y=point.y;
        if(Math.hypot(dx,dy)>.01){const a=Math.atan2(dy,dx);d.heading+=Math.atan2(Math.sin(a-d.heading),Math.cos(a-d.heading))*(1-Math.exp(-dt*6));}
        if(r.p>=1){d.anchor={x:d.x,y:d.y};d.state='hover';d.timer=4;d.hoverAge=0;}
        return;
      }
      if (d.state === "hover") {
        d.timer -= dt;
        d.hoverAge = (d.hoverAge || 0) + dt;
        const settle = Math.min(1,d.hoverAge*.7);
        d.x = d.anchor.x + Math.sin(t * 1.2) * 1.2 * settle;
        d.y = d.anchor.y + Math.sin(t * 1.6) * 1.8 * settle;
        if (d.timer <= 0) {
          const target = GardenHabitat.onLawn({ x: d.x + (Math.random() - .5) * region.rx,
            y: d.y + (Math.random() - .5) * region.ry }, region);
          d.route = { from: { x: d.x, y: d.y }, to: target, p: 0,
            duration: Math.max(2.4, Math.hypot(target.x - d.x, target.y - d.y) / 55) };
          d.state = "cruise";
        }
      } else {
        const r = d.route;
        r.p = Math.min(1, r.p + dt / r.duration);
        const p = GardenHabitat.smooth(r.p);
        d.x = r.from.x + (r.to.x - r.from.x) * p;
        d.y = r.from.y + (r.to.y - r.from.y) * p - Math.sin(Math.PI * p) * (r.lift||5);
        const heading = Math.atan2(r.to.y - r.from.y, r.to.x - r.from.x);
        const delta = Math.atan2(Math.sin(heading - d.heading), Math.cos(heading - d.heading));
        d.heading += delta * (1 - Math.exp(-dt * 1.5));
        if (r.p >= 1) { d.anchor = r.to; d.state = "hover"; d.timer = 4 + Math.random() * 5; d.hoverAge = 0; }
      }
    }

    function pick(x, y) {
      const hit = (c, w, h) => Math.abs(x - c.x) < w && y < c.y + 4 && y > c.y - h;
      const L = unit();
      if (gardenAnimals() && hit(rabbit, L * depth(rabbit.y) * 0.6, L * depth(rabbit.y) * 1.05)) return rabbit;
      for (const b of sparrows) if (gardenAnimals() && b.state === "ground" && hit(b, L * 0.4, L * 0.5)) return b;
      if (waterAnimals() && pond && frog.state === "sit" && hit(frog, L * 0.45, L * 0.5)) return frog;
      if (waterAnimals() && Math.hypot(x - fly.x, y - fly.y) < L * 0.6) return fly;
      return null;
    }
    function interact(c) {
      if (c === rabbit) {
        if(rabbit.reactionLeft>0)return;
        const action='hop';rabbit.lastAction=action;
        rabbit.reactionLeft=.7;
        if(rabbit.state==='hop')rabbit.pendingAction=action;else rabbitAction(action);
      } else if (c.kind === "sparrow") {
        flee(c);
      } else if (c === frog) {
        if (!waterAnimals() || !pond || frog.state !== "sit") return;
        const w = pond.r - pond.l,
          h = pond.b - pond.t;
        frog.jump = { fx: frog.x, fy: frog.y, tx: courtyard ? frog.water.x : pond.l + w * (0.35 + Math.random() * 0.3), ty: courtyard ? frog.water.y : pond.t + h * (.45 + Math.random() * .15), p: 0 };
        frog.face = frog.jump.tx > frog.x ? 1 : -1;
        frog.state = "jump";
      } else if (c === fly) {
        if(!waterAnimals()||fly.reactionLeft>0)return;
        const action=GardenAnimalPose.choose(['lure','orbit','dart'],fly.lastAction,Math.random);fly.lastAction=action;
        fly.reactionLeft=action==='lure'?10:4;
        if(action==='lure')startLure();
        else if(action==='orbit'){fly.orbit={x:fly.x,y:fly.y,p:0};fly.state='orbit';}
        else {
          const air=GardenHabitat.air(compactGarden(),W,H),target=GardenHabitat.onLawn({x:fly.x+(fly.x<air.cx?1:-1)*unit()*2.4,y:fly.y+unit()*.3},air);
          fly.route={from:{x:fly.x,y:fly.y},to:target,p:0,duration:3,lift:unit()*.45};fly.state='cruise';
        }
      }
    }
    // 路面落点可能处在地块按钮的透明范围内；只让鸟身的可见小范围优先响应。
    function onBirdRoadClick(e) {
      if (!calibratedBirds || scene.classList.contains("farm-tool-selected") || !e.target.closest(".farm-plot")) return;
      const r=scene.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      const bird=sparrows.find(b=>{
        const size=unit()*depth(b.y)*.55;
        return b.state==="ground" && Math.abs(x-b.x)<size*.52 && y>b.y-size*.7 && y<b.y+3;
      });
      if (bird) {e.preventDefault();e.stopPropagation();interact(bird);}
    }
    function onClick(e) {
      if (e.target.closest("button, a, input, select, .dialog")) return;
      const r = scene.getBoundingClientRect();
      const point = { x: e.clientX - r.left, y: e.clientY - r.top };
      if(fly.playLeft>0)fly.lure=point;
      const c = pick(point.x, point.y);
      if (c) interact(c);
      else if (gardenAnimals() && !scene.classList.contains("farm-tool-selected") && GardenHabitat.inLawn(point, lawn())) {
        calledSpot = point;
        // 先落地再继续下一跳，连续点草地也不会瞬移。
        if (rabbit.state !== "hop") startHops(calledSpot);
      }
    }
    function onMove(e) {
      const r = scene.getBoundingClientRect();
      if(fly.playLeft>0)fly.lure={x:e.clientX-r.left,y:e.clientY-r.top};
      if (e.target.closest("button, a, input, select")) return;
      scene.classList.toggle("critter-hover", !!pick(e.clientX - r.left, e.clientY - r.top));
    }
    scene.addEventListener("click", onBirdRoadClick,true);
    scene.addEventListener("click", onClick);
    scene.addEventListener("pointermove", onMove);
    function startLure(){if(!waterAnimals())return;fly.playLeft=10;fly.lure=null;fly.anchor={x:fly.x,y:fly.y};}
    function stopLure(){fly.playLeft=0;fly.reactionLeft=0;fly.state='hover';fly.anchor={x:fly.x,y:fly.y};fly.hoverAge=0;fly.timer=3;}
    const onKey=e=>{if(e.key==='Escape'&&fly.playLeft>0)stopLure();};document.addEventListener('keydown',onKey);

    let raf = 0,
      last = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (document.hidden || !W) return;
      const t = now / 1000;
      rabbitHit.hidden=!gardenAnimals();
      if(gardenAnimals())updateRabbit(dt, t);
      rabbitHit.style.left = `${rabbit.x}px`;
      rabbitHit.style.top = `${rabbit.y - unit() * depth(rabbit.y) * .45 * .72}px`;
      if(gardenAnimals())sparrows.forEach((b) => updateSparrow(b, dt, t));
      if(waterAnimals())updateFrog(dt, t);else syncFrogHit();
      if(waterAnimals())updateFly(dt, t);
      ripples.forEach((r) => (r.age += dt));
      while (ripples.length && ripples[0].age > 1.1) ripples.shift();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ripples.forEach((r) => r.age > 0 && drawRipple(ctx, r));
      // 远的先画、近的后画
      const ground = [...(gardenAnimals()?[rabbit,...sparrows.filter(b=>b.state!=="away")]:[]), ...(!waterAnimals() || !pond || frog.state === "under" ? [] : [frog])].sort((a, b) => a.y - b.y);
      for (const c of ground) {
        const L = c.kind === "frog" ? frogSize() : unit() * depth(c.y) * (c.kind === "sparrow" ? (compactGarden() ? .72 : .55) : .72);
        if(c.kind==='rabbit')c.drawSize=L;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(L * c.face, L);
        ctx.lineJoin = "round";
        if (c.kind === "rabbit") drawRabbit(ctx, c);
        else if (c.kind === "sparrow") {
          drawSparrow(ctx, c);
          if (c.carrying) {
            ctx.fillStyle = "#bb8045"; ctx.strokeStyle = "#fff3b4"; ctx.lineWidth = .025;
            ctx.beginPath(); ctx.ellipse(.55, -.45 - (c.pose.lift || 0), .09, .06, -.4, 0, TAU); ctx.fill(); ctx.stroke();
          }
        }
        else drawFrog(ctx, c);
        ctx.restore();
      }
      if(waterAnimals()){
        ctx.save();
        ctx.translate(fly.x, fly.y);
        const FL = unit() * 0.75;
        ctx.scale(FL, FL);
        drawDragonfly(ctx, fly, t);
        ctx.restore();
      }
      canvas.dataset.rabbit = JSON.stringify({ x: rabbit.x, y: rabbit.y, state: rabbit.state, frame: rabbit.pose.frame,head:rabbit.skin.head,neck:rabbit.skin.neck,action:rabbit.lastAction,hop:rabbit.hop });
      canvas.dataset.birds = JSON.stringify(sparrows.map(b => ({id:b.id,x:b.x,y:b.y,state:b.state,routeStep:b.routeStep,destination:b.fly&&b.state!=="ground"?{x:b.fly.tx,y:b.fly.ty}:null,trip:b.trip||null,carrying:!!b.carrying})));
      canvas.dataset.terrain = JSON.stringify(lawn());
      canvas.dataset.frog = JSON.stringify(waterAnimals() && pond ? {x:frog.x,y:frog.y,state:frog.state} : null);
      canvas.dataset.dragonfly = JSON.stringify(waterAnimals()?{ x: fly.x, y: fly.y, state: fly.state,action:fly.lastAction }:null);
    }
    raf = requestAnimationFrame(frame);
    current = {
      destroy() {
        cancelAnimationFrame(raf);
        clearInterval(remeasure);
        ro.disconnect();
        scene.removeEventListener("click", onBirdRoadClick,true);
        scene.removeEventListener("click", onClick);
        scene.removeEventListener("pointermove", onMove);
        document.removeEventListener('keydown',onKey);
        scene.classList.remove("critter-hover");
        canvas.remove();
        frogHit.remove();
        rabbitHit.remove();
      },
      // 便于验收：当前各动物的状态
      peek: () => ({ rabbit: { x: rabbit.x, y: rabbit.y, state: rabbit.state,playHops:rabbit.playHops||0 }, sparrows: sparrows.map((b) => b.state), frog: waterAnimals()&&pond ? frog.state : null, fly: waterAnimals()?fly.state:null,flyPoint:waterAnimals()?{x:fly.x,y:fly.y}:null }),
      poke: (kind) => interact(kind === "rabbit" ? rabbit : kind === "frog" ? frog : kind === "fly" ? fly : sparrows[0]),
      act(action) {
        if(['pet','play','call'].includes(action)){if(rabbit.state==='hop')rabbit.pendingAction=action;else rabbitAction(action);}
        else if(action==="lure")startLure();
        else if(action==="stop-lure")stopLure();
      },
    };
  }
  function unmount() {
    current?.destroy();
    current = null;
  }
  return { mount, unmount, peek: () => current?.peek(), poke: (k) => current?.poke(k), act:a=>current?.act(a), drawRabbit, drawSparrow, drawFrog, drawDragonfly };
})();
if (typeof module !== "undefined") module.exports = GardenCritters;
