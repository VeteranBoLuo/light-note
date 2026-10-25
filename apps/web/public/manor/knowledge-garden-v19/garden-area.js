/* 路牌导航：预解码后合拢树叶帷幕，露出目的地木牌，再展开新区域。 */
const GardenArea = (() => {
  const prepared = new Map();
  const curtain = "courtyard/area-curtain-r17.webp";
  let active = null;
  function imageReady(path) {
    if (prepared.has(path)) return prepared.get(path);
    const promise = new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = image.onerror = null;
        if (!ok) prepared.delete(path);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 5000);
      image.onload = () => {
        if (image.decode) image.decode().then(() => finish(true), () => finish(false));
        else finish(true);
      };
      image.onerror = () => finish(false);
      image.src = `knowledge-garden-v19/${path}`;
    });
    prepared.set(path, promise);
    return promise;
  }
  async function prepare(cal) {
    return (await Promise.all([cal.asset, cal.water, cal.smooth, curtain].filter(Boolean).map(imageReady))).every(Boolean);
  }
  function unlock(trip) {
    trip.cover?.remove();
    if (trip.scene) {
      trip.scene.inert = false;
      trip.scene.removeAttribute("aria-busy");
      trip.scene.classList.remove("area-changing");
    }
  }
  function cancel() {
    if (!active) return;
    const trip = active;
    active = null;
    trip.animations?.forEach(animation=>animation.cancel());
    unlock(trip);
  }
  function createCurtain(trip, cal) {
    trip.cover=document.createElement("div");
    trip.cover.className="manor-area-veil";
    trip.cover.setAttribute("aria-hidden","true");
    trip.panels=["left","right"].map(side=>{
      const panel=document.createElement("div");panel.className=`area-canopy ${side}`;
      trip.cover.append(panel);return panel;
    });
    const title=document.createElement("div");title.className="area-route-name";
    // 目的地是内部两项枚举；保留小木牌和已有道具插画，文字不会盖到 HUD。
    const bay=cal.area==="bay";
    title.innerHTML=`<img src="knowledge-garden-v19/incoming/farm-r2/sprites/${bay?"tool-rod":"icon-sprout"}.webp" alt="" draggable="false"><b>${bay?"海湾":"菜园"}</b>`;
    trip.cover.append(title);
  }
  async function animateCurtain(trip, closing) {
    trip.cover.classList.toggle("is-closing",closing);
    trip.animations=trip.panels.map((panel,i)=>{
      const closed="translateX(0%)",open=`translateX(${i?102:-102}%)`;
      const from=closing?open:closed,to=closing?closed:open;
      panel.style.transform=to;
      return panel.animate?.([{transform:from},{transform:to}],{duration:closing?340:400,easing:"cubic-bezier(.4,0,.2,1)"});
    }).filter(Boolean);
    await Promise.all(trip.animations.map(animation=>animation.finished.catch(()=>{})));
  }
  async function travel(cal, {valid, commit, failed, reduced = false, focus}) {
    if (active) return false;
    const trip = {scene:document.querySelector(".garden-scene"),cover:null,animations:[]};
    if (!trip.scene) return false;
    active = trip;
    const current = () => active === trip && valid();
    const lock = () => {
      trip.scene.inert = true;
      trip.scene.setAttribute("aria-busy", "true");
      trip.scene.classList.add("area-changing");
    };
    lock();
    try {
      const ready = await prepare(cal);
      if (!current()) return false;
      if (!ready) { failed(); return false; }
      if (!reduced) {
        createCurtain(trip,cal);
        trip.scene.append(trip.cover);
        await animateCurtain(trip,true);
        if (!current()) return false;
      }
      unlock(trip);
      commit();
      trip.scene = document.querySelector(".garden-scene");
      if (!current() || !trip.scene) return false;
      lock();
      if (trip.cover) {
        trip.scene.append(trip.cover);
        // 两帧让新的水面和活动层完成布局；顶栏、底栏始终保持可见。
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!current()) return false;
        await animateCurtain(trip,false);
      }
      if (!current()) return false;
      unlock(trip);
      if (focus) trip.scene.querySelector(focus)?.focus({preventScroll:true});
      return true;
    } finally {
      if (active === trip) { active = null; unlock(trip); }
    }
  }
  return {prepare, travel, cancel};
})();
if (typeof module !== "undefined") module.exports = GardenArea;
