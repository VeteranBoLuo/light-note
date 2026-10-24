/* 场景坐标的唯一几何规则。纯函数供动画与边界测试共用。 */
const GardenHabitat = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = p => p * p * p * (p * (p * 6 - 15) + 10);
  // 种田舞台挂载后，草地、青蛙落点、蜻蜓范围和鱼的活动区都以标定为准
  const staged = () => (typeof FarmStage !== "undefined" ? FarmStage.habitat() : null);
  function lawn(mobile, w, h, pad = 0) {
    const st = staged();
    if (st) return { cx: st.lawn.cx, cy: st.lawn.cy, rx: Math.max(3, st.lawn.rx - pad * 0.4), ry: Math.max(3, st.lawn.ry - pad * 0.12) };
    // 椭圆草坪左半边是苗床，兔子和麻雀只在右半边的草地上活动，不穿过作物
    const [x,y,rx,ry] = mobile ? [.595,.466,.05,.016] : [.545,.665,.052,.05];
    return { cx: x*w, cy: y*h, rx: Math.max(3, rx*w-pad), ry: Math.max(3, ry*h-pad*.18) };
  }
  function air(mobile,w,h) {
    const st = staged();
    if (st) return st.air;
    return mobile ? {cx:.50*w,cy:.43*h,rx:.36*w,ry:.18*h} : {cx:.50*w,cy:.52*h,rx:.34*w,ry:.23*h};
  }
  function birdStops(mobile, w, h) {
    const st = staged();
    if (st?.birds) return st.birds;
    return (mobile ? [[.25,.55],[.7,.58],[.3,.75],[.7,.8]] : [[.22,.58],[.4,.6],[.33,.75],[.65,.8]]).map(([x,y]) => ({x:x*w,y:y*h}));
  }
  // Each bird owns a small loop. Flights reserve their destination before leaving,
  // so staggered departures cannot choose the same unoccupied perch.
  function birdRoute(mobile,w,h,id,count) {
    const routes=staged()?.birdRoutes;
    if(routes?.length)return routes[id%routes.length];
    const stops=birdStops(mobile,w,h).slice().sort((a,b)=>a.x-b.x||a.y-b.y);
    return stops.filter((_,i)=>i%count===id);
  }
  function birdFlight(f,p) {
    const t=smooth(p),bend=Math.sin(Math.PI*t);
    return {x:f.fx+(f.tx-f.fx)*t+f.bendX*bend,y:f.fy+(f.ty-f.fy)*t+f.bendY*bend};
  }
  function frogShore(mobile,w,h) {
    const st = staged();
    if (st) return st.frog;
    // 脚下锚定栈桥外沿，落水点位于垂钓区内；两套背景分别标定。
    const [x,y,wx,wy] = mobile ? [.895,.355,.855,.285] : [.067,.765,.09,.87];
    return {home:{x:x*w,y:y*h},water:{x:wx*w,y:wy*h},face:wx>x?1:-1};
  }
  const inLawn = (p,r) => ((p.x-r.cx)/r.rx)**2 + ((p.y-r.cy)/r.ry)**2 <= 1 + 1e-9;
  function onLawn(p,r) {
    const k = Math.max(1, Math.hypot((p.x-r.cx)/r.rx, (p.y-r.cy)/r.ry));
    return {x:r.cx+(p.x-r.cx)/k,y:r.cy+(p.y-r.cy)/k};
  }
  function rabbitHop(p) {
    const flight = clamp((p-.22)/.56,0,1);
    return { frame: p<.2 ? 2 : p<.34 ? 3 : p<.65 ? 4 : p<.87 ? 5 : 2,
      lift: Math.sin(Math.PI*flight)*.31, travel: smooth(flight) };
  }
  function water(mobile) {
    const st = staged();
    if (st) return st.swim;
    // 位于真实玻璃内，避开顶部水面、斜底石岸与两侧装饰。
    return mobile ? [[.04,.18],[.96,.18],[.96,.77],[.76,.90],[.5,.94],[.24,.90],[.04,.77]]
      : [[.025,.15],[.97,.15],[.97,.85],[.65,.94],[.30,.82],[.025,.59]];
  }
  function planes(poly, rx=0, ry=0) {
    return poly.map((p,i) => {
      const q=poly[(i+1)%poly.length], nx=q[1]-p[1], ny=p[0]-q[0];
      return {nx,ny,c:nx*p[0]+ny*p[1]-Math.abs(nx)*rx-Math.abs(ny)*ry};
    });
  }
  function inside(p,poly,rx=0,ry=0) { return planes(poly,rx,ry).every(e => e.nx*p.x+e.ny*p.y <= e.c+1e-8); }
  function project(p,edges) {
    const v={...p};
    for(let i=0;i<30;i++) {
      let moved=false;
      for(const e of edges) {
        const d=e.nx*v.x+e.ny*v.y-e.c;
        if(d>1e-10) { const k=d/(e.nx*e.nx+e.ny*e.ny);v.x-=e.nx*k;v.y-=e.ny*k;moved=true; }
      }
      if(!moved) break;
    }
    return v;
  }
  // 在保证完整鱼身留在玻璃内的前提下优先横向巡游，避免斜底把所有鱼挤进右侧深水区。
  // 多边形是否为凸：标定的鱼活动区可能是凹的（水面线中间下垂），凸多边形的半平面算法会把范围算得很窄
  function convex(poly) {
    let sign=0;
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length],c=poly[(i+2)%poly.length];
      const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(Math.abs(cross)<1e-12) continue;
      if(!sign) sign=Math.sign(cross); else if(Math.sign(cross)!==sign) return false;
    }
    return true;
  }
  // 只在实际越界时做局部校正，不把摆动中的身体不断投到另一块最大内接矩形。
  function bodyInterval(poly,y,rx,ry,preferredX) {
    const levels=[y-ry,y+ry];
    for(const p of poly) if(p[1]>y-ry&&p[1]<y+ry) levels.push(p[1]-1e-8,p[1]+1e-8);
    let intervals=[{left:-Infinity,right:Infinity}];
    for(const level of levels) {
      const xs=[];
      for(let i=0;i<poly.length;i++) {
        const a=poly[i],b=poly[(i+1)%poly.length];
        if((a[1]<=level&&b[1]>level)||(b[1]<=level&&a[1]>level)) xs.push(a[0]+(level-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      xs.sort((a,b)=>a-b);
      // 鱼舱前沿是下垂的弧线，浅水水平线会穿过左右两段玻璃。
      // 保留各段交集，不能把四个交点误判为越界后将整条鱼挤到更深处。
      if(xs.length<2||xs.length%2)return null;
      const next=[];
      for(let i=0;i<xs.length;i+=2)for(const span of intervals) {
        const left=Math.max(span.left,xs[i]+rx),right=Math.min(span.right,xs[i+1]-rx);
        if(left<=right)next.push({left,right});
      }
      intervals=next;
      if(!intervals.length)return null;
    }
    return intervals.sort((a,b)=>Number.isFinite(preferredX)
      ? Math.abs(clamp(preferredX,a.left,a.right)-preferredX)-Math.abs(clamp(preferredX,b.left,b.right)-preferredX)
      : (b.right-b.left)-(a.right-a.left))[0];
  }
  // 水域是弯曲的带状空间，不能用单个内接矩形代表。按鱼身余量求每个 x
  // 的上下边界，导航深度沿这条水柱映射；左侧浅水和右侧深水都能巡游。
  function swimField(poly,rx,ry) {
    const rotated=poly.map(([x,y])=>[y,x]);
    const lo=Math.min(...poly.map(p=>p[0]))+rx+1e-6;
    const hi=Math.max(...poly.map(p=>p[0]))-rx-1e-6;
    if(hi<=lo)return null;
    let run=[],best=[],previous=null;
    for(let i=0;i<=256;i++) {
      const x=lo+(hi-lo)*i/256,span=bodyInterval(rotated,x,ry+1e-6,rx+1e-6);
      // 玻璃侧壁接近垂直的收尖部分没有巡游深度；不能让贴底生物沿侧壁爬升。
      const gentle=span&&(!previous||Math.max(Math.abs(span.left-previous.left),Math.abs(span.right-previous.right))/(x-previous.x)<4);
      if(span&&span.right-span.left>=.012&&gentle) run.push({x,top:span.left,bottom:span.right});
      else { if(run.length>best.length)best=run;run=[]; }
      previous=span?{...span,x}:null;
    }
    if(run.length>best.length)best=run;
    if(best.length<2)return null;
    return {minX:best[0].x,maxX:best.at(-1).x,minY:0,maxY:1,rotated,rx:rx+1e-6,ry:ry+1e-6};
  }
  function fieldPoint(field,x,depth) {
    x=clamp(x,field.minX,field.maxX);
    const span=bodyInterval(field.rotated,x,field.ry,field.rx);
    const top=span.left,bottom=span.right;
    // 入住/收回动画允许越出水面，正常游动由调用方限制导航深度。
    return {x,y:top+(bottom-top)*depth};
  }
  function fitBody(p,poly,rx,ry) {
    if(convex(poly)) return project(p,planes(poly,rx,ry));
    rx+=1e-7;ry+=1e-7;
    const interval=bodyInterval(poly,p.y,rx,ry,p.x);
    if(interval) return {x:clamp(p.x,interval.left,interval.right),y:p.y};
    let best=null,distance=Infinity;
    for(let i=0;i<=192;i++) {
      const y=i/192,span=bodyInterval(poly,y,rx,ry,p.x);
      if(!span)continue;
      const x=clamp(p.x,span.left,span.right),d=(x-p.x)**2+(y-p.y)**2;
      if(d<distance){distance=d;best={x,y};}
    }
    return best || p;
  }
  // 轴向统一单位：高度随像素宽度计算，窄屏不把鱼拉长。
  const bodyPoint=(x,y,px,py,k,w,h,vw=2550)=>[(x+px*k)/vw,(y-100)/850+py*k*w/(vw*h)];
  return { smooth,lawn,air,birdStops,birdRoute,birdFlight,frogShore,inLawn,onLawn,rabbitHop,water,planes,inside,project,swimField,fieldPoint,fitBody,bodyPoint };
})();
if(typeof module!=="undefined") module.exports=GardenHabitat;
