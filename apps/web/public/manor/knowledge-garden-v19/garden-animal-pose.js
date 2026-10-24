/* 同一张休息姿态做头颈、耳朵与四肢蒙皮；动作中不更换整张图片。 */
const GardenAnimalPose = (() => {
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const fields=['head','neck','curl','ears','stretch','squat'];
  function create(){return Object.fromEntries(fields.flatMap(k=>[[k,0],[k+'V',0]]));}
  function advance(p,target,dt) {
    // 临界阻尼的解析解，目标中途改变也保留速度，避免重播或突然刹停。
    const omega=7,e=Math.exp(-omega*dt);
    for(const k of fields){const x=p[k]-(target[k]||0),v=p[k+'V'],t=(v+omega*x)*dt;p[k]=(target[k]||0)+(x+t)*e;p[k+'V']=(v-omega*t)*e;}
    return p;
  }
  function choose(actions,last,rng=Math.random) {
    const pool=actions.filter(a=>a!==last);return pool[Math.min(pool.length-1,Math.floor(rng()*pool.length))];
  }
  function targets(kind,mode,age=0,hop=0) {
    if(kind==='rabbit') {
      const flight=Math.sin(Math.PI*clamp((hop-.22)/.56));
      const crouch=mode==='hop'?(hop<.22?Math.sin(hop/.22*Math.PI):hop>.78?Math.sin((hop-.78)/.22*Math.PI):0):0;
      return {head:mode==='alert'?-.24:mode==='hop'?-.08:0,neck:mode==='alert'?-.018:0,ears:mode==='alert'?-.10:Math.sin(age*2)*.025,stretch:mode==='hop'?flight*.24:0,squat:crouch*.13};
    }
    const curling=mode==='curl';
    return {head:curling?.46:mode==='sniff'?-.48:Math.sin(age*1.8)*.025,neck:curling?.025:mode==='sniff'?-.045:0,curl:curling?1:0};
  }
  function point(kind,u,v,p) {
    let x=u,y=v;
    const rabbit=kind==='rabbit',cx=rabbit?.52:.58,cy=rabbit?.66:.63;
    const head=smooth((u-(rabbit?.43:.51))/(rabbit?.19:.18))*smooth(((rabbit?.81:.84)-v)/.21);
    const angle=p.head*head,c=Math.cos(angle),s=Math.sin(angle),dx=u-cx,dy=v-cy;
    x=cx+dx*c-dy*s;y=cy+dx*s+dy*c+p.neck*head;
    if(rabbit) {
      // 耳尖小幅转动；脚底权重为零，抬头不会把整只兔子抬离地面。
      const ear=smooth((.49-v)/.25)*smooth((u-.43)/.14);
      x+=p.ears*ear*(.49-v);y-=p.ears*ear*(u-.56);
      const body=smooth((.87-v)/.18);
      x=.48+(x-.48)*(1+p.stretch*.45*body);
      y=.87+(y-.87)*(1-p.squat*body-p.stretch*.12*body);
      const fore=smooth((u-.49)/.13)*smooth((v-.66)/.18),hind=smooth((.48-u)/.18)*smooth((v-.62)/.23);
      x+=(fore*.65-hind*.8)*p.stretch;
      y+=(hind*.18-fore*.12)*p.stretch;
    } else {
      // 从四足姿态逐渐收脚团身，再反向展开；头部始终是同一个头部。
      x=.48+(x-.48)*(1-.24*p.curl)-head*.105*p.curl;
      y-=smooth((v-.71)/.2)*.17*p.curl;
      y+=smooth((.45-v)/.35)*.025*p.curl;
    }
    return {x,y};
  }
  function draw(ctx,img,source,box,kind,p) {
    const nx=12,ny=12,vertices=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny,q=point(kind,u,v,p);vertices.push({u,v,x:q.x,y:q.y});}
    ctx.save();ctx.translate(box.x,box.y);ctx.scale(box.w,box.h);
    function triangle(a,b,c) {
      const det=(b.u-a.u)*(c.v-a.v)-(c.u-a.u)*(b.v-a.v);
      const aa=((b.x-a.x)*(c.v-a.v)-(c.x-a.x)*(b.v-a.v))/det;
      const bb=((b.y-a.y)*(c.v-a.v)-(c.y-a.y)*(b.v-a.v))/det;
      const cc=((c.x-a.x)*(b.u-a.u)-(b.x-a.x)*(c.u-a.u))/det;
      const dd=((c.y-a.y)*(b.u-a.u)-(b.y-a.y)*(c.u-a.u))/det;
      ctx.save();ctx.beginPath();const mx=(a.x+b.x+c.x)/3,my=(a.y+b.y+c.y)/3;
      // 极小重叠仅消除 Canvas 三角形裁切的抗锯齿细缝。
      [a,b,c].forEach((q,i)=>{const dx=q.x-mx,dy=q.y-my,l=Math.hypot(dx,dy),x=q.x+dx/l*.0015,y=q.y+dy/l*.0015;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.closePath();ctx.clip();ctx.transform(aa,bb,cc,dd,a.x-aa*a.u-cc*a.v,a.y-bb*a.u-dd*a.v);
      ctx.drawImage(img,source.x,source.y,source.w,source.h,0,0,1,1);ctx.restore();
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;triangle(vertices[a],vertices[b],vertices[c]);triangle(vertices[b],vertices[d],vertices[c]);}
    ctx.restore();
  }
  return {create,advance,choose,targets,point,draw};
})();
if(typeof module!=='undefined')module.exports=GardenAnimalPose;
