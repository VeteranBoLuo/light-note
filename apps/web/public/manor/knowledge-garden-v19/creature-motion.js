/* 水族动作：同一份解剖形变驱动养鱼舱的局部动作网格。
   位移单位为 100 × 60 贴图的比例；身体核心、硬壳和固着根部保持稳定。
   路线与身体动作分开：停下来也会呼吸、舒腕，转身由共享 WebGL 渲染器处理。 */
const CreatureMotion = (() => {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const TAU = Math.PI * 2;
  // cycle 秒/周期；pace 为贴图单位/秒。不同物种保留自己的节奏、厚度和停驻习性。
  const PROFILES = {
    moonjelly:  { body: 'jelly', cycle: 2.8, rim: .36, thick: .65, pace: 2, habitat: 'drift' },
    purplejelly:{ body: 'jelly', cycle: 3.4, rim: .27, thick: .6, pace: 1.7, habitat: 'drift' },
    immortal:  { body: 'jelly', cycle: 1.8, rim: .43, thick: .7, pace: 2.2, habitat: 'drift' },
    peachjelly:{ body: 'jelly', cycle: 2.2, rim: .42, thick: .62, pace: 2.5, habitat: 'drift' },
    combjelly: { body: 'comb', cycle: 2.6, thick: .75, pace: 2.6, habitat: 'drift' },
    seaangel:  { body: 'wings', cycle: 1.5, thick: .52, pace: 4, habitat: 'drift' },
    octopus:   { body: 'octopus', cycle: 4.2, thick: .8, pace: 7, habitat: 'bottom', rest: 2.8 },
    blueringed:{ body: 'octopus', cycle: 3.5, thick: .75, pace: 5.5, habitat: 'bottom', rest: 3.8 },
    starfish:  { body: 'star', cycle: 7.5, thick: .28, pace: .65, habitat: 'bottom', radial: true, rest: 5 },
    nautilus:  { body: 'nautilus', cycle: 3.8, thick: .85, pace: 7, habitat: 'glide' },
    hermit:    { body: 'hermit', cycle: 1.8, thick: .7, pace: 5.5, habitat: 'bottom', rest: 3.5 },
    shrimp:    { body: 'shrimp', cycle: 1.1, thick: .55, pace: 8, habitat: 'bottom', rest: 2 },
    urchin:    { body: 'urchin', cycle: 5.5, thick: .85, pace: .7, habitat: 'bottom', radial: true, rest: 4 },
    seaslug:   { body: 'slug', cycle: 4.6, thick: .55, pace: 1.6, habitat: 'bottom', rest: 2 },
    crab:      { body: 'crab', cycle: 1.4, thick: .6, pace: 7, habitat: 'bottom', radial: true, rest: 3 },
    mantis:    { body: 'mantis', cycle: 1.6, thick: .6, pace: 7, habitat: 'bottom', rest: 2.6 },
    sanddollar:{ body: 'sanddollar', cycle: 7, thick: .16, pace: .4, habitat: 'bottom', radial: true, rest: 4 },
    scallop:   { body: 'bivalve', cycle: 4, thick: .6, pace: 0, habitat: 'bottom', anchored: true },
    featherstar:{body: 'feather', cycle: 4.8, thick: .24, pace: 2.6, habitat: 'drift', radial: true },
    seapen:    { body: 'fronds', cycle: 6.5, thick: .35, pace: 0, habitat: 'bottom', anchored: true },
    anemone:   { body: 'anemone', cycle: 5.2, thick: .65, pace: 0, habitat: 'bottom', anchored: true },
    clam:      { body: 'bivalve', cycle: 6.8, thick: .85, pace: 0, habitat: 'bottom', anchored: true },
    applesnail:{ body: 'snail', cycle: 5.8, thick: .85, pace: 1.2, habitat: 'bottom', rest: 2 },
    crayfish:  { body: 'crayfish', cycle: 1.7, thick: .65, pace: 6, habitat: 'bottom', rest: 3 },
    axolotl:   { body: 'axolotl', cycle: 3, thick: .6, pace: 5, habitat: 'bottom', rest: 4 },
    horseshoe:{ body: 'horseshoe', cycle: 3.7, thick: .35, pace: 2.4, habitat: 'bottom', rest: 3.5 },
    seaturtle:{ body: 'turtle', cycle: 3.4, thick: .65, pace: 12, habitat: 'glide' },
    krill:    { body: 'shrimp', cycle: .9, thick: .45, pace: 5, habitat: 'drift' },
    glasssquid:{body: 'squid', cycle: 2.6, thick: .62, pace: 7, habitat: 'drift' },
    seapig:   { body: 'seapig', cycle: 3.3, thick: .8, pace: 2, habitat: 'bottom', rest: 3 },
    vampire:  { body: 'web', cycle: 3.8, thick: .65, pace: 4, habitat: 'drift' },
    sealily:  { body: 'fronds', cycle: 7.2, thick: .3, pace: 0, habitat: 'bottom', anchored: true },
    dumbo:    { body: 'dumbo', cycle: 2.4, thick: .8, pace: 5, habitat: 'drift' },
    cuttlefish:{ body:'cuttle',cycle:2.5,thick:.7,pace:8,habitat:'glide' },
    lobster: { body:'crayfish',cycle:2,thick:.62,pace:4.5,habitat:'bottom',rest:3.4 },
    cucumber:{ body:'cucumber',cycle:5.5,thick:.8,pace:1.1,habitat:'bottom',rest:2.5 },
    basketstar:{body:'basket',cycle:6.2,thick:.3,pace:.7,habitat:'bottom',radial:true,rest:4.2 },
    crownjelly:{body:'jelly',cycle:3.1,rim:.52,thick:.8,pace:2.8,habitat:'drift' },
    siphonophore:{body:'colony',cycle:3.8,thick:.5,pace:2,habitat:'drift' },
  };
  function gait(kind) {
    const p = PROFILES[kind];
    return { tail: 0, fin: 0, hinge: 0, beat: 1 / p.cycle, thick: p.thick, wholeBody: true,
      cruise: p.pace / 86, turn: 2.8, hover: .35 };
  }
  function deform(kind, u, v, time, activity = 1, bind = null) {
    const p = PROFILES[kind];
    if (!p) return [0, 0, 0];
    if(p.body==='comb'&&bind){u=(u-bind.minU)/(bind.maxU-bind.minU);v=(v-bind.minV)/(bind.maxV-bind.minV);}
    const a = time * TAU / p.cycle, x = u - .5, y = v - .5;
    const breath = Math.sin(a), edge = smooth((Math.abs(x) - .12) / .3);
    const feet = smooth((v - .48) / .4), top = smooth((.85 - v) / .6);
    const effort = .65 + .35 * clamp(activity, 0, 1.5);
    let dx = 0, dy = 0, dz = 0;
    switch (p.body) {
      case 'cuttle': {
        const skirt=(1-smooth((u-.62)/.1))*smooth((Math.abs(y)-.12)/.25);
        const arm=smooth((u-.62)/.3);
        dy=.038*skirt*Math.sin(a-u*14)+.04*arm*Math.sin(a-v*7);
        dz=.035*skirt*Math.cos(a-u*14);dx=.02*arm*Math.cos(a+v*9);break;
      }
      case 'cucumber':
        dx=.012*feet*Math.sin(a-u*12);dy=.018*feet*Math.sin(a*2-u*16);
        dz=.009*(1-edge)*Math.sin(a-u*4);break;
      case 'basket': {
        const radius=Math.hypot(x,y),angle=Math.atan2(y,x),tip=smooth((radius-.13)/.3);
        const curl=.055*tip*Math.sin(a-radius*6+angle*5);
        dx=Math.cos(angle+Math.PI/2)*curl;dy=Math.sin(angle+Math.PI/2)*curl;
        dz=.03*tip*Math.cos(a+angle*5);break;
      }
      case 'colony': {
        const bell=1-smooth((v-.4)/.25),stroke=Math.sin(a-u*11);
        dy=.025*bell*stroke+.045*(1-bell)*Math.sin(a-u*8-v*4);
        dx=.012*bell*stroke;dz=.018*bell*Math.cos(a-u*11);break;
      }
      case 'jelly': {
        const bell = 1 - smooth((v - p.rim + .04) / .1);
        const stroke = Math.pow(Math.max(0, Math.sin(a)), 2);
        const trail = smooth((v - p.rim) / (1 - p.rim));
        dx = -x * .18 * stroke * bell + .035 * trail * Math.sin(a - v * 5);
        dy = -.065 * stroke * bell + .045 * trail * Math.sin(a - v * 4);
        dz = .035 * stroke * bell * (1 - edge);
        break;
      }
      case 'octopus': {
        // 头囊固定在上方，八腕从根部依次传递弯曲；末端抬起、卷回，左右不同相。
        const arm = smooth((v - .34) / .52), wave = a - v * 5 + u * 13;
        dx = .052 * arm * Math.sin(wave) * effort;
        dy = .065 * arm * Math.cos(wave + x * 5) * effort;
        dz = .038 * arm * Math.sin(wave + 1.1);
        // 头囊保持原画，不随呼吸整块缩放。
        break;
      }
      case 'comb':
        // 栉板的边缘轻动，透明躯干保持原有比例。
        dx = .004 * edge * Math.sin(a - v * 4); dy = .006 * edge * Math.sin(a - v * 5);
        dz = 0; break;
      case 'wings':
        dy = .1 * edge * Math.sin(a); dz = .07 * edge * Math.cos(a); dx = -x * .12 * edge * (1 - Math.cos(a)); break;
      case 'nautilus': {
        const tentacle = smooth((u - .6) / .3);
        dy = .038 * tentacle * Math.sin(a - u * 8 + v * 3);
        dx = .025 * tentacle * Math.cos(a - u * 7); break;
      }
      case 'star': case 'feather': case 'urchin': case 'sanddollar': {
        const r = Math.hypot(x, y), angle = Math.atan2(y, x);
        const tip = smooth((r - .12) / .35);
        const amp = { star: .032, feather: .065, urchin: .012, sanddollar: .006 }[p.body];
        const wave = Math.sin(a - r * 7 + angle * (p.body === 'star' ? 5 : 8));
        dx = Math.cos(angle) * amp * tip * wave;
        dy = Math.sin(angle) * amp * tip * wave;
        dz = amp * .7 * tip * Math.cos(a + angle * 5);
        break;
      }
      case 'fronds': case 'anemone': {
        // 根部 v >= .85 严格不动，摆幅向触手尖递增。
        const stem = smooth((.86 - v) / .7);
        dx = stem * (.04 * Math.sin(a - v * 3) + .016 * Math.sin(a * 1.7 + u * 14));
        dy = stem * .018 * Math.sin(a + u * 12 - v * 3);
        dz = .025 * stem * Math.sin(a - v * 4 + u * 8); break;
      }
      case 'bivalve': {
        const open = .5 + .5 * Math.sin(a), valve = smooth((v - .78) / .2);
        dy = -.055 * open * valve;
        dx = x * .045 * open * valve;
        dz = .07 * open * valve; break;
      }
      case 'snail': case 'hermit': {
        const soft = smooth((v - .48) / .35), head = smooth((u - .65) / .3);
        dx = .015 * soft * Math.sin(a * 2 - u * 15);
        dy = .018 * soft * Math.sin(a * 2 - u * 12) + .023 * head * Math.sin(a + v * 8);
        dz = .012 * head * Math.cos(a + v * 5); break;
      }
      case 'slug':
        dx = .014 * feet * Math.sin(a - u * 13);
        dy = .025 * feet * Math.sin(a - u * 14) + .018 * top * Math.sin(a - u * 7);
        dz = .015 * top * Math.sin(a + u * 9); break;
      case 'crab': case 'crayfish': case 'shrimp': case 'mantis': {
        const leg = Math.max(feet, edge * .7), wave = a * 2 + u * 19 + v * 4;
        dx = .033 * leg * Math.cos(wave) * effort;
        dy = .036 * leg * Math.sin(wave) * effort;
        dz = .02 * leg * Math.sin(wave + .8);
        // 螯/触角慢一拍，甲壳核心没有整块橡皮式摆动。
        dx += .013 * edge * top * Math.sin(a - v * 8);
        dy += .028 * edge * top * Math.sin(a + u * 10); break;
      }
      case 'axolotl': {
        const tail = smooth((.42 - u) / .38), gill = Math.exp(-(((u - .72) / .14) ** 2)) * top;
        dz = .045 * tail * Math.sin(a - u * 6);
        dy = .025 * feet * Math.sin(a * 2 + u * 14) + .025 * gill * Math.sin(a * 1.6 + v * 10);
        dx = .018 * gill * Math.cos(a * 1.6 + v * 10); break;
      }
      case 'horseshoe':
        dy = .024 * smooth((u - .65) / .3) * Math.sin(a - u * 7) + .01 * feet * Math.sin(a * 2 + u * 16);
        dz = .02 * smooth((u - .65) / .3) * Math.cos(a - u * 7); break;
      case 'turtle': {
        const flipper = smooth((v - .58) / .26) * smooth((.9 - u) / .16);
        dy = .07 * flipper * Math.sin(a - u * 2) * Math.sign(y);
        dx = .025 * flipper * Math.cos(a - u * 2);
        dz = .055 * flipper * Math.cos(a - u * 2); break;
      }
      case 'squid': {
        const tentacle = smooth((u - .6) / .3);
        dx = .035 * tentacle * Math.sin(a - v * 7 + u * 5);
        dy = .05 * tentacle * Math.cos(a - v * 6);
        dz = .025 * edge * Math.sin(a + v * 9); break;
      }
      case 'web': case 'dumbo': {
        const skirt = smooth((v - .35) / .55);
        dx = x * .13 * skirt * Math.sin(a - v * 3);
        dy = .045 * skirt * Math.cos(a - v * 4 + u * 6);
        dz = .045 * skirt * Math.sin(a + u * 7);
        if (p.body === 'dumbo') {
          const ear = edge * (1 - smooth((v - .4) / .2));
          dy += .075 * ear * Math.sin(a * 1.5); dz += .06 * ear * Math.cos(a * 1.5);
        }
        break;
      }
      case 'seapig':
        dy = .032 * feet * Math.sin(a * 2 + u * 18);
        dx = .024 * feet * Math.cos(a * 2 + u * 18);
        dz = 0; break;
    }
    return [dx, dy, dz];
  }
  function create(f, i, rng = Math.random) {
    const p = PROFILES[f.kind];
    const dir = rng() < .5 ? -1 : 1;
    return { kind: f.kind, habitat: p.habitat, scale: f.scale, x: f.cx, y: f.cy, homeY: f.cy,
      vx: 0, vy: 0, dir, yaw: p.anchored || p.radial ? 0 : dir > 0 ? 0 : Math.PI, pitch: 0, goal: f.cx, rest: rng() * 3, t0: rng() * 30,
      bounds: f.bounds, time: 0, phase: 0, drift: i, amp: 1, vary: 1, BL: 86 * f.scale, zdir: 1, mode: 'hover' };
  }
  function step(s, dt, time, rng = Math.random) {
    const p = PROFILES[s.kind], b = s.bounds;
    const t = time + s.t0, a = t * TAU / p.cycle;
    s.homeY ??= s.y; s.drift ??= 0; s.yaw ??= s.dir < 0 ? Math.PI : 0;
    let wantX = 0, wantY = 0;
    if (p.anchored) { s.vx = 0; s.vy = 0; }
    else if (p.habitat === 'bottom') {
      s.rest -= dt;
      if (s.rest <= 0 && Math.abs(s.goal - s.x) < 3 * s.scale) {
        s.goal = clamp(s.x + (rng() < .5 ? -1 : 1) * (20 + rng() * 55) * s.scale, b.minX, b.maxX);
        s.rest = p.rest + rng() * 2;
      }
      if (s.rest <= 0) wantX = clamp((s.goal - s.x) * .7, -p.pace * s.scale, p.pace * s.scale);
    } else {
      if (s.x >= b.maxX - 8 * s.scale) s.dir = -1;
      if (s.x <= b.minX + 8 * s.scale) s.dir = 1;
      wantX = s.dir * p.pace * s.scale * (p.habitat === 'drift' ? .5 + .35 * Math.sin(t * .3) : 1);
      const room = b.maxY - b.minY;
      const targetY = clamp(s.homeY + Math.sin(t * .24) * room * .22, b.minY, b.maxY);
      wantY = (targetY - s.y) * .35;
      if (p.body === 'jelly') wantY += (1 - 3 * Math.pow(Math.max(0, Math.sin(a)), 2)) * 8 * s.scale;
      else wantY += Math.sin(a) * 2 * s.scale;
    }
    // 先慢慢转身，再朝新方向走；无瞬间翻面。辐射对称的海星、蟹保持朝向，仅轻轻侧倾。
    if (Math.abs(wantX) > .05) s.dir = wantX > 0 ? 1 : -1;
    const yawTo = p.anchored ? 0 : p.radial ? .12 * Math.sin(t * .35) : s.dir > 0 ? 0 : Math.PI;
    const delta = yawTo - s.yaw;
    s.yaw += clamp(delta, -dt * Math.PI / 2.8, dt * Math.PI / 2.8);
    if (!p.radial && Math.abs(delta) > .2) wantX *= .2;
    const blend = 1 - Math.exp(-dt * 2);
    s.vx += (wantX - s.vx) * blend; s.vy += (wantY - s.vy) * blend;
    s.x = clamp(s.x + s.vx * dt, b.minX, b.maxX);
    s.y = p.habitat === 'bottom' ? s.homeY : clamp(s.y + s.vy * dt, b.minY, b.maxY);
    s.pitch = p.habitat === 'bottom' ? 0 : .035 * Math.sin(a * .4);
    s.amp = .65 + Math.min(1, Math.abs(s.vx) / Math.max(1, p.pace * s.scale)) * .5;
    s.phase = a; s.drift += dt * .13;
    s.mode = Math.abs(delta) > .2 ? 'turn' : Math.abs(s.vx) < .5 ? 'hover' : 'cruise';
    return s;
  }
  return { PROFILES, gait, deform, create, step };
})();
if (typeof module !== 'undefined') module.exports = CreatureMotion;
