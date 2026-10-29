/* Progress counts real decoded scene resources and completed preparation tasks.
   A timeout is an error, never permission to uncover an unfinished scene. */
// Boot images and the scene layout share one rule, so a portrait tablet never
// downloads the desktop composition before switching to the mobile one.
function manorMobileLayout(){return document.documentElement.classList.contains('force-mobile')||new URLSearchParams(location.search).get('renderProfile')==='mobile'||innerWidth<=700||innerWidth<=1100&&innerHeight>innerWidth;}
const GardenStartup=(()=>{
  document.documentElement.classList.add('garden-booting');
  document.documentElement.dataset.startupPhase='resources';
  const params=new URLSearchParams(location.search),nonce=params.get('bridge');
  const embedded=Boolean(nonce&&parent!==window);
  const notify=(action,payload={})=>{if(embedded)parent.postMessage({type:'lightnote-manor',nonce,id:0,action,payload},location.origin);};
  // Keep immutable public image URLs in the host document, whose lifetime spans
  // scene visits. Child-created blob URLs die with the iframe and defeat the
  // browser's decoded-image cache even when the HTTP response was cached.
  let sharedImages=null;
  try {if(embedded&&params.get('loader')==='host'&&parent.location.origin===location.origin)
    sharedImages=parent.__LIGHTNOTE_MANOR_IMAGES_V1__||=new parent.Map();}catch{}
  const heldImages=new Map();let cachedAssets=0;
  function trimSharedImages(){
    if(!sharedImages)return;
    let bytes=[...sharedImages.values()].reduce((sum,entry)=>sum+entry.bytes,0);
    for(const [key,entry]of [...sharedImages].sort((a,b)=>a[1].used-b[1].used)){
      if(sharedImages.size<=48&&bytes<=12*1024*1024)break;
      if(!entry.refs){sharedImages.delete(key);parent.URL.revokeObjectURL(entry.url);bytes-=entry.bytes;}
    }
  }
  function holdImage(key,entry){
    if(heldImages.get(key)!==entry){
      const previous=heldImages.get(key);if(previous)previous.refs=Math.max(0,previous.refs-1);
      heldImages.set(key,entry);entry.refs++;
    }
    entry.used=Date.now();return entry.url;
  }
  window.addEventListener?.('pagehide',event=>{
    if(event.persisted)return;
    for(const entry of heldImages.values())entry.refs=Math.max(0,entry.refs-1);
    heldImages.clear();trimSharedImages();
  },{once:true});
  const el=document.createElement('div');el.className='garden-loader';
  // Embedded scenes report progress to the one host cover; standalone previews keep their own.
  if(embedded&&params.get('loader')==='host')el.style.display='none';
  el.setAttribute('role','progressbar');el.setAttribute('aria-label','正在载入知识庄园');
  el.setAttribute('aria-valuemin','0');el.setAttribute('aria-valuemax','100');
  el.setAttribute('aria-valuenow','0');
  el.innerHTML='<div class="garden-loader-card"><div class="garden-loader-sprout" aria-hidden="true"></div><p>正在载入庄园</p><div class="garden-loader-bar"><i></i></div><small>0% · 正在准备场景，请稍候</small></div>';
  const loadingIcon=JSON.parse(document.getElementById('manor-icon-assets')?.textContent||'{}').loading;
  if(loadingIcon){const crest=document.createElement('img');crest.src=loadingIcon;crest.alt='';el.querySelector('.garden-loader-sprout').append(crest);}
  document.body.append(el);
  const title=el.querySelector('p'),bar=el.querySelector('i'),label=el.querySelector('small');
  const work=[],images=new Map(),assetUrls=new Map(),downloads=new Map(),deferred=[];let finished=false,failed=false,mounted=false,readiness=null,completed=0,total=0,assetDone=0,assetTotal=0,assetBytes=0,assetController=null,boot=null;
  let cancel;const cancelled=new Promise(resolve=>{cancel=resolve;});
  // Notify after layout; the embedded host keeps its cover until ready.
  requestAnimationFrame(()=>requestAnimationFrame(()=>notify('loading')));
  function fail(){
    if(finished||failed)return;
    failed=true;assetController?.abort();deferred.length=0;clearTimeout(timer);document.removeEventListener('visibilitychange',arm);cancel(false);title.textContent='场景未能载入';label.textContent='请重试或返回轻笺';notify('load-error');
  }
  // Background tabs and a locked screen suspend rendering, not scene progress.
  let timer;
  function arm(){clearTimeout(timer);if(!finished&&!failed&&!document.hidden)timer=setTimeout(fail,30000);}
  document.addEventListener('visibilitychange',arm);arm();
  // One fetch and one decoded URL per critical image. CSS, DOM and WebGL share
  // that URL even with the HTTP cache disabled, rather than downloading again
  // when the readiness check creates another Image for a CSS background.
  async function loadAssets(paths,startup=false){
    await Promise.all(paths.map(async entry=>{
      const descriptor=typeof entry==='string'?{src:entry}:entry;
      const candidates=descriptor.srcset?.split(',').map(value=>{
        const [src,width]=value.trim().split(/\s+/);return {src,width:parseInt(width,10)};
      });
      const pixels=innerWidth*(devicePixelRatio||1);
      const source=candidates?.find(candidate=>candidate.width>=pixels)?.src||candidates?.at(-1)?.src||descriptor.src;
      const original=new URL(source,document.baseURI);
      if(original.origin!==location.origin||!original.pathname.startsWith('/manor/'))throw Error('scene asset URL');
      if(!downloads.has(original.href)){
        const task=(async()=>{
          // Unversioned art stays on the existing HTTP request path. Never
          // retain API responses, account data, or arbitrary query URLs here.
          const reusable=sharedImages&&!original.search&&/-r\d+(?:-\d+)?\.(webp|png|svg)$/i.test(original.pathname);
          const cached=reusable&&sharedImages.get(original.href);
          if(cached){
            const objectUrl=holdImage(original.href,cached);assetUrls.set(original.href,objectUrl);
            try {await image(objectUrl);}catch(error){
              if(sharedImages.get(original.href)===cached){sharedImages.delete(original.href);parent.URL.revokeObjectURL(objectUrl);}
              throw error;
            }
            if(startup){assetBytes+=cached.bytes;document.documentElement.dataset.assetBytes=String(assetBytes);document.documentElement.dataset.cachedAssets=String(++cachedAssets);}
            return objectUrl;
          }
          const response=await fetch(original.href,{signal:assetController.signal,cache:'force-cache',credentials:'omit',priority:descriptor.priority||'auto'});
          if(!response.ok)throw Error('scene asset response');
          const blob=await response.blob();
          if(!blob.type.startsWith('image/'))throw Error('scene asset type');
          if(assetController.signal.aborted)throw Error('scene cancelled');
          if(startup){assetBytes+=blob.size;document.documentElement.dataset.assetBytes=String(assetBytes);}
          const objectUrl=reusable?parent.URL.createObjectURL(blob):URL.createObjectURL(blob);
          if(reusable){
            // Parent-realm records do not keep a discarded iframe's globals alive.
            const entry=parent.Object.assign(parent.Object.create(null),{url:objectUrl,bytes:blob.size,refs:0,used:Date.now()});
            sharedImages.set(original.href,entry);holdImage(original.href,entry);trimSharedImages();
          }
          assetUrls.set(original.href,objectUrl);
          try {await image(objectUrl);}catch(error){
            if(reusable&&sharedImages.get(original.href)?.url===objectUrl){sharedImages.delete(original.href);parent.URL.revokeObjectURL(objectUrl);}
            throw error;
          }
          return objectUrl;
        })();
        downloads.set(original.href,task);
        task.catch(()=>downloads.delete(original.href));
      }
      const objectUrl=await downloads.get(original.href);
      await image(objectUrl);
      if(descriptor.variable)document.documentElement.style.setProperty(descriptor.variable,`url("${objectUrl}")`);
      if(startup){
        if(descriptor.priority==='high')document.documentElement.dataset.sceneSource=original.pathname;
        assetDone++;if(!failed){tick();arm();}
      }
    }));
  }
  const assetsReady=(async()=>{
    const started=performance.now();
    const manifest=document.getElementById('manor-boot-images');
    if(!manifest)return true;
    boot=JSON.parse(manifest.textContent);
    const paths=boot[manorMobileLayout()?'mobile':'desktop'];
    assetTotal=paths.length;assetController=new AbortController();tick();
    window.addEventListener?.('pagehide',event=>{if(!event.persisted)assetController.abort();},{once:true});
    await loadAssets(paths,true);
    performance.measure?.('manor-assets-preparation',{start:started,end:performance.now()});return true;
  })().catch(()=>{fail();return false;});
  function prepareArea(area,background=false){
    if(area!=='garden'&&area!=='bay')return null;
    const paths=boot?.[area==='bay'?'mobileBay':'mobile'];
    return paths?loadAssets([...paths,...(boot.curtain||[])].map(entry=>background?{...entry,priority:'low'}:entry)).then(()=>true,()=>false):null;
  }
  function tick(){
    const progress=total?completed/total:0;
    const percent=Math.floor(assetTotal?(assetDone+progress)/(assetTotal+1)*100:100*progress);
    bar.style.width=percent+'%';label.textContent=`${percent}% · ${percent===100?'庄园准备好了，欢迎回来':percent<70?'正在准备场景，请稍候':'正在收拾最后的小细节，请稍候'}`;
    el.setAttribute('aria-valuenow',String(percent));
    notify('progress',{percent});
  }
  function image(url){
    const path=new URL(assetUrl(url),document.baseURI).href;
    if(images.has(path))return images.get(path);
    const promise=new Promise((resolve,reject)=>{
      const img=new Image();img.decoding='async';
      img.onload=()=>{(img.decode?img.decode():Promise.resolve()).then(()=>resolve(img),reject);};
      img.onerror=()=>reject(Error('scene image'));img.src=path;
    });
    images.set(path,promise);return promise;
  }
  function assetUrl(path){
    return assetUrls.get(new URL(path,document.baseURI).href)||path;
  }
  function html(markup){
    return markup
      .replace(/\b(src|href|data-water|data-smooth)="([^"]+)"/g,(match,name,path)=>{
        const resolved=assetUrl(path);return resolved===path?match:`${name}="${resolved}"`;
      })
      .replace(/\bsrcset="([^"]+)"/g,(_match,value)=>`srcset="${value.split(',').map(source=>{
        const [path,size]=source.trim().split(/\s+/);return `${assetUrl(path)} ${size}`;
      }).join(', ')}"`)
      .replace(/url\(["']?([^"')]+)["']?\)/g,(match,path)=>{
        const resolved=assetUrl(path);return resolved===path?match:`url("${resolved}")`;
      });
  }
  function displayedImage(img){
    return new Promise((resolve,reject)=>{
      const done=()=>{img.removeEventListener('load',loaded);img.removeEventListener('error',error);};
      const error=()=>{done();reject(Error('displayed image'));};
      const loaded=()=>{done();(img.decode?img.decode():Promise.resolve()).then(resolve,reject);};
      if(img.complete){img.naturalWidth?loaded():error();return;}
      img.addEventListener('load',loaded,{once:true});img.addEventListener('error',error,{once:true});
    });
  }
  function sources(){
    const urls=new Set(),displayed=[];
    for(const root of [document.getElementById('app'),document.getElementById('modal')].filter(Boolean)) {
      for(const img of root.querySelectorAll('img, image')) {
        if(!img.getClientRects().length)continue;
        if(img.localName==='img')displayed.push(displayedImage(img));
        else urls.add(img.getAttribute('href')||img.getAttribute('xlink:href'));
      }
      for(const node of root.querySelectorAll('div,span,button')) {
        if(!node.getClientRects().length)continue;
        const style=getComputedStyle(node);
        for(const value of [style.backgroundImage||'',style.maskImage||style.webkitMaskImage||''])for(const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g))urls.add(match[1]);
      }
    }
    return [...displayed,...[...urls].filter(url=>url&&!url.startsWith('data:')&&!url.startsWith('blob:')).map(url=>image(url))];
  }
  function ready(){return readiness||(readiness=prepare());}
  async function prepare(){
    if(finished)return true;
    if(failed)return false;
    try {
      if(!mounted||!document.querySelector('.garden-scene'))throw Error('scene initialization');
      if([...document.querySelectorAll('link[rel="stylesheet"]')].some(link=>!link.sheet))throw Error('scene stylesheet');
      if(assetTotal&&!await assetsReady)return false;
      const tasks=[...sources(),...work];total=tasks.length+1;
      document.documentElement.dataset.startupPhase='scene';
      tick();
      const prepared=Promise.all(tasks.map(task=>Promise.resolve(task).then(()=>{completed++;if(!failed){tick();arm();}}))).then(()=>true);
      if(!await Promise.race([prepared,cancelled]))return false;
      if(failed)return false;
      title.textContent='场景已就绪';
      document.documentElement.classList.remove('garden-booting');
      document.documentElement.dataset.startupPhase='frame';
      // Layout, decoded art and event handlers must all be ready before exposing the guide.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(failed)return false;
      completed++;tick();finished=true;clearTimeout(timer);document.removeEventListener('visibilitychange',arm);images.clear();work.length=0;
      performance.mark('manor-interactive');
      document.documentElement.dataset.startupPhase='interactive';
      document.documentElement.dataset.startupMs=String(Math.round(performance.now()));
      notify('ready');
      el.classList.add('leaving');el.style.pointerEvents='none';
      setTimeout(()=>el.remove(),450);
      deferred.splice(0).forEach(run=>run());
      return true;
    } catch {fail();return false;}
  }
  function afterReady(run,{idle=true}={}){
    const schedule=()=>{
      if(idle&&typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:1000});
      else setTimeout(run,0);
    };
    if(finished)schedule();else if(!failed)deferred.push(schedule);
  }
  return {image,url:assetUrl,html,assetsReady,prepareArea,afterReady,mounted:()=>{mounted=true;},track:promise=>{if(!finished&&!failed)work.push(promise);return promise;},ready,fail};
})();
if(typeof module!=='undefined')module.exports=GardenStartup;
