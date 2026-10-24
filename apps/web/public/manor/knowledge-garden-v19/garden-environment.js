/* 钓鱼区叠加连续的舒缓风浪与碎浪边；其余水面保留原画水纹输送，岸边与物件固定。
   仅在可见且未开启减少动态时运行；纹理失败或 WebGL 丢失时保留原图。 */
const GardenEnvironment = (() => {
  let current=null;
  // 匹配高分屏，统一限制总像素和 GPU 尺寸，避免大屏糊成低分辨率画布。
  function renderSize(width,height,dpr=1,limit=4096) {
    const w=Math.max(1,width),h=Math.max(1,height);
    const scale=Math.min(Math.max(1,dpr),2,limit/w,limit/h,Math.sqrt(8294400/(w*h)));
    return {width:Math.max(1,Math.floor(w*scale)),height:Math.max(1,Math.floor(h*scale))};
  }
  // Alpha stores distance to dry land for both sea (R) and tank surface (G).
  function shorelineMask(rgba,width,height) {
    const out=new Uint8Array(rgba),distance=new Float32Array(width*height),diagonal=Math.SQRT2;
    const sea=i=>(rgba[i*4]>128||rgba[i*4+1]>128)&&rgba[i*4+2]<128;
    for(let i=0;i<distance.length;i++){distance[i]=sea(i)?32:0;out[i*4+3]=0;}
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(!distance[i])continue;
      if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
      if(y){distance[i]=Math.min(distance[i],distance[i-width]+1);
        if(x)distance[i]=Math.min(distance[i],distance[i-width-1]+diagonal);
        if(x+1<width)distance[i]=Math.min(distance[i],distance[i-width+1]+diagonal);
      }
    }
    for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
      const i=y*width+x;if(!distance[i])continue;
      if(x+1<width)distance[i]=Math.min(distance[i],distance[i+1]+1);
      if(y+1<height){distance[i]=Math.min(distance[i],distance[i+width]+1);
        if(x)distance[i]=Math.min(distance[i],distance[i+width-1]+diagonal);
        if(x+1<width)distance[i]=Math.min(distance[i],distance[i+width+1]+diagonal);
      }
      out[i*4+3]=Math.round(distance[i]/32*255);
    }
    return out;
  }
  // Only classify water inside the calibrated polygons. Bright native wave crests
  // inherit adjacent blue water; vegetation, boats and rock holes remain dry.
  function surfaceMask(categories,scene,width,height,radius=2) {
    const out=new Uint8Array(categories),blue=new Uint8Array(width*height);
    for(let i=0;i<blue.length;i++) {
      const p=i*4,r=scene[p],g=scene[p+1],b=scene[p+2];
      blue[i]=b-r>12&&g-r>6&&b>g*.85&&g>40?1:0;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const i=y*width+x,p=i*4;
      if(out[p+1]>128&&out[p]<128&&out[p+2]<128)continue;
      if(out[p]<128||out[p+1]>128||out[p+2]>128)continue;
      let wet=!!blue[i];
      if(!wet&&scene[p]>140&&scene[p+1]>150&&scene[p+2]>105) {
        for(let dy=-radius;dy<=radius&&!wet;dy++)for(let dx=-radius;dx<=radius;dx++) {
          const xx=x+dx,yy=y+dy;
          if(xx>=0&&xx<width&&yy>=0&&yy<height&&blue[yy*width+xx]){wet=true;break;}
        }
      }
      if(!wet)out[p]=out[p+1]=out[p+2]=0;
    }
    return shorelineMask(out,width,height);
  }
  // Continuous drift preserves the painted wave contrast; no crossfade between shifted copies.
  function flowOffset(seconds) {
    const t=(Math.max(0,seconds)%12)/12*Math.PI*2;
    const x=.42*Math.sin(t)+.08*Math.sin(t*2+.65);
    return [x,.10*Math.cos(t)+.045*Math.sin(t*3)+x*.18];
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
    uniform vec2 flowOffset;
    uniform vec2 pixels, maskPixels;
    uniform vec4 waves[SWELL_COUNT];
    vec3 windWaves(vec2 point){
      vec2 q=point*pixels*vec2(1.,2.6);
      vec2 slope=vec2(0.);
      float foam=0.;
      for(int i=0;i<SWELL_COUNT;i++){
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
      float water=clamp(m.r+m.g,0.,1.);
      if(water<.01){gl_FragColor=vec4(0.);return;}
      float shoreDistance=m.a*32.*pixels.x/maskPixels.x;
      if(m.r>.5&&m.b>.1&&m.b<.5){
        float edge=smoothstep(2.,6.,shoreDistance);
        vec3 surface=windWaves(uv);
        vec2 slope=surface.xy*edge;
        vec2 bend=clamp(slope*4.,vec2(-1.1),vec2(1.1))/pixels;
        // Refract only fine detail: submerged rocks and the broad seabed remain fixed.
        vec3 color=texture2D(picture,uv+bend).rgb;
        color+=texture2D(smoothPicture,uv).rgb-texture2D(smoothPicture,uv+bend).rgb;
        float shade=clamp(dot(slope,vec2(.46,-.88))*.68,-.13,.15);
        color*=1.+shade;
        color=mix(color,vec3(.86,.97,.98),min(.52,surface.z)*edge);
        gl_FragColor=vec4(clamp(color,0.,1.),water*edge);return;
      }
      float edge=smoothstep(7.,10.,shoreDistance);
      // Transport complete ripples on the distant sea and tank surface. Near the
      // pier, keep the broad seabed fixed and move only its fine water texture.
      float near=smoothstep(.32,.85,uv.y);
      float reach=mix(mix(22.,28.,near),12.,m.g);
      reach=min(reach,max(0.,shoreDistance-7.)*1.5);
      vec2 flow=flowOffset*reach/pixels;
      float quietBed=smoothstep(.38,.68,uv.y)*(1.-m.g);
      vec3 color=texture2D(picture,uv-flow).rgb;
      if(quietBed>0.)color+=(texture2D(smoothPicture,uv).rgb-texture2D(smoothPicture,uv-flow).rgb)*quietBed;
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
    let program,texture,smoothTexture,maskTexture,buffer,pictureCanvas=null,fishingWater=false,raf=0,ready=false,dead=false,visible=true,last=0,uploaded='',maskReady=false,maskSrc='',maskWidth=1,maskHeight=1;
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
        for(const [key,value] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,key,value);
      }
    }catch{gl.deleteProgram(program);gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteTexture(smoothTexture);gl.deleteTexture(maskTexture);return ()=>{};}
    const uniforms={};for(const n of ['picture','smoothPicture','masks','flowOffset','pixels','maskPixels'])uniforms[n]=gl.getUniformLocation(program,n);
    uniforms.waves=gl.getUniformLocation(program,'waves[0]');
    gl.uniform1i(uniforms.picture,0);gl.uniform1i(uniforms.masks,1);gl.uniform1i(uniforms.smoothPicture,2);
    canvas.hidden=true;canvas.dataset.pictureDetail='water-detail';
    const detailImages=[...img.parentElement.querySelectorAll('.scene-detail-tile img')];
    // 水域遮罩跟着底图走（data-water），换端型时重新载入
    function loadMask(){
      const src=img.dataset.water||'';
      if(src===maskSrc)return;
      maskSrc=src;maskReady=false;
      if(!src)return;
      const mi=new Image();
      mi.onload=()=>{
        if(dead||maskSrc!==src)return;
        try{
          const field=document.createElement('canvas');field.width=Math.min(1536,mi.naturalWidth);field.height=Math.max(1,Math.round(mi.naturalHeight*field.width/mi.naturalWidth));
          const ctx=field.getContext('2d');ctx.drawImage(mi,0,0,field.width,field.height);
          const categories=ctx.getImageData(0,0,field.width,field.height).data;
          ctx.clearRect(0,0,field.width,field.height);ctx.drawImage(pictureCanvas,0,0,field.width,field.height);
          const radius=Math.max(1,Math.min(8,Math.ceil(field.width/Math.max(1,img.getBoundingClientRect().width)*1.75)));
          const pixels=surfaceMask(categories,ctx.getImageData(0,0,field.width,field.height).data,field.width,field.height,radius);
          fishingWater=false;
          for(let p=0;p<pixels.length;p+=4)if(pixels[p]>128&&pixels[p+2]>32&&pixels[p+2]<96){fishingWater=true;break;}
          canvas.dataset.swellCount=String(fishingWater?swellCount:0);
          gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTexture);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,field.width,field.height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          for(const [key,value] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])gl.texParameteri(gl.TEXTURE_2D,key,value);
          maskWidth=field.width;maskHeight=field.height;maskReady=true;
        }catch{maskReady=false;}
        finally{gl.activeTexture(gl.TEXTURE0);}
      };
      mi.src=src;
    }
    function upload(){
      if(dead || !img.complete || !img.naturalWidth || detailImages.some(detail=>!detail.complete))return;
      try{
        // Compose the same aligned native plates as the DOM, then split off fine water detail.
        const source=document.createElement('canvas');
        const targetWidth=Math.max(img.naturalWidth,img.getBoundingClientRect().width*Math.min(2,devicePixelRatio));
        const targetHeight=targetWidth*img.naturalHeight/img.naturalWidth;
        source.width=Math.min(textureLimit,2**Math.ceil(Math.log2(targetWidth)));
        source.height=Math.min(textureLimit,2**Math.ceil(Math.log2(targetHeight)));
        const ctx=source.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,source.width,source.height);
        for(const detail of detailImages)if(detail.naturalWidth) {
          const tile=detail.parentElement,stage=tile.parentElement;
          const sx=source.width/parseFloat(stage.style.width),sy=source.height/parseFloat(stage.style.height);
          if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;
          if(tile.dataset.pose) {
            const [a,b,c,d,e,f]=tile.dataset.pose.split(',').map(Number),poly=JSON.parse(tile.dataset.polygon);
            const plate=document.createElement('canvas');plate.width=detail.naturalWidth;plate.height=detail.naturalHeight;
            const pc=plate.getContext('2d');pc.drawImage(detail,0,0);pc.globalCompositeOperation='destination-in';
            for(const horizontal of [true,false]) {
              const gradient=pc.createLinearGradient(0,0,horizontal?plate.width:0,horizontal?0:plate.height);
              gradient.addColorStop(0,'transparent');gradient.addColorStop(horizontal ? .04 : .05,'black');gradient.addColorStop(horizontal ? .96 : .95,'black');gradient.addColorStop(1,'transparent');
              pc.fillStyle=gradient;pc.fillRect(0,0,plate.width,plate.height);
            }
            ctx.save();ctx.beginPath();poly.forEach(([x,y],i)=>i?ctx.lineTo(x*sx,y*sy):ctx.moveTo(x*sx,y*sy));ctx.closePath();ctx.clip();
            ctx.transform(a*sx,b*sy,c*sx,d*sy,e*sx,f*sy);ctx.drawImage(plate,0,0);ctx.restore();
          } else ctx.drawImage(detail,parseFloat(tile.style.left)*sx,parseFloat(tile.style.top)*sy,parseFloat(tile.style.width)*sx,parseFloat(tile.style.height)*sy);
        }
        const smooth=document.createElement('canvas');smooth.width=source.width;smooth.height=source.height;
        const sc=smooth.getContext('2d');sc.filter=`blur(${4.25*source.width/Math.max(1,img.getBoundingClientRect().width)}px)`;sc.drawImage(source,0,0);
        for(const [unit,tex,picture]of [[gl.TEXTURE0,texture,source],[gl.TEXTURE2,smoothTexture,smooth]]) {
          gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,picture);gl.generateMipmap(gl.TEXTURE_2D);
        }
        gl.activeTexture(gl.TEXTURE0);pictureCanvas=source;
        loadMask();
        uploaded=img.currentSrc;ready=true;canvas.hidden=!maskReady;
      }
      catch{ready=false;canvas.hidden=true;}
    }
    img.addEventListener('load',upload);detailImages.forEach(detail=>{detail.addEventListener('load',upload);detail.addEventListener('error',upload);});upload();img.after(canvas);
    const observer=new IntersectionObserver(([e])=>visible=e.isIntersecting);observer.observe(img);
    function draw(now){
      raf=requestAnimationFrame(draw);
      if(dead || !ready || !visible || document.hidden || now-last<33)return;
      const display=img.getBoundingClientRect();
      const {width:w,height:h}=renderSize(display.width,display.height,devicePixelRatio,limit);
      if(reduced.matches){canvas.hidden=true;return;}
      if(img.currentSrc!==uploaded){canvas.hidden=true;return;}
      loadMask();
      // A calibrated scene must wait for its matching mask, never flash guessed water bands.
      if(!maskReady){canvas.hidden=true;return;}
      canvas.hidden=false;
      if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      gl.uniform2f(uniforms.maskPixels,maskWidth,maskHeight);
      gl.uniform4fv(uniforms.waves,swells.update(now/1000));
      gl.uniform2f(uniforms.flowOffset,...flowOffset(now/1000));gl.uniform2f(uniforms.pixels,Math.max(1,display.width),Math.max(1,display.height));
      gl.drawArrays(gl.TRIANGLES,0,6);last=now;canvas.dataset.surface='garden';canvas.dataset.frame=String(Math.round(now));canvas.dataset.precision=precision;canvas.dataset.waterMotion=fishingWater?'gentle-wind-waves':'native-wave-flow';
    }
    const lost=e=>{e.preventDefault();ready=false;canvas.hidden=true;};canvas.addEventListener('webglcontextlost',lost);
    raf=requestAnimationFrame(draw);
    return ()=>{dead=true;cancelAnimationFrame(raf);observer.disconnect();img.removeEventListener('load',upload);detailImages.forEach(detail=>{detail.removeEventListener('load',upload);detail.removeEventListener('error',upload);});gl.deleteTexture(texture);gl.deleteTexture(smoothTexture);gl.deleteTexture(maskTexture);gl.deleteBuffer(buffer);gl.deleteProgram(program);canvas.remove();};
  }
  function mount(scene){
    if(current?.scene===scene)return;
    current?.destroy();current=null;
    if(!scene || location.protocol==='file:')return;
    const dispose=[...scene.querySelectorAll('.garden-backdrop')].map(img=>layer(img));
    current={scene,destroy:()=>dispose.forEach(fn=>fn())};
  }
  return {mount,renderSize,shorelineMask,surfaceMask,flowOffset,swellField};
})();
if(typeof module!=="undefined") module.exports=GardenEnvironment;
