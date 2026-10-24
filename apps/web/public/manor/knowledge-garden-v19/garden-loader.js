/* 首次进入的加载画面：先把首屏要用的图预取完，再淡出；已缓存时几乎一闪而过（不到 300 ms 不显示） */
(() => {
  const BASE = "knowledge-garden-v19/";
  const compact = innerWidth <= 700 || (innerWidth <= 1100 && innerHeight > innerWidth) || new URLSearchParams(location.search).get("renderProfile") === "mobile";
  // 按体积给权重，进度条走得均匀
  const ASSETS = [
    compact ? ["courtyard/mobile-garden-r18.webp",601] : ["courtyard/pc-terrain-r36.png",3500],
    compact ? ["courtyard/mobile-garden-r17-water.png",5] : ["courtyard/desktop-water-r49.svg",1],
    ...(compact ? [["courtyard/mobile-bay-r36.png",2824], ["courtyard/mobile-bay-water-r36.svg",1], ["courtyard/area-curtain-r17.webp",285]] : [["courtyard/pc-far-left-r49.png",3500],["courtyard/pc-far-right-r49.png",3500],["courtyard/pc-pool-edge-r49.png",2500],["courtyard/pc-field-r50.png",3611],["courtyard/pc-plaza-r50.png",3211],["courtyard/pc-foreground-r50.png",3198],["courtyard/pc-surface-r50.png",2700],["courtyard/pc-tank-light-r41.png",2600],["courtyard/pc-detail-r36-5.png",2500],["farm/hive-states-r33.png",1316],["farm/purifier-plinth-r36.png",1700]]),
    ["farm/purifier-states-r22.png",1700],
    ["farm/workshop-states-r33.png",1519],
    compact?["farm/hive-states-r18.webp",273]:["farm/hive-built-r33.png",950],
    ["farm/game-ui-r20.png",1630],
    ["farm/plot-canvas-r23.png",3275],
    ["farm/bait-box-r36.png",1200],
    ...(compact?[["farm/mobile-machines-built-r48.png",1000],["farm/mobile-machines-sealed-r48.png",1000]]:[]),
    ["courtyard/frog-jump-r5.png",706],
    ["garden-tools.webp",192],
    ["fish-3d-river-a.webp",267],
    ["fish-3d-river-b.webp",297],
  ];
  const total = ASSETS.reduce((s, [, w]) => s + w, 0);
  const el = document.createElement("div");
  el.className = "garden-loader";
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-label", "正在载入知识庄园");
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.innerHTML = '<div class="garden-loader-card"><div class="garden-loader-sprout" aria-hidden="true"></div><p>正在唤醒庄园…</p><div class="garden-loader-bar"><i></i></div><small>0%</small></div>';
  let done = 0,
    shown = false,
    finished = false;
  const bar = el.querySelector("i"),
    pct = el.querySelector("small");
  const showTimer = setTimeout(() => {
    if (finished) return;
    shown = true;
    document.body.append(el);
  }, 300);
  const tick = () => {
    const p = Math.round((done / total) * 100);
    bar.style.width = p + "%";
    pct.textContent = p + "%";
    el.setAttribute("aria-valuenow", String(p));
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(showTimer);
    if (!shown) return;
    done = total;
    tick();
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 450);
  };
  Promise.all(
    ASSETS.map(
      ([file, w]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            done += w;
            tick();
            resolve();
          };
          img.src = BASE + file;
        }),
    ),
  ).then(finish);
  // 网络再慢也不一直挡着：8 秒后先进入，剩下的边玩边加载
  setTimeout(finish, 8000);
})();
