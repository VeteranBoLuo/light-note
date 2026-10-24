/* 树叶动效（WebGL，原图不改）
   - 树冠事先按“叶片之间的暗缝”切成一片片叶子（garden-tree*-leaves：编号图 + 叶片清单）
   - 底层：整棵树，叶片所在位置压暗成树荫；整个树冠以树干顶端为轴轻轻摆动（刚性，不扭曲）
   - 叶片层：每片叶子绕自己的叶柄单独慢慢摆（约每秒半次到一次），频率、相位、摆幅各不相同；阵风从左往右扫过时顺风偏一点、摆得更开，
     叶面迎光忽明忽暗——叶子一动，露出的是下面的树荫，所以看起来是一片片叶子在沙沙动，而不是整团在晃
   - 落叶：直接用树上的某片叶子，大小与树上的叶子一致，边飘边翻面
   - 树皮、树根与草丛不动；减少动态效果时静止 */
const GardenMotion = (() => {
  let current = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function leafWeight(r, g, b, a, y) {
    if (y >= 0.72 || a < 100) return 0;
    return clamp((g - r + 5) / 24) * clamp((g - b - 5) / 28) * clamp((0.72 - y) / 0.09);
  }
  // 风力：缓慢起伏，偶有阵风
  function wind(t) {
    return 0.55 + 0.22 * Math.sin(t * 0.21) + 0.14 * Math.sin(t * 0.57 + 1.3) + 0.09 * Math.sin(t * 1.33 + 0.4);
  }
  // 阵风从左往右扫过树冠，约 1.4 秒穿过整棵树
  const gustAt = (t, x) => wind(t - x * 1.4);
  const PIVOT = [0.52, 0.66];
  // 整个树冠的摆角（弧度）：很小，刚性转动
  const canopyAngle = (t, pulse) => (0.012 + 0.012 * gustAt(t, 0.5)) * Math.sin(t * 0.85) + 0.004 * Math.sin(t * 1.7 + 0.6) + pulse * 0.012 * Math.sin(t * 10);
  // 底层网格位移（贴图 UV）：只有绿色树冠随整体摆动，树皮、树根、草丛不动
  function field(x, y, time, pulse, weight = 1) {
    if (y >= 0.72 || weight <= 0) return [0, 0];
    const gain = weight * Math.pow(clamp((0.72 - y) / 0.09), 2);
    const theta = canopyAngle(time, pulse);
    return [-(y - PIVOT[1]) * theta * gain, (x - PIVOT[0]) * theta * gain];
  }
  // 单片叶子绕叶柄翻动的角度（弧度）：慢速轻摆为主，阵风来时整片树冠的叶子顺风一齐偏一点、摆得更开；轻触时抖一下
  function leafAngle(leaf, time, gust, pulse) {
    const flutter = Math.sin(time * leaf.f + leaf.ph) * (0.15 + 0.85 * gust * gust);
    const sway = 0.6 * gust * Math.sin(time * leaf.f * 0.35 + leaf.ph2);
    const lean = 0.5 * (gust - 0.55);
    const shake = pulse * 1.6 * Math.sin(time * 7 + leaf.ph);
    return 0.1 * leaf.amp * (flutter + sway + lean + shake);
  }
  const leafShade = (leaf, time, gust) => 1 + 0.06 * gust * Math.sin(time * leaf.f * 0.5 + leaf.ph3);

  // 树冠像素点（UV），不支持 WebGL 时 DOM 落叶从这里出现
  let canopy = [];
  function canopyPoint(rand = Math.random) {
    return canopy.length ? canopy[Math.floor(rand() * canopy.length)] : null;
  }

  function compile(gl, vs, fs) {
    const program = gl.createProgram();
    for (const [type, text] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error("Tree shader unavailable");
      gl.attachShader(program, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("Tree shader link failed");
    return program;
  }
  function texture(gl, image, filter, mipmap) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    return t;
  }
  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  const imageReady = (img) =>
    img.complete && img.naturalWidth
      ? Promise.resolve(img)
      : new Promise((resolve, reject) => {
          img.addEventListener("load", () => resolve(img), { once: true });
          img.addEventListener("error", reject, { once: true });
        });

  function mount() {
    const root = document.querySelector("#treeInteraction");
    if (current?.root === root) return;
    current?.destroy();
    current = null;
    // 以文件方式打开时本地图片不能作为 WebGL 纹理，保留静态树
    if (!root || location.protocol === "file:") return;
    const img = root.querySelector(".tree-image");
    const seamless = !!root.closest(".seaside-courtyard");
    const base = img.getAttribute("src").replace(/\.webp(\?.*)?$/, "");
    const canvas = document.createElement("canvas");
    canvas.className = "tree-mesh";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return;
    let baseProgram, leafProgram;
    try {
      baseProgram = compile(
        gl,
        "attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){v=uv;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);}",
        // 叶片所在位置压暗成树荫：叶子翻动时露出的是阴影，而不是同一片叶子的重影
        seamless ? "precision mediump float;varying vec2 v;uniform sampler2D tex;uniform float time;uniform float pulse;void main(){vec4 c=texture2D(tex,v);float green=smoothstep(-.02,.12,c.g-c.r)*smoothstep(.02,.18,c.g-c.b)*(1.-smoothstep(.58,.72,v.y));vec2 d=vec2(sin(v.y*55.+time*1.7)+.45*sin(v.x*61.-time*2.1),.35*sin(v.x*48.+time*1.4))*.0009*green*(1.+pulse*2.);gl_FragColor=texture2D(tex,v+d);}" : "precision mediump float;varying vec2 v;uniform sampler2D tex;uniform sampler2D mask;void main(){vec4 c=texture2D(tex,v);float m=texture2D(mask,v).b;gl_FragColor=vec4(c.rgb*(1.-.5*m),c.a);}",
      );
      leafProgram = compile(
        gl,
        "attribute vec2 p;attribute vec2 uv;attribute float id;attribute float shade;attribute float fade;varying vec2 v;varying float i;varying float l;varying float o;void main(){v=uv;i=id;l=shade;o=fade;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);}",
        // 只画编号与本片一致的像素，包围盒里邻近的叶子不会跟着动
        "precision mediump float;varying vec2 v;varying float i;varying float l;varying float o;uniform sampler2D tex;uniform sampler2D ids;uniform sampler2D mask;void main(){vec4 k=texture2D(ids,v);float pid=floor(k.r*255.+.5)+floor(k.g*255.+.5)*256.;if(abs(pid-i)>.5)discard;vec4 c=texture2D(tex,v);gl_FragColor=vec4(min(c.rgb*l,vec3(1.)),c.a*texture2D(mask,v).b*o);}",
      );
    } catch {
      return;
    }
    // 底层网格：只用于整体摆动
    const n = 64,
      stride = n + 1,
      total = stride * stride;
    const mesh = new Float32Array(total * 4),
      weights = new Float32Array(total),
      meshIndex = new Uint16Array(n * n * 6);
    for (let y = 0, k = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = y * stride + x;
        for (const v of [a, a + 1, a + stride, a + stride, a + 1, a + stride + 1]) meshIndex[k++] = v;
      }
    for (let y = 0; y <= n; y++)
      for (let x = 0; x <= n; x++) {
        const j = (y * stride + x) * 4;
        mesh[j] = mesh[j + 2] = x / n;
        mesh[j + 1] = mesh[j + 3] = y / n;
      }
    const meshBuffer = gl.createBuffer(),
      meshIndexBuffer = gl.createBuffer(),
      leafBuffer = gl.createBuffer(),
      leafIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshIndex, gl.STATIC_DRAW);
    let leaves = [],
      falling = [],
      leafData = null,
      textures = [],
      loaded = false,
      raf = 0,
      visible = true,
      interaction = 0,
      resolveTouch = null,
      destroyed = false;
    const MAX_FALL = 32;
    const obs = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    obs.observe(root);

    Promise.all([
      imageReady(img),
      loadImage(base + "-leaves.webp"),
      fetch(base + "-leaves.json").then((r) => (r.ok ? r.json() : Promise.reject(Error("no leaves")))),
    ])
      .then(([color, idImage, info]) => {
        if (destroyed) return;
        // 树冠权重：只让绿色树冠随整体摆动
        const sample = document.createElement("canvas");
        sample.width = sample.height = stride;
        const ctx = sample.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(color, 0, 0, stride, stride);
        const rgba = ctx.getImageData(0, 0, stride, stride).data;
        canopy = [];
        for (let i = 0; i < total; i++) {
          const j = i * 4,
            y = Math.floor(i / stride) / n;
          weights[i] = leafWeight(rgba[j], rgba[j + 1], rgba[j + 2], rgba[j + 3], y);
          if (weights[i] > 0.85 && y < 0.6) canopy.push([(i % stride) / n, y]);
        }
        const W = info.w,
          H = info.h;
        let seed = 41;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        leaves = info.pieces.map(([x0, y0, x1, y1, px, py, amp, area], k) => ({
          id: k + 1,
          x0: (x0 - 1) / W,
          y0: (y0 - 1) / H,
          x1: (x1 + 1) / W,
          y1: (y1 + 1) / H,
          px: px / W,
          py: py / H,
          amp,
          area,
          f: Math.PI * 2 * (0.45 + rand() * 0.65),
          ph: rand() * Math.PI * 2,
          ph2: rand() * Math.PI * 2,
          ph3: rand() * Math.PI * 2,
        }));
        const quads = leaves.length + MAX_FALL;
        leafData = new Float32Array(quads * 4 * 7);
        const leafIndex = new Uint16Array(quads * 6);
        for (let q = 0; q < quads; q++) {
          const a = q * 4;
          leafIndex.set([a, a + 1, a + 2, a, a + 2, a + 3], q * 6);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, leafIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, leafIndex, gl.STATIC_DRAW);
        // 编号图是数据，不做颜色空间转换
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        textures = [texture(gl, color, gl.LINEAR, true), texture(gl, idImage, gl.NEAREST, false), texture(gl, idImage, gl.LINEAR, true)];
        loaded = true;
        root.querySelector(".tree-idle").prepend(canvas);
        root.classList.add("mesh-ready");
      })
      .catch(() => {
        /* 叶片资源缺失或不支持时保留静态原图 */
      });

    function bindTextures(program, names) {
      names.forEach(([name, t], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, textures[t]);
        gl.uniform1i(gl.getUniformLocation(program, name), unit);
      });
    }
    const enabled = new Set();
    function attribs(program, list, size) {
      for (const a of enabled) gl.disableVertexAttribArray(a);
      enabled.clear();
      let offset = 0;
      for (const [name, n] of list) {
        const a = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(a);
        enabled.add(a);
        gl.vertexAttribPointer(a, n, gl.FLOAT, false, size, offset);
        offset += n * 4;
      }
    }
    // 一片叶子的四个角：先绕叶柄转 angle，再随树冠绕树干顶端转 theta；flip 是落叶翻面的横向缩放
    function writeQuad(q, leaf, angle, theta, shade, fade, ox = 0, oy = 0, flip = 1) {
      const c = Math.cos(angle),
        s = Math.sin(angle),
        ct = Math.cos(theta),
        st = Math.sin(theta),
        cx = (leaf.x0 + leaf.x1) / 2;
      const corners = [
        [leaf.x0, leaf.y0],
        [leaf.x1, leaf.y0],
        [leaf.x1, leaf.y1],
        [leaf.x0, leaf.y1],
      ];
      corners.forEach(([u, v], i) => {
        const x = cx + (u - cx) * flip - leaf.px,
          y = v - leaf.py;
        const rx = leaf.px + x * c - y * s + ox - PIVOT[0],
          ry = leaf.py + x * s + y * c + oy - PIVOT[1];
        const j = (q * 4 + i) * 7;
        leafData[j] = PIVOT[0] + rx * ct - ry * st;
        leafData[j + 1] = PIVOT[1] + rx * st + ry * ct;
        leafData[j + 2] = u;
        leafData[j + 3] = v;
        leafData[j + 4] = leaf.id;
        leafData[j + 5] = shade;
        leafData[j + 6] = fade;
      });
    }
    function draw(now) {
      raf = requestAnimationFrame(draw);
      const age = interaction ? (now - interaction) / 2400 : 2;
      if (interaction && age >= 1) {
        interaction = 0;
        resolveTouch?.();
        resolveTouch = null;
      }
      if (document.hidden || !visible || !loaded) return;
      const pulse = age < 1 ? Math.sin((Math.PI * Math.min(age * 5, 1)) / 2) * Math.pow(1 - age, 2.5) : 0;
      const pixels = Math.min(1200, Math.round(root.clientWidth * Math.min(devicePixelRatio, 2)));
      if (canvas.width !== pixels) {
        canvas.width = canvas.height = pixels;
        gl.viewport(0, 0, pixels, pixels);
      }
      const time = now / 1000,
        still = reduced.matches,
        theta = still ? 0 : canopyAngle(time, pulse);
      for (let i = 0; i < total; i++) {
        const j = i * 4,
          [dx, dy] = still ? [0, 0] : field(mesh[j + 2], mesh[j + 3], time, pulse, weights[i]);
        mesh[j] = mesh[j + 2] + dx;
        mesh[j + 1] = mesh[j + 3] + dy;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // 底层
      gl.useProgram(baseProgram);
      if (seamless) { gl.uniform1f(gl.getUniformLocation(baseProgram,"time"),still ? 0 : time); gl.uniform1f(gl.getUniformLocation(baseProgram,"pulse"),pulse); }
      gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);
      attribs(baseProgram, [["p", 2], ["uv", 2]], 16);
      bindTextures(baseProgram, [["tex", 0], ["mask", 2]]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIndexBuffer);
      gl.drawElements(gl.TRIANGLES, meshIndex.length, gl.UNSIGNED_SHORT, 0);
      // 叶片层
      leaves.forEach((leaf, q) => {
        const gust = gustAt(time, leaf.px);
        writeQuad(q, leaf, still ? 0 : leafAngle(leaf, time, gust, pulse), theta, still ? 1 : leafShade(leaf, time, gust), 1);
      });
      // 落叶：离开树冠后边飘边翻面，接近地面时淡出
      falling = falling.filter((f) => time - f.start < f.life);
      let q = leaves.length;
      for (const f of falling) {
        const t = Math.max(0, time - f.start),
          k = t / f.life;
        const oy = f.fall * (0.55 * k + 0.45 * k * k);
        const ox = f.dir * f.drift * k + f.sway * Math.sin(t * f.w + f.ph);
        const angle = f.dir * (0.5 * k * Math.PI + 0.55 * Math.sin(t * f.w + f.ph + 1.2));
        const turn = Math.cos(t * f.w * 0.7 + f.ph);
        const flip = Math.max(0.2, Math.abs(turn)) * (turn < 0 ? -1 : 1);
        const fade = Math.min(1, t / 0.3) * (1 - Math.max(0, (k - 0.75) / 0.25));
        writeQuad(q++, f.leaf, angle, 0, 0.98 + 0.08 * turn, t > 0 ? fade : 0, ox, oy, flip);
      }
      gl.useProgram(leafProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, leafBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, leafData, gl.DYNAMIC_DRAW);
      attribs(leafProgram, [["p", 2], ["uv", 2], ["id", 1], ["shade", 1], ["fade", 1]], 28);
      bindTextures(leafProgram, [["tex", 0], ["ids", 1], ["mask", 2]]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, leafIndexBuffer);
      const firstLeaf = seamless ? leaves.length : 0;
      gl.drawElements(gl.TRIANGLES, (q-firstLeaf) * 6, gl.UNSIGNED_SHORT, firstLeaf * 12);
      canvas.dataset.frame = String(Math.round(now));
      canvas.dataset.sway = theta.toFixed(4);
    }
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      loaded = false;
      root.classList.remove("mesh-ready");
      interaction = 0;
      resolveTouch?.();
      resolveTouch = null;
    });
    raf = requestAnimationFrame(draw);
    current = {
      root,
      available: () => loaded,
      stats: () => ({ leaves: leaves.length, falling: falling.length }),
      // 从树冠上挑几片大小合适的叶子飘落（大小与树上的叶子一致）
      drop(count, burst = false) {
        if (!loaded || reduced.matches || document.hidden) return;
        const pool = leaves.filter((l) => l.area > 200 && l.py < 0.6);
        const time = performance.now() / 1000;
        for (let i = 0; i < count && pool.length; i++) {
          if (falling.length >= MAX_FALL) falling.shift();
          const leaf = pool[Math.floor(Math.random() * pool.length)];
          falling.push({
            leaf,
            start: time + (burst ? i * 0.06 : 0),
            life: 3.6 + Math.random() * 1.6,
            fall: 0.76 - leaf.py + 0.1,
            dir: Math.random() < 0.5 ? -1 : 1,
            drift: 0.03 + Math.random() * 0.06,
            sway: 0.012 + Math.random() * 0.016,
            w: 2.2 + Math.random() * 1.6,
            ph: Math.random() * Math.PI * 2,
          });
        }
      },
      touch() {
        if (interaction) return Promise.resolve();
        interaction = performance.now();
        this.drop(10, true);
        return new Promise((r) => (resolveTouch = r));
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        obs.disconnect();
        resolveTouch?.();
        canvas.remove();
        root.classList.remove("mesh-ready");
        for (const b of [meshBuffer, meshIndexBuffer, leafBuffer, leafIndexBuffer]) gl.deleteBuffer(b);
        for (const t of textures) gl.deleteTexture(t);
        gl.deleteProgram(baseProgram);
        gl.deleteProgram(leafProgram);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      },
    };
  }

  // 不支持 WebGL 时的落叶：大小按树的显示宽度换算，和树上的叶子差不多大
  function domLeaves(count) {
    const layer = document.querySelector("#treeEffects");
    const img = document.querySelector("#treeInteraction .tree-image");
    if (!layer || !img || !canopy.length) return [];
    const box = layer.parentElement.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    const size = r.width * 0.022;
    return Array.from({ length: count }, (_, i) => {
      const [u, v] = canopyPoint();
      const leaf = document.createElement("i");
      leaf.className = "tree-shed-leaf";
      const side = i % 2 ? -1 : 1;
      leaf.style.left = r.left - box.left + u * r.width + "px";
      leaf.style.top = r.top - box.top + v * r.height + "px";
      leaf.style.width = size * 0.6 + "px";
      leaf.style.height = size + "px";
      layer.append(leaf);
      const dx = side * r.width * (0.05 + (i % 5) * 0.015),
        dy = r.height * (0.22 + (i % 4) * 0.04);
      const a = leaf.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 0 },
          { transform: `translate(${dx * 0.3}px,${dy * 0.1}px) rotate(${side * 60}deg)`, opacity: 0.95, offset: 0.15 },
          { transform: `translate(${dx}px,${dy}px) rotate(${side * 300}deg)`, opacity: 0 },
        ],
        { duration: 2600 + (i % 5) * 160, delay: i * 40, easing: "ease-in" },
      );
      return a.finished.catch(() => {}).finally(() => leaf.remove());
    });
  }
  // 定时飘落一片叶子（场景氛围调用）
  function dropLeaf() {
    mount();
    if (current?.available()) current.drop(1);
  }
  async function touch() {
    mount();
    const root = document.querySelector("#treeInteraction");
    if (!root || reduced.matches) return;
    if (current?.available()) await current.touch();
    else await Promise.allSettled(domLeaves(10));
  }
  // stats 便于验收时确认叶片层与落叶在工作
  return { mount, touch, dropLeaf, field, leafWeight, leafAngle, canopyPoint, stats: () => current?.stats() || null };
})();
if (typeof module !== "undefined") module.exports = GardenMotion;
