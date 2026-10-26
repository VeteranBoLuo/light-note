/* 种田场景舞台：按宽度等比铺满，PC 取景避开顶栏；极矮屏保留内容高度，不能缩成带模糊侧栏的画幅。
   背景、动效画布和地块放在 .scene-stage 里（单位是安全区像素，整体缩放）；水仓、码头留在场景层（全景要铺满场景），
   用同一套变换算出像素位置写进 CSS 变量。小动物、鱼的活动范围也从这里取标定坐标。 */
const FarmStage = (() => {
  let scene = null,
    observer = null,
    view = null, area = "garden";
  const profile = () => (document.documentElement.classList.contains("light-note-mobile-rendering") ? "mobile" : "desktop");
  const cal = () => profile()==="mobile" ? (FARM_CAL[area==="bay"?"mobileBay":"mobileGarden"]||FARM_CAL.mobile) : FARM_CAL.desktop;
  const assetUrl = path => typeof GardenStartup!=="undefined"&&GardenStartup.url?GardenStartup.url(path):path;
  const sourceSet = d => (d.assetSources||[]).map(({asset,width})=>`${assetUrl(`knowledge-garden-v19/${asset}`)} ${width}w`).join(', ');
  const bbox = (points) => {
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  // 海水过滤器置于独立干燥石台，储水与鱼舱没有出口连接。
  const purifierSite = d => d.purifierSite || (d.safe[2]<d.safe[3] ? [110,535,210,275] : [2665,332,170,175]);
  // Match measured wooden foot soles to the INNER paving edge, not the stone cap.
  // The same ground line is used for both sprite states; atlas padding never positions the feet.
  function fixturePose(d,key,sealed=false) {
    const site=d.facilities[key],ground=d.facilityGround?.[key];
    if(!ground)return {rect:site,shear:0};
    const [[ax,ay],[bx,by]]=ground.feet[sealed?"sealed":"built"],[[ex,ey],[fx,fy]]=ground.innerEdge;
    const slope=(fy-ey)/(fx-ex),w=(ground.contactX[1]-ground.contactX[0])/(bx-ax),h=w*site[3]/site[2],x=ground.contactX[0]-ax*w;
    const shear=slope-(by-ay)*h/((bx-ax)*w);
    const y=ey+(x+ax*w-ex)*slope-ground.clearance-ay*h-shear*ax*w;
    return {rect:[x,y,w,h],shear};
  }
  function fixtureBounds(d,key) {
    const poses=[false,true].map(sealed=>{
      const {rect:[x,y,w,h],shear}=fixturePose(d,key,sealed);
      const [l,t,r,b]=d.facilityVisuals?.[key]?.[sealed?'sealed':'built']||[0,0,1,1];
      return bbox([[l,t],[r,t],[r,b],[l,b]].map(([u,v])=>[x+u*w,y+v*h+shear*u*w]));
    });
    return [Math.min(...poses.map(p=>p[0])),Math.min(...poses.map(p=>p[1])),Math.max(...poses.map(p=>p[2])),Math.max(...poses.map(p=>p[3]))];
  }
  const toScene = (x, y) => [view.ox + x * view.s, view.oy + y * view.s];
  // 多边形换算成某个盒子内的百分比 clip-path
  const clipIn = (points, [x0, y0, x1, y1]) =>
    `polygon(${points.map(([x, y]) => `${(((x - x0) / (x1 - x0)) * 100).toFixed(2)}% ${(((y - y0) / (y1 - y0)) * 100).toFixed(2)}%`).join(",")})`;
  // Join closed contours with zero-area bridges. Even-odd filling preserves
  // openings under a table as well as disconnected barrels and plant pots.
  function hitClip(contours) {
    if(!contours?.length)return "none";
    const start=contours[0][0],points=[];
    for(const loop of contours)points.push(...loop,loop[0],start);
    return `polygon(evenodd,${points.map(([x,y])=>`${+(x*100).toFixed(3)}% ${+(y*100).toFixed(3)}%`).join(",")})`;
  }

  function birdStops(d) {
    if(d.birdStops)return d.birdStops;
    if(d.area==="bay")return d.birdStops || [[720,528],[850,510],[600,731]];
    if(d.area==="garden")return [[78,748],[866,960],[445,1150],[830,1455],[710,1495],[205,1450],[440,767],[440,1164]];
    const mobile = d.safe[2] < d.safe[3], cols = mobile ? 2 : 4;
    const stops = mobile ? [[82,1780],[1298,1780]] : [];
    for (let row = 0; row < d.plots.length / cols - 1; row++) {
      const upper = d.plots.slice(row * cols, (row + 1) * cols), lower = d.plots.slice((row + 1) * cols, (row + 2) * cols);
      const y = (Math.max(...upper.map(p => p.hitRect[1] + p.hitRect[3])) + Math.min(...lower.map(p => p.hitRect[1]))) / 2;
      if(mobile)stops.push([82,y],[d.safe[2]-62,y]);else for(const col of [0,2])stops.push([upper[col].center[0],y]);
    }
    const bottom = Math.max(...d.plots.map(p => p.hitRect[1] + p.hitRect[3]));
    for (const col of mobile ? [0, 1] : [0, 1, 2, 3]) stops.push([d.plots[d.plots.length - cols + col].center[0], bottom + (mobile ? 70 : 65)]);
    stops.push(d.rabbitLawn.center);
    return stops;
  }
  // 码头：盒子覆盖栈桥和可抛竿的整片水面（castRegion，由海面遮罩算出），鱼竿从栈桥最靠近默认落点的一点伸出去。
  // 盒内坐标横纵同一单位（宽 = 1000，高 = view[1]），鱼竿和浮漂不会被扁长的盒子压扁
  function pierGeometry(d, hasPurifier=false) {
    const p = d.pier,
      w = p.castWater,
      region = p.castRegion?.length > 2 ? p.castRegion : null;
    const pts = [...p.polygon, [w.center[0] - w.rx, w.center[1] - w.ry], [w.center[0] + w.rx, w.center[1] + w.ry], ...(region || [])];
    let [x0, y0, x1, y1] = bbox(pts);
    const padX = (x1 - x0) * 0.08;
    y0 -= (y1 - y0) * 0.35;
    x0 -= padX;
    x1 += padX;
    y1 += (y1 - y0) * 0.05;
    // 鱼竿要往上扬：盒子至少有宽度一半高，不够就往上补（码头层不接收点击，补出的部分不挡东西）
    y0 = Math.min(y0, y1 - (x1 - x0) * 0.5);
    const u = 1000 / (x1 - x0);
    const nx = (x) => (x - x0) * u,
      ny = (y) => (y - y0) * u;
    // 栈桥上离抛竿水面最近的点作为握竿处，往栈桥里收一点
    const c = w.center;
    const near = p.polygon.reduce((a, b) => (Math.hypot(b[0] - c[0], b[1] - c[1]) < Math.hypot(a[0] - c[0], a[1] - c[1]) ? b : a));
    const mid = bbox(p.polygon);
    const origin = p.rodOrigin || [near[0] * 0.75 + ((mid[0] + mid[2]) / 2) * 0.25, near[1] * 0.75 + ((mid[1] + mid[3]) / 2) * 0.25];
    const g = {
      box: [x0, y0, x1, y1],
      view: [1000, (y1 - y0) * u],
      origin: [nx(origin[0]), ny(origin[1])],
      center: [nx(c[0]), ny(c[1])],
      radius: [w.rx * u, w.ry * u],
      obstacles:[...(p.castObstacles || []).map(poly=>poly.map(([x,y])=>[nx(x),ny(y)])),
        ...Object.keys(d.facilities||{}).map(key=>{const [x,y,r,b]=fixtureBounds(d,key);return [[nx(x),ny(y)],[nx(r),ny(y)],[nx(r),ny(b)],[nx(x),ny(b)]];}),
        ...(hasPurifier ? [(()=>{const [x,y,w,h]=purifierSite(d);return [[nx(x-8),ny(y-8)],[nx(x+w+8),ny(y-8)],[nx(x+w+8),ny(y+h+8)],[nx(x-8),ny(y+h+8)]];})()] : [])],
      // 可抛竿水面（盒内单位）与点击区域；没有标定时退回默认落点的椭圆
      region: region ? region.map(([x, y]) => [nx(x), ny(y)]) : null,
      clip: region
        ? clipIn(region, [x0, y0, x1, y1])
        : `ellipse(${((w.rx / (x1 - x0)) * 100).toFixed(2)}% ${((w.ry / (y1 - y0)) * 100).toFixed(2)}% at ${(((c[0] - x0) / (x1 - x0)) * 100).toFixed(2)}% ${(((c[1] - y0) / (y1 - y0)) * 100).toFixed(2)}%)`,
    };
    g.tip = p.rodTip ? [nx(p.rodTip[0]),ny(p.rodTip[1])] : [g.origin[0] + (g.center[0] - g.origin[0]) * 0.55, Math.max(40, Math.min(g.origin[1], g.center[1]) - 200)];
    if(p.rodControl)g.rodControl=[nx(p.rodControl[0]),ny(p.rodControl[1])];
    g.mountScale=p.mountScale||1;
    return g;
  }

  // Complete aquarium rim/base, supported fixtures, pier and crop beds share the visible-stage constraints.
  function keepRects(d, hasPurifier=false, physical=false) {
    const w = d.pier.castWater,
      box = ([x, y, rw, rh]) => [x, y, x + rw, y + rh];
    const devices=Object.keys(d.facilities||{}).map(key=>fixtureBounds(d,key));
    if(hasPurifier&&d.purifierPlinth)devices.push(box(d.purifierPlinth));
    if(d.area==="garden")return [box(d.stall.rect),box(d.areaSign),...d.plots.map(p=>box(p.hitRect)),box([250,1430,430,90]),...devices];
    if(d.area==="bay")return [box(d.aquarium.outerRect),bbox(d.pier.polygon),box(d.pier.baitChest),box(d.areaSign),[w.center[0]-w.rx,w.center[1]-w.ry,w.center[0]+w.rx,w.center[1]+w.ry],...(hasPurifier?[box(purifierSite(d))]:[]),...devices];
    return [box(d.aquarium.outerRect),bbox(d.pier.polygon),box(d.pier.baitChest),...(!physical?[[w.center[0] - w.rx, w.center[1] - w.ry, w.center[0] + w.rx, w.center[1] + w.ry]]:[]), box(d.stall.rect), ...d.plots.map((p) => box(p.hitRect)),...(hasPurifier?[box(purifierSite(d))]:[]),...devices];
  }
  // Physical subjects, rather than decorative water/sky, determine vertical camera limits.
  // Width remains exact even on short ultrawide windows; the page can scroll the extra height.
  function desktopFrame(d, width, height, headers=[]) {
    const s=width/d.safe[2],rects=keepRects(d,true,true);
    const top=Math.min(...rects.map(r=>r[1])),bottom=Math.max(...rects.map(r=>r[3]));
    let lower=8-top*s;
    for(const bar of headers)for(const [x0,y0,x1] of rects) {
      if(x1*s>bar.x0&&x0*s<bar.x1)lower=Math.max(lower,bar.bottom-y0*s);
    }
    const pictureHeight=d.safe[3]*s,wanted=height>=pictureHeight?height-pictureHeight:(height-pictureHeight)/2;
    return {s,ox:0,oy:Math.max(lower,Math.min(wanted,height-bottom*s-8)),minimumHeight:Math.ceil(lower+bottom*s+8)};
  }
  // Only the added sky grows in taller windows. Its join with the original terrain stays fixed.
  function skyBleedPose(d,frame) {
    if(!d.skyBleed)return null;
    const [x,y,w,h]=d.skyBleed.rect,top=Math.min(y,-Math.max(0,frame.oy)/frame.s-2);
    return [x,top,w,h*top/y];
  }
  // Management follows the navigation button rather than the tank's physical stone rim.
  function managementPose(width, height, anchor, {mobile=false, dockTop=height, density=1}={}) {
    const pad=8*density,panelWidth=Math.min((mobile?420:340)*density,Math.max(0,width-pad*2));
    const center=anchor?(anchor.left+anchor.right)/2:width/2;
    const left=mobile?(width-panelWidth)/2:Math.max(pad,Math.min(width-panelWidth-pad,center-panelWidth/2));
    const top=mobile?pad:Math.min(height-pad,Math.max(pad,(anchor?.bottom||pad)+12*density));
    const bottom=mobile?Math.max(pad,height-dockTop+6*density):null;
    return {left,width:panelWidth,top:mobile?null:top,bottom,maxHeight:Math.max(0,Math.min(420*density,height-(mobile?bottom:top)-pad)),arrow:Math.max(18*density,Math.min(panelWidth-18*density,center-left))};
  }
  function positionManagement() {
    if (!scene?.isConnected) return;
    const r=scene.getBoundingClientRect(),button=scene.querySelector('[data-dock="farm"]');
    const b=button?.getBoundingClientRect(),dock=scene.querySelector(":scope > .game-dock")?.getBoundingClientRect();
    const density=Number.parseFloat(getComputedStyle(scene).getPropertyValue("--d"))||1;
    const pose=managementPose(r.width,r.height,b?{left:b.left-r.left,right:b.right-r.left,bottom:b.bottom-r.top}:null,{mobile:profile()==="mobile",dockTop:dock?dock.top-r.top:r.height,density});
    for(const [key,value] of Object.entries(pose))scene.style.setProperty(`--production-${key.replace(/[A-Z]/g,c=>"-"+c.toLowerCase())}`,value===null?"auto":value+"px");
  }
  // 顶栏、底栏在场景里的范围（场景像素），各留一点空隙
  function chromeOf(r) {
    const rel = (el, pad) => {
      const b = el?.getBoundingClientRect();
      return b?.height ? { x0: b.left - r.left, x1: b.right - r.left, top: b.top - r.top - pad, bottom: b.bottom - r.top + pad } : null;
    };
    return { hud: rel(scene.querySelector("#gameHud"), 4), headers:[...scene.querySelectorAll("#gameHud > *")].map(el=>rel(el,4)).filter(Boolean), dock: rel(scene.querySelector(":scope > .game-dock"), 6) };
  }
  // 当前缩放下，要避开顶栏 / 底栏的那几块的上下沿（只看和该栏横向有重叠的块）；安全区坐标
  function keepSpan(rects, chrome, s, ox) {
    const across = (bar, [x0, , x1]) => !bar || (ox + x1 * s > bar.x0 && ox + x0 * s < bar.x1);
    const top = rects.filter((k) => across(chrome.hud, k)).map((k) => k[1]),
      bottom = rects.filter((k) => across(chrome.dock, k)).map((k) => k[3]);
    return [top.length ? Math.min(...top) : null, bottom.length ? Math.max(...bottom) : null];
  }

  function layout() {
    if (!scene || !scene.isConnected) return;
    const d = cal(),
      [sx, sy, sw, sh] = d.safe;
    const r = scene.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 手机保留原有上下避让；PC 由 desktopFrame 保持横向铺满与实物边界。
    const purifier=scene.querySelector("#purifierSpot"),hasPurifier=!!purifier&&!purifier.hidden;
    const rects = keepRects(d,hasPurifier),
      chrome = chromeOf(r);
    const ct = chrome.hud ? chrome.hud.bottom : 0,
      cb = chrome.dock ? chrome.dock.top : r.height;
    // 双场景手机优先铺满宽度，允许裁去装饰性的天空 / 前景；必须可见区域仍由 keepRects 约束。
    const desktop=!d.area?desktopFrame(d,r.width,r.height,chrome.headers):null;
    scene.style.setProperty("--farm-min-height",desktop?desktop.minimumHeight+"px":"0px");
    let s = r.width / sw;
    for (let pass = 0; d.area&&pass < 2; pass++) {
      const [kt, kb] = keepSpan(rects, chrome, s, (r.width - sw * s) / 2);
      if (kt !== null && kb !== null && (kb - kt) * s > cb - ct) s = (cb - ct) / (kb - kt);
    }
    const [kt, kb] = keepSpan(rects, chrome, s, (r.width - sw * s) / 2);
    let oy = (r.height - sh * s) / 2;
    if (kb !== null && oy + kb * s > cb) oy = cb - kb * s;
    else if (kt !== null && oy + kt * s < ct) oy = ct - kt * s;
    // 手机底图较矮时优先让前景接到底部；PC 的富余高度放在天空。
    const imgBottom = oy + (d.image[1] - sy) * s;
    if (imgBottom < r.height) oy += Math.max(0, Math.min(r.height - imgBottom, kb === null ? Infinity : cb - (oy + kb * s)));
    if(desktop)oy=desktop.oy;
    view = { s, ox: desktop?0:(r.width - sw * s) / 2, oy, profile: profile(), d, W: r.width, H: r.height };
    const stage = scene.querySelector(".scene-stage");
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    stage.style.transform = `translate(${view.ox}px, ${view.oy}px) scale(${s})`;
    const sky=stage.querySelector(".scene-sky-bleed"),skyRect=skyBleedPose(d,view);
    if(sky&&skyRect){sky.style.top=skyRect[1]+"px";sky.style.height=skyRect[3]+"px";}
    const st = scene.style;
    st.setProperty("--stage-s", s);
    st.setProperty("--bg-l", -sx + "px");
    st.setProperty("--bg-t", -sy + "px");
    st.setProperty("--bg-w", d.image[0] + "px");
    st.setProperty("--bg-h", d.image[1] + "px");
    // 手机分区保留原有出血背景；PC 不使用这层补边。
    // 变量里的相对地址会按样式表位置解析，这里写成绝对地址
    // Only mobile uses this bleed. A desktop CSS background would fetch the
    // full plate again even when the responsive <img> selected a smaller one.
    if(d.area)st.setProperty("--farm-fill", `url("${new URL(assetUrl(`knowledge-garden-v19/${d.asset}`), document.baseURI).href}")`);
    else st.removeProperty("--farm-fill");
    // 水仓：玻璃与水面合起来的外框；只有玻璃里能点、能看到鱼
    const a = d.aquarium,
      outline = [...a.glassPolygon, ...a.waterSurface],
      tb = bbox(outline);
    const [tx, ty] = toScene(tb[0], tb[1]);
    st.setProperty("--tank-x", tx + "px");
    st.setProperty("--tank-y", ty + "px");
    st.setProperty("--tank-w", (tb[2] - tb[0]) * s + "px");
    st.setProperty("--tank-h", (tb[3] - tb[1]) * s + "px");
    st.setProperty("--tank-clip", clipIn(a.glassPolygon, tb));
    view.tankBox = tb;
    // 码头
    const [fx,fy,fw,fh]=purifierSite(d),[fixtureX,fixtureY]=toScene(fx,fy);
    st.setProperty("--purifier-x",fixtureX+"px");st.setProperty("--purifier-y",fixtureY+"px");
    st.setProperty("--purifier-w",fw*s+"px");st.setProperty("--purifier-h",fh*s+"px");
    if(d.purifierPlinth){
      const [x,y,w,h]=d.purifierPlinth;
      st.setProperty("--plinth-x",(x-fx)*s+"px");st.setProperty("--plinth-y",(y-fy)*s+"px");
      st.setProperty("--plinth-w",w*s+"px");st.setProperty("--plinth-h",h*s+"px");
    }
    purifier?.classList.toggle("label-side",fixtureY<ct+32);
    const g = pierGeometry(d,hasPurifier);
    const [px, py] = toScene(g.box[0], g.box[1]);
    // 竿梢不伸进顶栏下面：手机菜地贴底栏时整幅画面上移，码头离顶栏很近，竿子改为斜着往外伸（至少仍上扬一点）
    const unitPx = ((g.box[2] - g.box[0]) * s) / 1000,
      minTip = (ct + 8 - py) / unitPx;
    g.tip[1] = Math.max(g.tip[1], Math.min(minTip, Math.min(g.origin[1], g.center[1]) - 60));
    st.setProperty("--pier-x", px + "px");
    st.setProperty("--pier-y", py + "px");
    st.setProperty("--pier-w", (g.box[2] - g.box[0]) * s + "px");
    st.setProperty("--pier-h", (g.box[3] - g.box[1]) * s + "px");
    st.setProperty("--pier-clip", g.clip);
    st.setProperty("--rod-origin", `${g.origin[0]}px ${g.origin[1]}px`);
    scene.querySelector("#pondSpot .pond-art")?.setAttribute("viewBox", `0 0 ${g.view[0]} ${g.view[1].toFixed(1)}`);
    view.pier = g;
    if (typeof GardenCourtyard !== "undefined") GardenCourtyard.refreshAim();
    // 引导气泡指向第 1 块地
    const p0 = d.plots[0];
    const [gx, gy] = toScene(p0.center[0], p0.soil[0][1]);
    st.setProperty("--guide-x", gx + "px");
    st.setProperty("--guide-y", gy - 8 + "px");
    if (typeof FarmUI !== "undefined") FarmUI.relayout();
    if (typeof FarmFacilities !== "undefined") FarmFacilities.sync();
    positionManagement();
  }
  function mount(sceneEl) {
    if (scene === sceneEl) return layout();
    observer?.disconnect();
    scene = sceneEl;
    if (!scene) return;
    observer = new ResizeObserver(() => layout());
    observer.observe(scene);
    // 顶栏、底栏高度随内容和密度变化，也要重排
    scene.querySelectorAll("#gameHud, .game-dock").forEach((el) => observer.observe(el));
    layout();
  }
  // 小动物与鱼用到的标定（场景像素）；未挂载时返回 null，调用方退回原来的几何
  function habitat() {
    if (!view || !scene?.isConnected) return null;
    const d = view.d,
      s = view.s;
    const lawn = d.rabbitLawn,
      [lx, ly] = toScene(...lawn.center);
    const [fx, fy] = toScene(...d.pier.frogRest),
      [wx, wy] = toScene(...d.pier.frogSplash);
    const [sw, sh] = d.safe.slice(2);
    const tb = view.tankBox;
    // 活动轮廓排除石质舱沿；运动层另扣完整鱼身半径，避免底栖生物落到白色边框上。
    const swim = (d.aquarium.swimPolygon || d.aquarium.glassPolygon).map(([x, y]) => [(x - tb[0]) / (tb[2] - tb[0]), (y - tb[1]) / (tb[3] - tb[1])]);
    return {
      birds: birdStops(d).map(p => { const [x, y] = toScene(...p); return { x, y }; }),
      birdRoutes:d.birdRoutes?.map(route=>route.map(p=>{const [x,y]=toScene(...p);return {x,y};})),
      lawn: { cx: lx, cy: ly, rx: lawn.rx * s, ry: lawn.ry * s, poly:lawn.poly?.map(p=>toScene(...p)) },
      pickups: d.poop ? [{x:toScene(...d.poop)[0],y:toScene(...d.poop)[1],rx:50*s,ry:38*s}] : [],
      frog: { home: { x: fx, y: fy }, perches:(d.pier.frogPerches||[d.pier.frogRest]).map(p=>{const [x,y]=toScene(...p);return {x,y};}), water: { x: wx, y: wy }, face: wx > fx ? 1 : -1 },
      air: { cx: view.ox + sw * s * 0.45, cy: view.oy + sh * s * 0.42, rx: sw * s * 0.34, ry: sh * s * 0.22 },
      swim,
    };
  }
  const pier = () => view?.pier || null;
  const scale = () => view?.s || 1;
  return { sourceSet, birdStops, purifierSite, fixturePose, fixtureBounds, hitClip, pierGeometry, desktopFrame, skyBleedPose, managementPose, positionManagement, mount, layout, habitat, pier, scale, setArea:next=>{area=next==="bay"?"bay":"garden";}, toScene: (x, y) => (view ? toScene(x, y) : [x, y]), cal, profile };
})();
if (typeof module !== "undefined") module.exports = FarmStage;
