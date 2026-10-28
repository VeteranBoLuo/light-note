/* 完整动物轮廓的有厚度曲面：原画的短吻、毛皮和足部共用连续网格。
   绑定后只转动头颈与四条肢链；躯干不拉伸。透明轮廓的正反面在边缘闭合。 */
const GardenAnimalSkin=(()=>{
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const PROFILES={
    rabbit:{scale:1.4,ground:.944,neck:[.665,.565],headStart:.60,legStart:.66,
      limbs:[[[.405,.68],[.32,.78],[.325,.845],[.437,.867]],[[.71,.69],[.71,.78],[.72,.855],[.761,.892]],[[.30,.62],[.255,.74],[.195,.855],[.357,.931]],[[.635,.69],[.635,.805],[.64,.895],[.682,.938]]]},

  };
  function distanceField(rgba,w,h){
    const d=new Float32Array(w*h),INF=1e6;
    for(let i=0;i<d.length;i++)d[i]=rgba[i*4+3]>70?INF:0;
    const relax=(i,j,c)=>{d[i]=Math.min(d[i],d[j]+c);};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)relax(i,i-1,1);if(y){relax(i,i-w,1);if(x)relax(i,i-w-1,1.414);if(x<w-1)relax(i,i-w+1,1.414);}}
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x<w-1)relax(i,i+1,1);if(y<h-1){relax(i,i+w,1);if(x)relax(i,i+w-1,1.414);if(x<w-1)relax(i,i+w+1,1.414);}}
    return d;
  }
  function closest(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1));return {t,d:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};}
  function surface(rgba,w,h,kind,nx=96,ny=64){
    const profile=PROFILES[kind],aspect=h/w,scale=profile.scale,point=([u,v])=>({x:(u-.5)*scale,y:(profile.ground-v)*scale*aspect});
    const limbs=profile.limbs.map((chain,i)=>({far:i<2,part:i%2?'fore':'hind',rest:chain.map(point)}));
    const field=distanceField(rgba,w,h);let max=1;for(const d of field)if(d<1e6)max=Math.max(max,d);
    const count=(nx+1)*(ny+1),positions=new Float32Array(count*6),uv=new Float32Array(count*4),active=new Uint8Array(count),bindings=[],index=[];
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
      const u=x/nx,v=y/ny,i=y*(nx+1)+x,px=Math.min(w-1,Math.round(u*(w-1))),py=Math.min(h-1,Math.round(v*(h-1))),d=field[py*w+px],p=point([u,v]);
      const depth=d>=1e6?0:Math.min(Math.sqrt(d*max)*1.1,d*2.5)/w*scale;
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const xx=clamp(Math.round((u+ox/nx)*(w-1)),0,w-1),yy=clamp(Math.round((v+oy/ny)*(h-1)),0,h-1);if(rgba[(yy*w+xx)*4+3]>20)active[i]=1;}
      for(let side=0;side<2;side++){const j=i+side*count;positions[j*3]=p.x;positions[j*3+1]=p.y;positions[j*3+2]=(side?-1:1)*depth;uv[j*2]=u;uv[j*2+1]=1-v;}
      let limb=-1,best=Infinity,weights=[];
      limbs.forEach((l,k)=>{let near=Infinity;const scores=[];for(let j=0;j<3;j++){const c=closest(p,l.rest[j],l.rest[j+1]);near=Math.min(near,c.d);scores.push(Math.exp(-c.d*c.d/.0013));}if(near<best){best=near;limb=k;weights=scores;}});
      const sum=weights.reduce((a,b)=>a+b,0)||1;
      bindings.push({limb,weights:weights.map(n=>n/sum),leg:smooth((v-profile.legStart)/.15)*(1-smooth((best-.045)/.065)),head:smooth((u-profile.headStart)/.16)*(1-smooth((v-.63)/.13))});
    }
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=y*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;if(![a,b,c,d].some(i=>active[i]))continue;index.push(a,c,b,b,c,d,a+count,b+count,c+count,b+count,d+count,c+count);}
    return {positions,uv,index,bindings,limbs,neck:point(profile.neck),count,kind};
  }
  function build(kind,T){
    const root=new T.Group(),model={root,kind,yaw:0,materials:[],geometries:[],ready:false,dead:false};
    if(typeof document==='undefined')return model;
    let prepared;const preparation=new Promise(resolve=>{prepared=resolve;});model.cancelPreparation=prepared;
    if(typeof GardenStartup!=='undefined')GardenStartup.track(preparation);
    const texture=new T.TextureLoader().load(`knowledge-garden-v19/courtyard/animal-${kind}-r12.webp`,()=>{
      if(model.dead){texture.dispose();prepared();return;}
      try {
      const source=document.createElement('canvas');source.width=384;source.height=Math.round(384*texture.image.height/texture.image.width);
      const ctx=source.getContext('2d');ctx.drawImage(texture.image,0,0,source.width,source.height);
      attach(model,T,surface(ctx.getImageData(0,0,source.width,source.height).data,source.width,source.height,kind),texture);
      } catch {model.failed=true;}
      finally {prepared();}
    },undefined,()=>{model.failed=true;prepared();});
    texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;model.texture=texture;
    return model;
  }
  function attach(model,T,data,texture){
    model.data=data;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(data.positions.slice(),3));geo.setAttribute('uv',new T.BufferAttribute(data.uv,2));geo.setIndex(data.index);geo.computeVertexNormals();model.geometries.push(geo);
    const material=new T.MeshBasicMaterial({map:texture,side:T.FrontSide,transparent:true,alphaTest:.12,depthWrite:true,toneMapped:false});model.materials.push(material);
    const skin=new T.Mesh(geo,material);skin.frustumCulled=false;model.root.add(skin);model.skin=skin;model.ready=true;
  }
  function poseLegs(data,state,helpers){
    const base=helpers.skeleton(data.kind,state),rabbit=data.kind==='rabbit';
    const hop=helpers.hopFeet(state.hop??1,state.jumping?state.lift||0:0,state.distance||1);
    const legs=data.limbs.map((leg,i)=>{
      const rest=leg.rest,offset=leg.part==='hind'?(leg.far?.25:.75):(leg.far?.5:0),original=rest[3];
      const f=rabbit?(state.jumping?{x:original.x+(hop[leg.part].x-(leg.part==='hind'?-.25:.30))*.75,y:original.y+hop[leg.part].y,contact:hop[leg.part].contact}:{...original,contact:true}):helpers.walkFoot(state.distance||0,offset,original.x,state.walkMix||0);
      if(!rabbit)f.y+=original.y;
      const root={x:rest[0].x,y:rest[0].y+base.bodyY},foot={x:f.x,y:f.y};
      const curl=state.curl||0;foot.x+=(root.x-foot.x)*curl*.65;foot.y+=(root.y-foot.y)*curl*.65;
      const ankle={x:foot.x+rest[2].x-original.x,y:foot.y+rest[2].y-original.y};
      const a=Math.hypot(rest[1].x-rest[0].x,rest[1].y-rest[0].y),b=Math.hypot(rest[2].x-rest[1].x,rest[2].y-rest[1].y);
      const cross=(rest[2].x-rest[0].x)*(rest[1].y-rest[0].y)-(rest[2].y-rest[0].y)*(rest[1].x-rest[0].x);
      const joints=helpers.ik(root,ankle,a,b,cross>=0?1:-1);joints.push(foot);
      return {...leg,joints,foot,contact:f.contact};
    });
    return {legs,bodyY:base.bodyY,headAngle:-(state.head||0)*(rabbit?.32:.27),curl:state.curl||0};
  }
  function deform(data,pose,out){
    const transforms=pose.legs.map(leg=>leg.rest.slice(0,3).map((a,s)=>{
      const b=leg.rest[s+1],p=leg.joints[s],q=leg.joints[s+1],angle=Math.atan2(q.y-p.y,q.x-p.x)-Math.atan2(b.y-a.y,b.x-a.x);
      return {a,p,c:Math.cos(angle),s:Math.sin(angle)};
    }));
    const headCos=Math.cos(pose.headAngle),headSin=Math.sin(pose.headAngle);
    for(let i=0;i<data.positions.length/3;i++){
      const j=i%data.count,b=data.bindings[j],x=data.positions[i*3],y=data.positions[i*3+1],z=data.positions[i*3+2];let px=x,py=y+pose.bodyY;
      if(b.leg>.001){let lx=0,ly=0;for(let s=0;s<3;s++){const t=transforms[b.limb][s],dx=x-t.a.x,dy=y-t.a.y;lx+=(t.p.x+dx*t.c-dy*t.s)*b.weights[s];ly+=(t.p.y+dx*t.s+dy*t.c)*b.weights[s];}px+=(lx-px)*b.leg;py+=(ly-py)*b.leg;}
      if(b.head>.001){const dx=px-data.neck.x,dy=py-data.neck.y-pose.bodyY;const hx=data.neck.x+dx*headCos-dy*headSin-pose.curl*.065,hy=data.neck.y+pose.bodyY+dx*headSin+dy*headCos-pose.curl*.035;px+=(hx-px)*b.head;py+=(hy-py)*b.head;}
      out[i*3]=px;out[i*3+1]=py;out[i*3+2]=z;
    }
    return out;
  }
  function animate(model,state,dt,T,helpers){
    if(!model.ready)return {};
    const pose=poseLegs(model.data,state,helpers),attr=model.skin.geometry.attributes.position;
    deform(model.data,pose,attr.array);attr.needsUpdate=true;
    return pose;
  }
  return {PROFILES,distanceField,surface,build,attach,poseLegs,deform,animate};
})();
if(typeof module!=='undefined')module.exports=GardenAnimalSkin;
