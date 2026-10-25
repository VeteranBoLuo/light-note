/* Progress counts real decoded scene resources and completed preparation tasks.
   A timeout is an error, never permission to uncover an unfinished scene. */
const GardenStartup=(()=>{
  document.documentElement.classList.add('garden-booting');
  const nonce=new URLSearchParams(location.search).get('bridge');
  const notify=(action)=>{if(nonce&&parent!==window)parent.postMessage({type:'lightnote-manor',nonce,id:0,action},location.origin);};
  const el=document.createElement('div');el.className='garden-loader';
  el.setAttribute('role','progressbar');el.setAttribute('aria-label','正在载入知识庄园');
  el.setAttribute('aria-valuemin','0');el.setAttribute('aria-valuemax','100');
  el.innerHTML='<div class="garden-loader-card"><div class="garden-loader-sprout" aria-hidden="true"></div><p>正在连接庄园</p><div class="garden-loader-bar"><i></i></div><small>等待账号与场景脚本</small></div>';
  document.body.append(el);
  const title=el.querySelector('p'),bar=el.querySelector('i'),label=el.querySelector('small');
  const work=[],images=new Map();let finished=false,failed=false,mounted=false,readiness=null,completed=0,total=0;
  let cancel;const cancelled=new Promise(resolve=>{cancel=resolve;});
  // Let the host keep its own loading state until this cover has actually painted.
  requestAnimationFrame(()=>requestAnimationFrame(()=>notify('loading')));
  function fail(){
    if(finished||failed)return;
    failed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',arm);cancel(false);title.textContent='场景未能载入';label.textContent='请重试或返回轻笺';notify('load-error');
  }
  // Background tabs and a locked screen suspend rendering, not scene progress.
  let timer;
  function arm(){clearTimeout(timer);if(!finished&&!failed&&!document.hidden)timer=setTimeout(fail,30000);}
  document.addEventListener('visibilitychange',arm);arm();
  // The manifest is embedded in the entry, so painted plates can download in
  // parallel with scripts and the account read, without a second round trip.
  (()=>{
    const manifest=document.getElementById('manor-boot-images');
    if(!manifest)return;
    const paths=JSON.parse(manifest.textContent)[new URLSearchParams(location.search).get('renderProfile')==='mobile'?'mobile':'desktop'];
    for(const entry of paths){
      const image=typeof entry==='string'?{src:entry}:entry;
      const link=document.createElement('link');link.rel='preload';link.as='image';
      if(image.srcset){link.imageSrcset=image.srcset;link.imageSizes=image.sizes;}
      link.fetchPriority=image.priority||'auto';link.href=image.src;document.head.append(link);
    }
  })();
  function tick(){
    const percent=Math.floor(completed/total*100);
    bar.style.width=percent+'%';label.textContent=`${percent}% · ${percent===100?'庄园准备好了，欢迎回来':percent<70?'正在快马加鞭布置庄园，请稍候':'正在收拾最后的小细节，请稍候'}`;
    el.setAttribute('aria-valuenow',String(percent));
  }
  function image(url){
    const path=new URL(url,document.baseURI).href;
    if(images.has(path))return images.get(path);
    const promise=new Promise((resolve,reject)=>{
      const img=new Image();img.decoding='async';
      img.onload=()=>{(img.decode?img.decode():Promise.resolve()).then(()=>resolve(img),reject);};
      img.onerror=()=>reject(Error('scene image'));img.src=path;
    });
    images.set(path,promise);return promise;
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
      const tasks=[...sources(),...work];total=tasks.length+1;
      title.textContent='正在准备场景';tick();
      const prepared=Promise.all(tasks.map(task=>Promise.resolve(task).then(()=>{completed++;if(!failed){tick();arm();}}))).then(()=>true);
      if(!await Promise.race([prepared,cancelled]))return false;
      if(failed)return false;
      title.textContent='场景已就绪';
      document.documentElement.classList.remove('garden-booting');
      // Layout, decoded art and event handlers must all be ready before exposing the guide.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(failed)return false;
      completed++;tick();finished=true;clearTimeout(timer);document.removeEventListener('visibilitychange',arm);images.clear();work.length=0;
      performance.mark('manor-interactive');
      document.documentElement.dataset.startupMs=String(Math.round(performance.now()));
      notify('ready');
      el.classList.add('leaving');el.style.pointerEvents='none';
      setTimeout(()=>el.remove(),450);
      return true;
    } catch {fail();return false;}
  }
  return {image,mounted:()=>{mounted=true;},track:promise=>{if(!finished&&!failed)work.push(promise);return promise;},ready,fail};
})();
if(typeof module!=='undefined')module.exports=GardenStartup;
