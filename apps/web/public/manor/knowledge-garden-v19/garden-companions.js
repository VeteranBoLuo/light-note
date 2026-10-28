/* 场景小伙伴：动作只影响眼前互动，不产生资源、任务或额外成长货币。 */
const GardenCompanions = (() => {
  let current=null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const images=new Map();
  function sprite(key) {
    if(!images.has(key)){const im=new Image();im.src=`knowledge-garden-v19/courtyard/wildlife-${key}.webp`;images.set(key,im);}
    return images.get(key);
  }
  function advance(a,dt) {
    a.age+=dt;
    a.reactionLeft=Math.max(0,(a.reactionLeft||0)-dt);
    if(a.route) {
      a.route.p=Math.min(1,a.route.p+dt/a.route.duration);
      const t=GardenHabitat.smooth(a.route.p),r=a.route;
      a.x=r.from.x+(r.to.x-r.from.x)*t;
      a.y=r.from.y+(r.to.y-r.from.y)*t-Math.sin(t*Math.PI)*r.lift;
      if(Math.abs(r.to.x-r.from.x)>.01)a.face=r.to.x>=r.from.x?1:-1;
      if(r.p>=1){a.route=null;a.mode='perch';a.age=0;}
    }
    return a;
  }
  function travel(a,to,lift,duration) {
    a.route={from:{x:a.x,y:a.y},to,p:0,lift,duration};a.age=0;a.mode='move';
  }
  function nextPerch(a) {
    if(a.perches?.length>1){
      let next=a.perchIndex+(a.perchDirection||1);
      if(next<0||next>=a.perches.length){a.perchDirection=-(a.perchDirection||1);next=a.perchIndex+a.perchDirection;}
      a.perchIndex=next;return a.perches[next];
    }
    return a.alt&&Math.hypot(a.x-a.home.x,a.y-a.home.y)<1?a.alt:a.home;
  }
  function startAtPerch(a,rng=Math.random) {
    if(!a.perches?.length)return a;
    a.perchIndex=Math.min(a.perches.length-1,Math.floor(rng()*a.perches.length));
    a.perchDirection=a.perchIndex===0?1:a.perchIndex===a.perches.length-1?-1:rng()<.5?-1:1;
    Object.assign(a,a.perches[a.perchIndex]);
    a.face=a.perchDirection;a.age=rng()*9;a.wait=12+rng()*8;
    a.route=null;a.mode='idle';a.reactionLeft=0;
    return a;
  }
  function react(a,L,rng=Math.random) {
    if(a.reactionLeft>0)return false;
    const actions=['flight','flutter'];
    const action=GardenAnimalPose.choose(actions,a.lastAction,rng);a.lastAction=action;a.age=0;
    {
      const to=action==='flutter'?{x:a.x,y:a.y}:nextPerch(a);
      const lift=a.kind==='butterfly'?L*(action==='flutter'?.16:.25):action==='flutter'?L*.5:L;
      travel(a,to,lift,a.kind==='butterfly'?(action==='flutter'?4.8:6.4):3.2);a.reactionLeft=a.route.duration+.6;
    }
    return true;
  }
  function visitorStops(mobile,area,calibration) {
    if(calibration?.visitorStops)return calibration.visitorStops;
    if(mobile&&area==="garden")return [[[65,767],[58,1160]],[[830,930],[820,1450]]];
    if(mobile&&area==="bay")return [[[290,600],[330,770]],[[838,746],[825,1478]]];
    return mobile
      ? [[[90,1420],[78,2140]],[[1280,1850],[1300,2350]]]
      : [[[1570,950],[1620,1080]],[[2680,1090],[2530,1130]]];
  }
  function mount(scene) {
    unmount();if(!scene)return;
    const canvas=document.createElement('canvas');canvas.className='companion-layer';canvas.setAttribute('aria-hidden','true');scene.prepend(canvas);
    const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
    const names={butterfly:'凤蝶',ladybird:'瓢虫',dragonfly:'蜻蜓'};
    const visitors=['butterfly','ladybird'].map(kind=>({kind,x:0,y:0,face:1,mode:'idle',age:0,route:null,home:null}));
    const buttons=new Map();let W=0,H=0,L=30,dpr=1,layout='',camera=null,raf=0,last=0,clock=0,lastMeasure=0;
    for(const kind of [...visitors.map(a=>a.kind),'dragonfly']) {
      const button=document.createElement('button');button.className='wildlife-hit';button.type='button';button.dataset.companion=kind;
      button.setAttribute('aria-label',`和${names[kind]}互动`);
      button.addEventListener('click',e=>{e.stopPropagation();if(kind==='dragonfly')GardenCritters.poke('fly');else react(visitors.find(a=>a.kind===kind),L);});
      scene.append(button);buttons.set(kind,button);
    }
    for(const key of ['butterflyopen','butterflyperch','ladybird'])sprite(key);
    function measure() {
      const r=scene.getBoundingClientRect(),mobile=document.documentElement.classList.contains('light-note-mobile-rendering');
      W=r.width;H=r.height;L=GardenHabitat.animalUnit(mobile,W,H);dpr=Math.min(devicePixelRatio||1,2);
      const staged=typeof FarmStage!=='undefined'&&FarmStage.habitat();
      const previousCamera=camera;
      camera=staged?FarmStage.frame():null;
      const origin=staged?FarmStage.toScene(0,0):[0,0];
      const next=`${W}:${H}:${mobile}:${origin}:${staged?FarmStage.scale():1}`;if(next===layout)return;layout=next;
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
      const lawn=GardenHabitat.lawn(mobile,W,H);
      // 两只昆虫分落左右花丛，避免点击区压住兔子或场景物件。
      const stops=visitorStops(mobile,scene.dataset.manorArea,staged?FarmStage.cal():null);
      const toPoint=p=>{const [x,y]=FarmStage.toScene(...p);return {x,y};};
      const fallback=[{x:lawn.cx-lawn.rx,y:lawn.cy-L*1.3},{x:lawn.cx+lawn.rx*1.8,y:lawn.cy-L*.35}];
      visitors.forEach((a,i)=>{
        const route=staged?stops[i].map(toPoint):[fallback[i],{x:fallback[i].x+L*.6,y:fallback[i].y}];
        const previous=a.perches,flight=a.route;
        a.perches=staged?route:route.map(p=>({x:clamp(p.x,30,W-30),y:clamp(p.y,110,H-100)}));
        [a.home,a.alt]=a.perches;
        if(!previous)startAtPerch(a);
        else if(previousCamera&&camera) {
          Object.assign(a,GardenHabitat.remapPoint(a,previousCamera,camera));
          if(flight){
            flight.from=GardenHabitat.remapPoint(flight.from,previousCamera,camera);
            flight.to=GardenHabitat.remapPoint(flight.to,previousCamera,camera);
            flight.lift*=camera.sy/previousCamera.sy;
          }
        }
        else {
          // Resize remaps the same stop / flight, rather than rerolling entry behavior.
          const index=Math.min(a.perchIndex,a.perches.length-1),to=a.perches[index];
          if(flight){
            const fromIndex=previous.reduce((best,p,i)=>Math.hypot(p.x-flight.from.x,p.y-flight.from.y)<Math.hypot(previous[best].x-flight.from.x,previous[best].y-flight.from.y)?i:best,0);
            const from=a.perches[Math.min(fromIndex,a.perches.length-1)],oldDistance=Math.hypot(flight.to.x-flight.from.x,flight.to.y-flight.from.y);
            if(oldDistance>1)flight.lift*=Math.hypot(to.x-from.x,to.y-from.y)/oldDistance;
            flight.from={...from};flight.to=to;const t=GardenHabitat.smooth(flight.p);
            a.x=from.x+(to.x-from.x)*t;a.y=from.y+(to.y-from.y)*t-Math.sin(t*Math.PI)*flight.lift;
          } else Object.assign(a,to);
        }
      });
    }
    const ro=new ResizeObserver(measure);ro.observe(scene);measure();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    function draw(a,t) {
      let key='ladybird',w=L*.48,h=w*.6;
      if(a.kind==='butterfly'){key=a.route?'butterflyopen':'butterflyperch';w=L*.8;h=w*.6;}
      const im=sprite(key);if(!im.complete||!im.naturalWidth)return;
      if(a.kind==='ladybird'&&GardenAnimals3D.update(a.kind,{x:a.x,y:a.y,size:L*.48,face:a.face,flying:!!a.route&&!reduced.matches,time:t}))return;
      ctx.save();ctx.translate(a.x,a.y);ctx.scale(a.face,1);
      if(a.kind==='butterfly'&&a.route&&!reduced.matches)ctx.scale(.35+.65*Math.abs(Math.sin(t*8.5)),1);
      if(a.kind==='ladybird'&&a.route&&!reduced.matches) {
        // 红色鞘翅分成两片绕胸部展开，薄翅在下面扇动，头部保持固定。
        const opening=.42*Math.sin(Math.PI*a.route.p);
        ctx.fillStyle='#25251e';ctx.beginPath();ctx.ellipse(-w*.05,-h*.5,w*.25,h*.22,0,0,Math.PI*2);ctx.fill();
        for(const side of [-1,1]) {
          ctx.save();ctx.translate(w*.15,-h*.45);ctx.rotate(side*opening);ctx.translate(-w*.15,h*.45);
          ctx.beginPath();ctx.rect(-w/2,side<0?-h:-h*.5,w*.65,h*.5);ctx.clip();ctx.drawImage(im,-w/2,-h,w,h);ctx.restore();
        }
        ctx.save();ctx.beginPath();ctx.rect(w*.15,-h,w*.35,h);ctx.clip();ctx.drawImage(im,-w/2,-h,w,h);ctx.restore();
      } else ctx.drawImage(im,-w/2,-h,w,h);
      ctx.restore();
    }
    function frame(now) {
      raf=requestAnimationFrame(frame);const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
      const modal=document.getElementById('modal');
      const hidden=document.hidden||(modal&&!modal.hidden);
      canvas.hidden=hidden;buttons.forEach(b=>{b.hidden=hidden;});
      if(hidden)return;
      const nextCamera=typeof FarmStage!=='undefined'&&FarmStage.frame();
      clock+=dt;if(clock-lastMeasure>.5||nextCamera&&(nextCamera.ox!==camera?.ox||nextCamera.oy!==camera?.oy||nextCamera.sx!==camera?.sx||nextCamera.width!==camera?.width||nextCamera.height!==camera?.height||nextCamera.profile!==camera?.profile)){measure();lastMeasure=clock;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
      for(const a of visitors) {
        if(reduced.matches&&a.route)a.route.duration=.001;
        advance(a,dt);
        if(!reduced.matches&&!a.route&&!a.reactionLeft&&a.age>a.wait) {
          const to=nextPerch(a);
          travel(a,to,L*(a.kind==='butterfly'?.25:.4),a.kind==='butterfly'?8:4);a.wait=12+Math.random()*8;
        }
        draw(a,clock);const b=buttons.get(a.kind);b.style.left=a.x+'px';b.style.top=(a.y-L*.25)+'px';
      }
      const fly=GardenCritters.peek()?.flyPoint,b=buttons.get('dragonfly');b.hidden=hidden||!fly;b.disabled=b.hidden;if(fly){b.style.left=fly.x+'px';b.style.top=fly.y+'px';}
      canvas.dataset.visitors=JSON.stringify(visitors.map(({kind,x,y,mode,route,lastAction})=>({kind,x,y,mode,moving:!!route,action:lastAction})));
    }
    raf=requestAnimationFrame(frame);
    current={destroy(){cancelAnimationFrame(raf);ro.disconnect();canvas.remove();buttons.forEach(b=>b.remove());}};
  }
  function unmount(){current?.destroy();current=null;}
  return {mount,unmount,advance,travel,react,visitorStops,startAtPerch};
})();
if(typeof module!=='undefined')module.exports=GardenCompanions;
