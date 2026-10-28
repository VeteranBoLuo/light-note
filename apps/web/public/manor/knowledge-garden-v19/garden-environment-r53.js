/* 海面与钓鱼区共用连续风浪；鱼舱顶面保持原画静态，岸边与物件固定。
   仅在可见且未开启减少动态时运行；纹理失败或 WebGL 丢失时保留原图。 */
const GardenEnvironment = (() => {
  let current=null;
  // 匹配高分屏，统一限制总像素和 GPU 尺寸，避免大屏糊成低分辨率画布。
  function renderSize(width,height,dpr=1,limit=4096) {
    const w=Math.max(1,width),h=Math.max(1,height);
    const scale=Math.min(Math.max(1,dpr),2,limit/w,limit/h,Math.sqrt(8294400/(w*h)));
    return {width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale))};
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
        if(i>=6&&distant>.5)break;
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
      vec2 bend=clamp(slope*mix(4.,8.,distant),vec2(-2.2),vec2(2.2))/pixels;
      vec3 color=texture2D(picture,uv+bend).rgb;
      // Keep the broad seabed, rocks and reflected scenery fixed.
      color+=texture2D(smoothPicture,uv).rgb-texture2D(smoothPicture,uv+bend).rgb;
      float shade=clamp(dot(slope,vec2(.46,-.88))*mix(.45,.42,distant),-.1,.1);
      color*=1.+shade;
      color=mix(color,vec3(.86,.97,.98),min(.4,surface.z)*mix(.55,.18,distant)*edge);
      // Animate the original foam around pier feet, preserving its painted
      // shape instead of adding expanding circles over the picture.
      float white=smoothstep(.68,.91,dot(color,vec3(.2126,.7152,.0722)));
      color*=1.-white*nativeFoam*clamp(.08-surface.z*.2+dot(slope,vec2(.12,.2)),0.,.14);
      float opacity=water*edge;
      gl_FragColor=vec4(clamp(color,0.,1.)*opacity,opacity);
    }`;
  function layer(img) {
    const canvas=document.createElement('canvas');canvas.className='environment-motion';canvas.setAttribute('aria-hidden','true');
    // Emit premultiplied color explicitly. WebKit's canvas compositor can leave
    // bright mask contours when it has to convert straight-alpha framebuffers.
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true});
    if(!gl)return ()=>{};
    const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision>0?'highp':'mediump';
    const limit=Math.min(4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    const textureLimit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const swellCount=Math.max(1,Math.min(10,gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)-12)),swells=swellField(swellCount);
    let program,texture,smoothTexture,maskTexture,buffer,fishingWater=false,raf=0,ready=false,dead=false,visible=true,last=0,uploaded='',attempted='',preparing=false,maskReady=false,maskWidth=1,maskHeight=1;
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
    img.after(canvas);

    const waitImage=image=>new Promise((resolve,reject)=>{
      let timer;
      const done=()=>{clearTimeout(timer);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);};
      const failed=()=>{done();reject(Error('water image'));};
      const loaded=()=>{done();(image.decode?image.decode():Promise.resolve()).then(()=>resolve(image),reject);};
      if(image.complete){image.naturalWidth?loaded():failed();return;}
      image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
      timer=setTimeout(failed,30000);
    });
    async function prepare() {
      const started=performance.now();
      const mask=new Image(),smooth=new Image();
      const assetUrl=path=>typeof GardenStartup!=="undefined"&&GardenStartup.url?GardenStartup.url(path):path;
      mask.decoding=smooth.decoding='async';mask.src=assetUrl(img.dataset.water);smooth.src=assetUrl(img.dataset.smooth);
      await Promise.all([img,mask,smooth].map(waitImage));
      const fit=image=>{
        const w=image.naturalWidth,h=image.naturalHeight;
        if(Math.max(w,h)<=textureLimit)return image;
        const scale=textureLimit/Math.max(w,h),small=document.createElement('canvas');
        small.width=Math.max(1,Math.floor(w*scale));small.height=Math.max(1,Math.floor(h*scale));
        const ctx=small.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,small.width,small.height);
        return small;
      };
      const source=fit(img),low=fit(smooth),field=fit(mask),mw=field.naturalWidth||field.width,mh=field.naturalHeight||field.height;
      canvas.dataset.preparation='precompiled';
      try {
        if(dead||gl.isContextLost())return;
        for(const [unit,tex,picture]of [[gl.TEXTURE0,texture,source],[gl.TEXTURE2,smoothTexture,low]]) {
          gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,picture);
        }
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,field);
        for(const [key,value]of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,key,value);
        if(gl.getError()!==gl.NO_ERROR)throw Error('water texture');
        fishingWater=img.dataset.fishingWater==='true';
        maskWidth=mw;maskHeight=mh;maskReady=true;ready=true;uploaded=img.currentSrc||img.src;attempted=uploaded;
        canvas.dataset.swellCount=String(fishingWater?swellCount:0);
        canvas.dataset.textureSize=`${source.naturalWidth||source.width}x${source.naturalHeight||source.height}`;
      } finally {
        gl.activeTexture(gl.TEXTURE0);
        performance.measure('manor-water-preparation',{start:started,end:performance.now()});
      }
    }
    async function refresh(){
      preparing=true;attempted=img.currentSrc||img.src;
      try {await prepare();}catch{canvas.hidden=true;canvas.dataset.preparation='static';}
      finally {preparing=false;}
    }
    const preparation=refresh();
    if(typeof GardenStartup!=='undefined')GardenStartup.track(preparation);
    const observer=new IntersectionObserver(([e])=>visible=e.isIntersecting);observer.observe(img);
    function draw(now){
      raf=requestAnimationFrame(draw);
      if(dead || !ready || !visible || document.hidden || now-last<33)return;
      const display=img.getBoundingClientRect();
      const {width:w,height:h}=renderSize(display.width,display.height,devicePixelRatio,limit);
      if(reduced.matches){canvas.hidden=true;return;}
      if(img.currentSrc!==uploaded){
        canvas.hidden=true;
        if(!preparing&&img.currentSrc&&img.currentSrc!==attempted)void refresh();
        return;
      }
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
    return ()=>{dead=true;cancelAnimationFrame(raf);observer.disconnect();gl.deleteTexture(texture);gl.deleteTexture(smoothTexture);gl.deleteTexture(maskTexture);gl.deleteBuffer(buffer);gl.deleteProgram(program);canvas.remove();};
  }
  function mount(scene){
    if(current?.scene===scene)return;
    current?.destroy();current=null;
    if(!scene || location.protocol==='file:')return;
    const dispose=[...scene.querySelectorAll('.garden-backdrop')].map(img=>layer(img));
    current={scene,destroy:()=>dispose.forEach(fn=>fn())};
  }
  return {mount,renderSize,swellField};
})();
if(typeof module!=="undefined") module.exports=GardenEnvironment;
