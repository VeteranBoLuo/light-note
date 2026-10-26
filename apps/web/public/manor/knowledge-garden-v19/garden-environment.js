/* 海面与钓鱼区共用连续风浪；鱼舱顶面保持原画静态，岸边与物件固定。
   仅在可见且未开启减少动态时运行；纹理失败或 WebGL 丢失时保留原图。 */
const GardenEnvironment = (() => {
  let current=null;
  const script=typeof document==='undefined'?null:document.currentScript;
  function sourceURL(path,base){return new URL(path,base).href;}
  const workerURL=script?.dataset.worker,environmentURL=script?sourceURL(script.dataset.environmentScript||script.src,document.baseURI):undefined;
  // 匹配高分屏，统一限制总像素和 GPU 尺寸，避免大屏糊成低分辨率画布。
  function renderSize(width,height,dpr=1,limit=4096) {
    const w=Math.max(1,width),h=Math.max(1,height);
    const scale=Math.min(Math.max(1,dpr),2,limit/w,limit/h,Math.sqrt(8294400/(w*h)));
    return {width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale))};
  }
  function textureSize(naturalWidth,naturalHeight,displayWidth,dpr=1,limit=4096) {
    const wanted=Math.max(naturalWidth,displayWidth*Math.min(2,dpr));
    const scale=Math.min(1,limit/wanted,limit/(wanted*naturalHeight/naturalWidth));
    return {width:Math.max(1,Math.round(wanted*scale)),height:Math.max(1,Math.round(wanted*naturalHeight/naturalWidth*scale))};
  }
  // Alpha stores the distance to land. Green tank-top regions never animate.
  function runSteps(steps){let next;do{next=steps.next();}while(!next.done);return next.value;}
  function shorelineMask(rgba,width,height){return runSteps(shorelineSteps(rgba,width,height));}
  function* shorelineSteps(rgba,width,height) {
    const out=new Uint8Array(rgba),distance=new Float32Array(width*height),diagonal=Math.SQRT2;
    const sea=i=>rgba[i*4]>128&&rgba[i*4+1]<128&&rgba[i*4+2]<128;
    for(let i=0;i<distance.length;i++){distance[i]=sea(i)?32:0;out[i*4+3]=0;}
    for(let y=0;y<height;y++){if(y%16===0)yield;for(let x=0;x<width;x++){
      const i=y*width+x;if(!distance[i])continue;
      if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
      if(y){distance[i]=Math.min(distance[i],distance[i-width]+1);
        if(x)distance[i]=Math.min(distance[i],distance[i-width-1]+diagonal);
        if(x+1<width)distance[i]=Math.min(distance[i],distance[i-width+1]+diagonal);
      }
    }}
    for(let y=height-1;y>=0;y--){if(y%16===0)yield;for(let x=width-1;x>=0;x--){
      const i=y*width+x;if(!distance[i])continue;
      if(x+1<width)distance[i]=Math.min(distance[i],distance[i+1]+1);
      if(y+1<height){distance[i]=Math.min(distance[i],distance[i+width]+1);
        if(x)distance[i]=Math.min(distance[i],distance[i+width-1]+diagonal);
        if(x+1<width)distance[i]=Math.min(distance[i],distance[i+width+1]+diagonal);
      }
      out[i*4+3]=Math.round(distance[i]/32*255);
    }}
    return out;
  }
  // Only classify water inside the calibrated polygons. Bright native wave crests
  // inherit adjacent blue water; vegetation, boats and rock holes remain dry.
  function surfaceMask(categories,scene,width,height,radius=2){return runSteps(surfaceSteps(categories,scene,width,height,radius));}
  function* surfaceSteps(categories,scene,width,height,radius=2) {
    const out=new Uint8Array(categories),blue=new Uint8Array(width*height);
    for(let i=0;i<blue.length;i++) {
      if(i%65536===0)yield;
      const p=i*4,r=scene[p],g=scene[p+1],b=scene[p+2];
      blue[i]=b-r>12&&g-r>6&&b>g*.85&&g>40?1:0;
    }
    for(let y=0;y<height;y++){if(y%16===0)yield;for(let x=0;x<width;x++) {
      const i=y*width+x,p=i*4;
      if(out[p+1]>128&&out[p]<128&&out[p+2]<128){out[p]=out[p+1]=out[p+2]=0;continue;}
      if(out[p]<128||out[p+1]>128||out[p+2]>128)continue;
      let wet=!!blue[i];
      if(!wet&&scene[p]>140&&scene[p+1]>150&&scene[p+2]>105) {
        for(let dy=-radius;dy<=radius&&!wet;dy++)for(let dx=-radius;dx<=radius;dx++) {
          const xx=x+dx,yy=y+dy;
          if(xx>=0&&xx<width&&yy>=0&&yy<height&&blue[yy*width+xx]){wet=true;break;}
        }
      }
      if(!wet)out[p]=out[p+1]=out[p+2]=0;
    }}
    return yield* shorelineSteps(out,width,height);
  }
  // Identical painted plates and water classification, prepared away from input/render work.
  async function prepareTextures(data,makeCanvas=(w,h)=>new OffscreenCanvas(w,h),pause=async()=>{}) {
    const {width,height,image,details,mask,displayWidth}=data;
    const source=makeCanvas(width,height),ctx=source.getContext('2d');
    ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,width,height);
    for(const detail of details) {
      const sx=width/detail.stageWidth,sy=height/detail.stageHeight;
      if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;
      if(detail.pose) {
        const [a,b,c,d,e,f]=detail.pose,plate=makeCanvas(detail.image.width,detail.image.height),pc=plate.getContext('2d');
        pc.drawImage(detail.image,0,0);pc.globalCompositeOperation='destination-in';
        for(const horizontal of [true,false]) {
          const gradient=pc.createLinearGradient(0,0,horizontal?plate.width:0,horizontal?0:plate.height);
          gradient.addColorStop(0,'transparent');gradient.addColorStop(horizontal?.04:.05,'black');gradient.addColorStop(horizontal?.96:.95,'black');gradient.addColorStop(1,'transparent');
          pc.fillStyle=gradient;pc.fillRect(0,0,plate.width,plate.height);
        }
        ctx.save();ctx.beginPath();detail.polygon.forEach(([x,y],i)=>i?ctx.lineTo(x*sx,y*sy):ctx.moveTo(x*sx,y*sy));ctx.closePath();ctx.clip();
        ctx.transform(a*sx,b*sy,c*sx,d*sy,e*sx,f*sy);ctx.drawImage(plate,0,0);ctx.restore();
      } else ctx.drawImage(detail.image,detail.left*sx,detail.top*sy,detail.width*sx,detail.height*sy);
      await pause();
    }
    const smooth=makeCanvas(width,height),sc=smooth.getContext('2d');
    sc.filter=`blur(${4.25*width/Math.max(1,displayWidth)}px)`;sc.drawImage(source,0,0);
    await pause();
    const maskWidth=Math.min(1536,mask.width),maskHeight=Math.max(1,Math.round(mask.height*maskWidth/mask.width));
    const field=makeCanvas(maskWidth,maskHeight),fc=field.getContext('2d',{willReadFrequently:true});
    fc.drawImage(mask,0,0,maskWidth,maskHeight);const categories=fc.getImageData(0,0,maskWidth,maskHeight).data;
    fc.clearRect(0,0,maskWidth,maskHeight);fc.drawImage(source,0,0,maskWidth,maskHeight);
    const radius=Math.max(1,Math.min(8,Math.ceil(maskWidth/Math.max(1,displayWidth)*1.75)));
    const steps=surfaceSteps(categories,fc.getImageData(0,0,maskWidth,maskHeight).data,maskWidth,maskHeight,radius);
    let next;do{next=steps.next();if(!next.done)await pause();}while(!next.done);
    const pixels=next.value;
    return {source,smooth,pixels,maskWidth,maskHeight};
  }
  // Open wave fronts share a gentle prevailing direction. Their different lengths,
  // headings and speeds break up the crests without point sources or a global reversal.
  function swellField(count,random=Math.random) {
    const data=new Float32Array(count*4),trains=[];
    for(let i=0;i<count;i++) {
      const length=92*Math.pow(.78,i)*(.9+random()*.2),k=Math.PI*2/length;
      const angle=i<5?(random()-.5)*1.25:(i%2?1:-1)*(.75+random()*.5);
      trains.push({x:Math.sin(angle)*k,y:Math.cos(angle)*k,amplitude:length*(i<4?.012:.006),speed:Math.sqrt(12*k),phase:random()*Math.PI*2});
    }
    return {update(seconds) {
      trains.forEach((wave,i)=>data.set([wave.x,wave.y,wave.amplitude,(wave.phase+Math.max(0,seconds)*wave.speed)%(Math.PI*2)],i*4));
      return data;
    }};
  }
  const fragment=`
    varying vec2 uv;
    uniform sampler2D picture, smoothPicture, masks;
    uniform vec2 pixels, maskPixels;
    uniform vec4 waves[SWELL_COUNT];
    vec3 windWaves(vec2 point,float distant){
      vec2 q=point*pixels*vec2(1.,mix(2.6,4.,distant));
      vec2 slope=vec2(0.);
      float foam=0.;
      for(int i=0;i<SWELL_COUNT;i++){
        if(i>=4&&distant>.5)break;
        vec4 wave=waves[i];
        vec2 across=normalize(vec2(-wave.y,wave.x));
        float along=dot(q,across),seed=float(i)*2.39996;
        float a=along*.018+seed,b=along*.047+seed*1.7;
        float phase=dot(q,wave.xy)+sin(a)*.58+sin(b)*.22-wave.w;
        vec2 gradient=wave.xy+across*(cos(a)*.01044+cos(b)*.01034);
        slope+=wave.z*(cos(phase)+.24*cos(phase*2.))*gradient;
        if(i<4){
          // Thin, uneven open crests, softened into short foam fragments.
          float lace=smoothstep(.25,.7,.5+.27*sin(along*.035+seed)+.22*sin(along*.089+dot(q,wave.xy)*.37+seed*2.));
          foam+=pow(smoothstep(.92,.997,sin(phase)),1.6)*lace*.28;
        }
      }
      return vec3(slope,foam);
    }
    void main(){
      vec4 m=texture2D(masks,uv);
      float water=m.r;
      if(water<.01||m.g>.5){gl_FragColor=vec4(0.);return;}
      float shoreDistance=m.a*32.*pixels.x/maskPixels.x;
      float distant=1.-step(.1,m.b);
      float nativeFoam=step(.4,m.b);
      float edge=smoothstep(mix(1.,.3,nativeFoam),mix(4.,1.7,nativeFoam),shoreDistance);
      // Every sea tile samples one world-space wave field, with no per-patch
      // translation, opposing motion or reversal of the whole painted plate.
      vec3 surface=windWaves(uv,distant);
      vec2 slope=surface.xy*edge;
      vec2 bend=clamp(slope*mix(4.,2.,distant),vec2(-1.6),vec2(1.6))/pixels;
      vec3 color=texture2D(picture,uv+bend).rgb;
      // Keep the broad seabed, rocks and reflected scenery fixed.
      color+=texture2D(smoothPicture,uv).rgb-texture2D(smoothPicture,uv+bend).rgb;
      float shade=clamp(dot(slope,vec2(.46,-.88))*mix(.45,.22,distant),-.1,.1);
      color*=1.+shade;
      color=mix(color,vec3(.86,.97,.98),min(.4,surface.z)*mix(.55,.15,distant)*edge);
      // Animate the original foam around pier feet, preserving its painted
      // shape instead of adding expanding circles over the picture.
      float white=smoothstep(.68,.91,dot(color,vec3(.2126,.7152,.0722)));
      color*=1.-white*nativeFoam*clamp(.08-surface.z*.2+dot(slope,vec2(.12,.2)),0.,.14);
      gl_FragColor=vec4(clamp(color,0.,1.),water*edge);
    }`;
  function layer(img) {
    const canvas=document.createElement('canvas');canvas.className='environment-motion';canvas.setAttribute('aria-hidden','true');
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false});
    if(!gl)return ()=>{};
    const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision>0?'highp':'mediump';
    const limit=Math.min(4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    const textureLimit=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const swellCount=Math.max(1,Math.min(10,gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)-12)),swells=swellField(swellCount);
    let program,texture,smoothTexture,maskTexture,buffer,fishingWater=false,raf=0,ready=false,dead=false,visible=true,last=0,uploaded='',maskReady=false,maskWidth=1,maskHeight=1;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    try {
      program=gl.createProgram();
      for(const [type,body] of [[gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);}'],[gl.FRAGMENT_SHADER,fragment]]){
        const code=`precision ${precision} float;${body.replaceAll('SWELL_COUNT',String(swellCount))}`;
        const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('environment shader');
        gl.attachShader(program,shader);gl.deleteShader(shader);
      }
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('environment program');
      gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      maskTexture=gl.createTexture();
      texture=gl.createTexture();smoothTexture=gl.createTexture();
      for(const tex of [texture,smoothTexture]) {
        gl.bindTexture(gl.TEXTURE_2D,tex);
        for(const [key,value] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,key,value);
      }
    }catch{gl.deleteProgram(program);gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteTexture(smoothTexture);gl.deleteTexture(maskTexture);return ()=>{};}
    const uniforms={};for(const n of ['picture','smoothPicture','masks','pixels','maskPixels'])uniforms[n]=gl.getUniformLocation(program,n);
    uniforms.waves=gl.getUniformLocation(program,'waves[0]');
    gl.uniform1i(uniforms.picture,0);gl.uniform1i(uniforms.masks,1);gl.uniform1i(uniforms.smoothPicture,2);
    canvas.hidden=true;canvas.dataset.pictureDetail='water-detail';
    const detailImages=[...img.parentElement.querySelectorAll('.scene-detail-tile img')];
    img.after(canvas);
    let cancelWorker=()=>{},updating=null,resizeTimer=0,resizeQueued=false,textureWidth=0;
    const waitImage=image=>new Promise((resolve,reject)=>{
      let timer;
      const done=()=>{clearTimeout(timer);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);};
      const failed=()=>{done();reject(Error('water image'));};
      const loaded=()=>{done();(image.decode?image.decode():Promise.resolve()).then(()=>resolve(image),reject);};
      if(image.complete){image.naturalWidth?loaded():failed();return;}
      image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
      timer=setTimeout(failed,30000);
    });
    async function inputs(bitmap) {
      const mask=new Image();mask.decoding='async';mask.src=img.dataset.water;
      await Promise.all([img,...detailImages,mask].map(waitImage));
      const displayWidth=img.getBoundingClientRect().width;
      const {width,height}=textureSize(img.naturalWidth,img.naturalHeight,displayWidth,devicePixelRatio,textureLimit);
      const allocated=[];let aborted=false;
      const convert=async image=>{
        if(!bitmap)return image;
        const result=await createImageBitmap(image);
        if(aborted){result.close();throw Error('water bitmap cancelled');}
        allocated.push(result);return result;
      };
      try {
      const details=await Promise.all(detailImages.filter(detail=>detail.naturalWidth).map(async detail=>{
        const tile=detail.parentElement,stage=tile.parentElement;
        return {image:await convert(detail),stageWidth:parseFloat(stage.style.width),stageHeight:parseFloat(stage.style.height),
          pose:tile.dataset.pose?.split(',').map(Number),polygon:tile.dataset.polygon?JSON.parse(tile.dataset.polygon):null,
          left:parseFloat(tile.style.left),top:parseFloat(tile.style.top),width:parseFloat(tile.style.width),height:parseFloat(tile.style.height)};
      }));
      return {width,height,displayWidth,image:await convert(img),mask:await convert(mask),details};
      } catch(error) {aborted=true;allocated.forEach(image=>image.close());throw error;}
    }
    async function prepare() {
      const started=performance.now(),src=img.currentSrc||img.src;
      let prepared;
      try {
        if(!workerURL||typeof Worker==='undefined'||typeof createImageBitmap==='undefined')throw Error('worker unavailable');
        prepared=await new Promise((resolve,reject)=>{
          const worker=new Worker(sourceURL(workerURL,document.baseURI));
          let active=true;
          const timer=setTimeout(()=>{finish();reject(Error('water worker timeout'));},30000);
          const finish=()=>{active=false;clearTimeout(timer);worker.terminate();cancelWorker=()=>{};};
          cancelWorker=()=>{finish();reject(Error('water disposed'));};
          worker.onmessage=event=>{finish();event.data.error?reject(Error('water preparation')):resolve(event.data);};
          worker.onerror=event=>{event.preventDefault();finish();reject(Error('water worker'));};
          inputs(true).then(data=>{
            if(dead||!active){finish();for(const image of [data.image,data.mask,...data.details.map(d=>d.image)])image.close();reject(Error('water disposed'));return;}
            const images=[data.image,data.mask,...data.details.map(d=>d.image)];
            try {worker.postMessage({environmentURL,data},images);}
            catch(error){images.forEach(image=>image.close());throw error;}
          }).catch(error=>{finish();reject(error);});
        });
        canvas.dataset.preparation='worker';
      } catch {
        if(dead)return;
        const data=await inputs(false);
        if(dead)return;
        prepared=await prepareTextures(data,(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},async()=>{await new Promise(resolve=>setTimeout(resolve,0));if(dead)throw Error('water disposed');});
        canvas.dataset.preparation='cooperative';
      }
      const {source,smooth,pixels,maskWidth:mw,maskHeight:mh}=prepared;
      try {
        if(dead||gl.isContextLost())return;
        for(const [unit,tex,picture]of [[gl.TEXTURE0,texture,source],[gl.TEXTURE2,smoothTexture,smooth]]) {
          gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,picture);
        }
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,mw,mh,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        for(const [key,value]of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,key,value);
        for(let p=0;p<pixels.length;p+=4)if(pixels[p]>128&&pixels[p+2]>32&&pixels[p+2]<96){fishingWater=true;break;}
        maskWidth=mw;maskHeight=mh;maskReady=true;ready=true;uploaded=src;
        canvas.dataset.swellCount=String(fishingWater?swellCount:0);
        canvas.dataset.textureSize=`${source.width}x${source.height}`;
        textureWidth=source.width;
      } finally {
        source.close?.();smooth.close?.();gl.activeTexture(gl.TEXTURE0);
        performance.measure('manor-water-preparation',{start:started,end:performance.now()});
      }
    }
    function updateTexture(){
      updating=prepare().catch(()=>{if(!ready){canvas.hidden=true;canvas.dataset.preparation='static';}}).finally(()=>{updating=null;if(!dead&&resizeQueued){resizeQueued=false;queueResize();}});
      return updating;
    }
    function queueResize(){
      clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
        if(dead)return;
        if(updating){resizeQueued=true;return;}
        if(!ready)return;
        const size=textureSize(img.naturalWidth,img.naturalHeight,img.getBoundingClientRect().width,devicePixelRatio,textureLimit);
        // Keep the working water visible while a larger/retina texture is prepared.
        if(size.width>textureWidth*1.15)updateTexture();
      },180);
    }
    const preparation=updateTexture();
    if(typeof GardenStartup!=='undefined')GardenStartup.track(preparation);
    const sizeObserver=new ResizeObserver(queueResize);sizeObserver.observe(img);window.addEventListener('resize',queueResize);
    const observer=new IntersectionObserver(([e])=>visible=e.isIntersecting);observer.observe(img);
    function draw(now){
      raf=requestAnimationFrame(draw);
      if(dead || !ready || !visible || document.hidden || now-last<33)return;
      const display=img.getBoundingClientRect();
      const {width:w,height:h}=renderSize(display.width,display.height,devicePixelRatio,limit);
      if(reduced.matches){canvas.hidden=true;return;}
      if(img.currentSrc!==uploaded){canvas.hidden=true;return;}
      // A calibrated scene must wait for its matching mask, never flash guessed water bands.
      if(!maskReady){canvas.hidden=true;return;}
      canvas.hidden=false;
      if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      gl.uniform2f(uniforms.maskPixels,maskWidth,maskHeight);
      gl.uniform4fv(uniforms.waves,swells.update(now/1000));
      gl.uniform2f(uniforms.pixels,Math.max(1,display.width),Math.max(1,display.height));
      gl.drawArrays(gl.TRIANGLES,0,6);last=now;canvas.dataset.surface='garden';canvas.dataset.frame=String(Math.round(now));canvas.dataset.precision=precision;canvas.dataset.waterMotion=fishingWater?'gentle-wind-waves':'coherent-wind-waves';
    }
    const lost=e=>{e.preventDefault();ready=false;canvas.hidden=true;};canvas.addEventListener('webglcontextlost',lost);
    raf=requestAnimationFrame(draw);
    return ()=>{dead=true;cancelAnimationFrame(raf);observer.disconnect();sizeObserver.disconnect();window.removeEventListener('resize',queueResize);clearTimeout(resizeTimer);cancelWorker();gl.deleteTexture(texture);gl.deleteTexture(smoothTexture);gl.deleteTexture(maskTexture);gl.deleteBuffer(buffer);gl.deleteProgram(program);canvas.remove();};
  }
  function mount(scene){
    if(current?.scene===scene)return;
    current?.destroy();current=null;
    if(!scene || location.protocol==='file:')return;
    const dispose=[...scene.querySelectorAll('.garden-backdrop')].map(img=>layer(img));
    current={scene,destroy:()=>dispose.forEach(fn=>fn())};
  }
  return {mount,renderSize,textureSize,shorelineMask,surfaceMask,swellField,prepareTextures,sourceURL};
})();
if(typeof module!=="undefined") module.exports=GardenEnvironment;
