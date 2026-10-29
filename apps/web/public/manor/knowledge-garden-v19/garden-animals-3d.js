/* 场景小动物：完整轮廓的有厚度蒙皮，头颈和肢链连续运动；瓢虫鞘翅与膜翅分别开合。 */
const GardenAnimals3D=(()=>{
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  let current=null;
  const Skin=typeof GardenAnimalSkin!=="undefined"?GardenAnimalSkin:typeof require!=="undefined"?require("./garden-animal-skin.js"):null;
  function curve(p,keys){let i=1;while(i<keys.length-1&&p>keys[i][0])i++;const a=keys[i-1],b=keys[i];return mix(a[1],b[1],smooth((p-a[0])/(b[0]-a[0])));}
  function walkFoot(distance,offset,rest,amount=1){
    const stride=.30,stance=.64,phase=((distance/stride+offset)%1+1)%1,swing=clamp((phase-stance)/(1-stance));
    const x=phase<stance?stride*(stance/2-phase):mix(-stride*stance/2,stride*stance/2,smooth(swing));
    return {x:rest+x*amount,y:Math.sin(Math.PI*swing)*.06*amount,contact:phase<stance,phase};
  }
  function hopFeet(p,lift,distance=1){
    const flight=clamp((p-.22)/.56),travel=flight**3*(flight*(flight*6-15)+10);
    const foreAir=curve(p,[[0,0],[.16,0],[.33,1],[.62,1],[.76,0],[1,0]]),hindAir=curve(p,[[0,0],[.30,0],[.42,1],[.72,1],[.89,0],[1,0]]);
    const fore={x:curve(p,[[0,.30],[.22,.32],[.43,.11],[.6,.25],[.76,.43],[1,.30]]),y:lift*foreAir+curve(p,[[0,0],[.25,.05],[.45,.12],[.65,.03],[.76,0],[1,0]]),contact:p<.16||p>=.76};
    const hind={x:curve(p,[[0,-.25],[.30,-.25],[.37,-.51],[.53,-.07],[.70,-.16],[.89,-.34],[1,-.25]]),y:lift*hindAir+curve(p,[[0,0],[.30,0],[.45,.04],[.60,.12],[.80,.02],[.89,0],[1,0]]),contact:p<=.30||p>=.89};
    if(p<=.30)hind.x=-.25-travel*distance;
    if(p>=.76)fore.x+=distance*(1-travel);
    return {fore,hind};
  }
  function ik(root,foot,l1,l2,bend){
    const dx=foot.x-root.x,dy=foot.y-root.y,d=clamp(Math.hypot(dx,dy),Math.abs(l1-l2)+1e-5,l1+l2-1e-5),angle=Math.atan2(dy,dx);
    const a=angle+bend*Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
    return [root,{x:root.x+l1*Math.cos(a),y:root.y+l1*Math.sin(a)},{x:root.x+Math.cos(angle)*d,y:root.y+Math.sin(angle)*d}];
  }
  const lengths=(rabbit,part)=>rabbit?(part==='hind'?[.24,.23]:[.15,.17]):[.105,.115];
  function skeleton(kind,state={}){
    const rabbit=kind==='rabbit',p=state.hop??1,lift=state.jumping?state.lift||0:0;
    const prep=state.jumping?(p<.22?Math.sin(p/.22*Math.PI):p>.78?Math.sin((p-.78)/.22*Math.PI):0):0;
    const curl=state.curl||0,bodyY=lift-prep*.045,headAngle=-(state.head||0)*(rabbit?1.05:.72),hop=hopFeet(p,lift,state.distance||1),legs=[];
    for(const far of [true,false])for(const part of ['hind','fore']){
      const hind=part==='hind',rest=hind?-.25:.30,offset=hind?(far?.25:.75):(far?.5:0);
      const foot=rabbit?(state.jumping?{...hop[part]}:{x:rest,y:0,contact:true}):walkFoot(state.distance||0,offset,rest,state.walkMix||0);
      const root={x:hind?-.30:.22,y:(rabbit?(hind?.34:.32):.205)+bodyY};
      if(curl){foot.x=mix(foot.x,root.x,curl);foot.y=mix(foot.y,root.y-.03,curl);}
      // 后腿跗部向后，长脚掌向前；前肢肘部向后，腕部再向前落地。
      const ankle={x:foot.x-(rabbit&&hind?.12:.025),y:foot.y+(rabbit&&hind?.105:.065)};
      const [upper,lower]=lengths(rabbit,part),joints=ik(root,ankle,upper,lower,hind?1:-1);
      joints.push({x:foot.x-.015,y:foot.y+.03});
      legs.push({part,far,foot,joints,upper,lower,z:(far?-1:1)*(rabbit?.155:.16),toe:{x:foot.x+(rabbit&&hind?.15:.08),y:foot.y+.018}});
    }
    return {legs,bodyY,headAngle,curl,prep};
  }
  function kit(T){
    const materials=[],geometries=[],sphere=new T.SphereGeometry(1,28,20),cylinder=new T.CylinderGeometry(.82,1,1,12);geometries.push(sphere,cylinder);
    const mat=(color,roughness=1,extra={})=>{const m=new T.MeshStandardMaterial({color,roughness,...extra});materials.push(m);return m;};
    const ell=(parent,m,pos,scale)=>{const mesh=new T.Mesh(sphere,m);mesh.position.set(...pos);mesh.scale.set(...scale);parent.add(mesh);return mesh;};
    let seed=13;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    return {materials,geometries,sphere,cylinder,mat,ell,rng};
  }
  function build(kind,T){return kind==='ladybird'?buildLadybird(T):Skin.build(kind,T);}
  function buildLadybird(T){
    const K=kit(T),{mat,ell}=K,root=new T.Group(),body=new T.Group();root.add(body);
    const black=mat(0x121817,.38),red=mat(0xd9230c,.28,{metalness:.08}),cream=mat(0xfff0cf,.5),wing=mat(0xc8d8ce,.65,{transparent:true,opacity:.27,side:T.DoubleSide,depthWrite:false});
    ell(body,black,[-.06,.10,0],[.33,.11,.225]);ell(body,black,[.26,.13,0],[.13,.12,.165]);ell(body,black,[.40,.12,0],[.105,.09,.11]);
    const shells=[],wings=[],legs=[];
    for(const side of [-1,1]){
      ell(body,cream,[.285,.208,side*.11],[.048,.027,.036]);
      ell(body,black,[.44,.171,side*.073],[.026,.026,.022]);
      ell(body,cream,[.449,.182,side*.079],[.007,.007,.006]);
      const shell=new T.Group();shell.position.set(.15,.13,0);body.add(shell);
      const geo=new T.SphereGeometry(1,40,28,0,Math.PI,0,Math.PI/2);K.geometries.push(geo);const cover=new T.Mesh(geo,red);cover.position.x=-.22;cover.scale.set(.34,.245,side*.24);cover.material.side=T.DoubleSide;shell.add(cover);
      for(const [x,z]of [[-.21,.115],[-.03,.165],[.14,.10]]){const xx=x/.34,zz=z/.24,y=.245*Math.sqrt(Math.max(0,1-xx*xx-zz*zz));ell(shell,black,[-.22+x,y+.005,side*z],[.046,.012,.038]);}
      ell(shell,black,[-.31,.234,side*.017],[.043,.011,.021]);
      shells.push(shell);
      const membrane=new T.Group();membrane.position.set(.16,.13,0);body.add(membrane);ell(membrane,wing,[-.23,0,side*.18],[.42,.008,.16]);membrane.visible=false;wings.push(membrane);
      for(let i=0;i<3;i++){const leg=new T.Group();leg.position.set(.15-i*.19,.08,side*.12);body.add(leg);for(let j=0;j<2;j++){const bone=new T.Mesh(K.cylinder,black);bone.scale.set(.014,.17,.014);bone.position.set(j?-.055:.015,-.04,side*(.07+j*.09));bone.rotation.x=side*(j?1.2:.7);leg.add(bone);}legs.push(leg);}
      const antenna=new T.Mesh(K.cylinder,black);antenna.position.set(.49,.15,side*.08);antenna.scale.set(.009,.16,.009);antenna.rotation.z=-.85;antenna.rotation.x=side*.6;body.add(antenna);
    }
    return {root,body,shells,wings,legs,...K,kind:'ladybird',yaw:0,opening:0};
  }
  function animate(model,state,dt,T){
    if(!model.presented){model.yaw=state.face<0?Math.PI:0;model.opening=state.flying?1:0;}
    const target=state.face<0?Math.PI:0,delta=Math.atan2(Math.sin(target-model.yaw),Math.cos(target-model.yaw));model.yaw+=delta*(1-Math.exp(-dt*9));model.root.rotation.set(model.kind==='ladybird'?.42:0,model.yaw,0);
    if(model.kind==='ladybird'){
      model.opening+=((state.flying?1:0)-model.opening)*(1-Math.exp(-dt*11));
      model.shells.forEach((shell,i)=>{const side=i?1:-1;shell.rotation.x=-side*model.opening*.40;shell.rotation.y=side*model.opening*.65;shell.rotation.z=-model.opening*.68;});
      model.wings.forEach((wing,i)=>{const side=i?1:-1;wing.visible=model.opening>.5;wing.rotation.x=-side*(.5+.5*Math.sin((state.time||0)*65))*model.opening;});
      model.legs.forEach((leg,i)=>leg.rotation.x=(i<3?1:-1)*model.opening*.8);
      return {opening:model.opening};
    }
    return Skin.animate(model,state,dt,T,{skeleton,ik,walkFoot,hopFeet});
  }
  // three.js only serves this idle enhancement, so it loads here instead of in the first-screen runtime.
  let pendingScene=null,threeLoad=null;
  const loadThree=()=>threeLoad||=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='knowledge-garden-v19/vendor/three-0.160.1.min.js';script.onload=resolve;script.onerror=()=>{threeLoad=null;script.remove();reject(new Error('three'));};document.head.append(script);});
  function mount(scene){
    unmount();if(!scene)return;
    if(typeof THREE==='undefined'){pendingScene=scene;loadThree().then(()=>{if(pendingScene===scene&&scene.isConnected)mount(scene);},()=>{});return;}
    let renderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true});}catch{return;}
    const canvas=renderer.domElement;canvas.className='animal-model-layer';canvas.setAttribute('aria-hidden','true');scene.prepend(canvas);
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
    const world=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,5000);camera.position.set(0,0,2000);
    world.add(new THREE.HemisphereLight(0xf8f3e7,0x77734b,1.7));const sun=new THREE.DirectionalLight(0xfff4dc,2.3);sun.position.set(-600,900,1400);world.add(sun);
    // The mobile bay has no rabbit. Do not build/read back its fur texture
    // while the bay's insects and water are entering the screen.
    const kinds=scene.dataset.manorArea==='bay'?['ladybird']:['rabbit','ladybird'];
    const models=new Map(kinds.map(kind=>{const model=build(kind,THREE);world.add(model.root);model.root.visible=false;return [kind,model];}));
    let W=0,H=0,last=0,raf=0,available=true;
    function measure(){const r=scene.getBoundingClientRect();W=r.width;H=r.height;renderer.setPixelRatio(GardenHabitat.rasterScale(W,H,devicePixelRatio||1,document.documentElement.classList.contains('light-note-mobile-rendering')));renderer.setSize(W,H,false);camera.left=-W/2;camera.right=W/2;camera.top=H/2;camera.bottom=-H/2;camera.updateProjectionMatrix();}
    const ro=new ResizeObserver(measure);ro.observe(scene);measure();
    const lost=e=>{e.preventDefault();available=false;canvas.hidden=true;};canvas.addEventListener('webglcontextlost',lost);const restored=()=>{available=true;};canvas.addEventListener('webglcontextrestored',restored);
    function frame(now){raf=requestAnimationFrame(frame);const dt=last?Math.min(.05,(now-last)/1000):0;last=now;const modal=document.getElementById('modal');canvas.hidden=!available||document.hidden||(modal&&!modal.hidden);if(canvas.hidden)return;
      const debug={};for(const [kind,model]of models){const state=model.state;if(!state||(kind==='rabbit'&&!model.ready))continue;model.root.visible=true;model.root.position.set(state.x-W/2,H/2-state.y,0);model.root.scale.setScalar(state.size);const sk=animate(model,state,dt,THREE);model.presented=true;debug[kind]={head:sk.headAngle,feet:sk.legs?.map(l=>l.foot),yaw:model.yaw,opening:sk.opening};}renderer.render(world,camera);canvas.dataset.models=JSON.stringify(debug);
    }
    raf=requestAnimationFrame(frame);current={update(kind,state){if(!available||!models.has(kind))return false;const model=models.get(kind);model.state=state;return !!model.presented;},destroy(){cancelAnimationFrame(raf);ro.disconnect();canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);for(const model of models.values()){model.dead=true;model.cancelPreparation?.();model.texture?.dispose();model.materials.forEach(m=>{m.userData.texture?.dispose();m.dispose();});model.geometries.forEach(g=>g.dispose());}renderer.dispose();renderer.forceContextLoss();canvas.remove();}};
  }
  function unmount(){pendingScene=null;current?.destroy();current=null;}
  return {mount,unmount,update:(kind,state)=>current?.update(kind,state)||false,skeleton,ik,walkFoot,hopFeet,build,animate};
})();
if(typeof module!=='undefined')module.exports=GardenAnimals3D;
