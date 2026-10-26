/* 轻量环境叠层：海鸥掠过远海，舱内小气泡与缓慢悬浮的微粒。
   所有动效只绘制透明光影/生物，石头、玻璃和背景几何不参与形变。
   隐藏页面、弹框、减少动态时停止绘制。 */
const GardenLife = (() => {
  let current = null;
  function edgeAlpha(x,y,poly,feather) {
    let inside=false,distance=Infinity;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const [ax,ay]=poly[j],[bx,by]=poly[i],dx=bx-ax,dy=by-ay;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
      distance=Math.min(distance,Math.hypot(x-ax-t*dx,y-ay-t*dy));
    }
    const t=inside?Math.min(1,distance/feather):0;return t*t*(3-2*t);
  }
  function bubbleAt(i, time, width, height) {
    const period = 7 + i % 5, p = (time / period + i * .173) % 1;
    const side = i % 2 ? .85 : .15;
    return {x: width * (side + .065 * Math.sin(i * 2.1 + time * .6)), y: height * (.98 - p * .88), r: Math.max(1.1, Math.min(3, width * .0025)) * (.65 + i % 3 * .2), alpha: Math.sin(p * Math.PI) * .48};
  }
  function moteAt(i,time,width,height) {
    const phase=i*2.399963, drift=time*(.004+i%3*.001);
    return {x:width*(.08+((i*.618034+drift)%1)*.84),
      y:height*(.24+((i*.381966)%1)*.62+.018*Math.sin(time*.27+phase)),
      r:Math.max(.55,Math.min(1.2,width*.0012))*(.65+i%3*.18),
      alpha:.10+.12*(.5+.5*Math.sin(time*.37+phase))};
  }
  function mount(scene) {
    if (current?.scene === scene) return;
    current?.destroy(); current = null;
    if (!scene) return;
    const tank = scene.querySelector('#tankSpot');
    if (!tank) return;
    const canvas = document.createElement('canvas'), birds = document.createElement('canvas');
    canvas.className = 'aquarium-life'; birds.className = 'seabird-life';
    for (const el of [canvas, birds]) { el.setAttribute('aria-hidden', 'true'); el.style.pointerEvents = 'none'; }
    tank.prepend(canvas); scene.prepend(birds);
    const ctx = canvas.getContext('2d'), sky = birds.getContext('2d');
    if (!ctx || !sky) { canvas.remove(); birds.remove(); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const birdPhases=Array.from({length:3},()=>Math.random());
    let raf = 0, last = 0, age = 0, w = 0, h = 0, sw = 0, sh = 0, dpr = 1, waterPoly=[];
    const measure = () => {
      w = tank.clientWidth; h = tank.clientHeight; sw = scene.clientWidth; sh = scene.clientHeight;
      dpr = Math.min(2, devicePixelRatio || 1);
      for (const [el, cw, ch] of [[canvas,w,h],[birds,sw,sh]]) {
        el.width = Math.max(1, Math.round(cw * dpr)); el.height = Math.max(1, Math.round(ch * dpr));
      }
      waterPoly=GardenHabitat.water(document.documentElement.classList.contains('light-note-mobile-rendering')).map(([x,y])=>[x*w,y*h]);
    };
    const ro = new ResizeObserver(measure); ro.observe(tank); ro.observe(scene); measure();
    function drawWater(t) {
      ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
      if (!w || !h) return;
      // Soft suspended points drift with the water; no moving spotlight layer.
      for(let i=0;i<36;i++) {
        const p=moteAt(i,t,w,h),alpha=p.alpha*edgeAlpha(p.x,p.y,waterPoly,Math.max(5,w*.018));
        if(!alpha)continue;
        ctx.fillStyle=`rgba(225,251,241,${alpha})`;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      }
      for (let i=0;i<16;i++) {
        const b=bubbleAt(i,t,w,h),alpha=b.alpha*edgeAlpha(b.x,b.y,waterPoly,Math.max(5,w*.018));
        if(!alpha)continue;
        ctx.strokeStyle=`rgba(223,255,251,${alpha})`;ctx.lineWidth=.9;
        ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=`rgba(255,255,242,${alpha*.65})`;ctx.beginPath();ctx.arc(b.x-b.r*.3,b.y-b.r*.35,b.r*.22,0,Math.PI*2);ctx.fill();
      }
      canvas.dataset.frame = String(Math.round(t*1000));
      canvas.dataset.mode = 'garden';
    }
    function drawBirds(t) {
      sky.setTransform(dpr,0,0,dpr,0,0); sky.clearRect(0,0,sw,sh);
      const cal=FarmStage.cal();
      for(let i=0;i<3;i++) {
        const progress=(t/(32+i*11)+birdPhases[i])%1;
        const [x,y]=FarmStage.toScene(cal.safe[2]*(1.15-progress*1.3),150+i*42+Math.sin(t*.28+i)*22);
        const size=Math.max(4,Math.min(12,sw*.006))*(1-i*.14), flap=Math.sin(t*4.2+i)*size*.55;
        sky.strokeStyle='rgba(255,255,240,.9)';sky.lineWidth=Math.max(1.2,size*.17);sky.lineCap='round';
        sky.beginPath();sky.moveTo(x-size,y-flap);sky.quadraticCurveTo(x-size*.4,y-size*.35,x,y);sky.quadraticCurveTo(x+size*.4,y-size*.35,x+size,y-flap);sky.stroke();
      }
      birds.dataset.frame = String(Math.round(t*1000));
    }
    function frame(now) {
      raf=requestAnimationFrame(frame);
      const dt=last ? Math.min(.06,(now-last)/1000) : 0;
      if(now-last<33) return;
      last=now;
      const hidden=reduced.matches;
      canvas.hidden=hidden;birds.hidden=hidden||FarmStage.profile()==='mobile';
      if(hidden || document.hidden || !document.querySelector('#modal')?.hidden) return;
      age+=dt;drawWater(age);if(!birds.hidden)drawBirds(age);
    }
    raf=requestAnimationFrame(frame);
    current={scene,destroy(){cancelAnimationFrame(raf);ro.disconnect();canvas.remove();birds.remove();}};
  }
  return {mount,bubbleAt,moteAt,edgeAlpha};
})();
if(typeof module!=='undefined')module.exports=GardenLife;
