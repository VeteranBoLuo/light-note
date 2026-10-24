/* One delegated game tooltip survives HUD / dialog rerenders; touch remains a direct action. */
const GardenTooltips = (() => {
  const ID='gardenTooltip';
  function placement(anchor,tip,viewport) {
    const gap=9,edge=8,above=anchor.bottom+gap+tip.height>viewport.height-edge;
    const left=Math.max(edge,Math.min(viewport.width-tip.width-edge,anchor.left+anchor.width/2-tip.width/2));
    return {left,top:Math.max(edge,above?anchor.top-tip.height-gap:anchor.bottom+gap),above,
      arrow:Math.max(12,Math.min(tip.width-12,anchor.left+anchor.width/2-left))};
  }
  function mount(doc=document) {
    const win=doc.defaultView;let owner=null,tip=null,timer=0;
    const clear=()=>{win.clearTimeout(timer);timer=0;};
    function hide(){
      clear();if(tip)tip.hidden=true;
      if(owner){
        const ids=(owner.getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!==ID);
        if(ids.length)owner.setAttribute('aria-describedby',ids.join(' '));else owner.removeAttribute('aria-describedby');
      }
      owner=null;
    }
    function target(node){
      const el=node?.closest?.('[data-game-tip],[title]');
      if(!el||!el.closest('.garden-play,#modal'))return null;
      if(el.hasAttribute('title')){const text=el.getAttribute('title');el.removeAttribute('title');if(text)el.dataset.gameTip=text;}
      return el.dataset.gameTip?el:null;
    }
    function show(el,immediate=false){
      if(owner===el)return;
      hide();owner=el;
      const reveal=()=>{
        timer=0;if(owner!==el||!el.isConnected)return hide();
        const anchor=el.getBoundingClientRect();
        if(!anchor.width||!anchor.height)return hide();
        if(!tip){tip=doc.createElement('div');tip.id=ID;tip.className='game-tooltip';tip.setAttribute('role','tooltip');doc.body.append(tip);}
        tip.textContent=el.dataset.gameTip;tip.hidden=false;
        const pos=placement(anchor,tip.getBoundingClientRect(),{width:win.innerWidth,height:win.innerHeight});
        tip.style.left=pos.left+'px';tip.style.top=pos.top+'px';tip.style.setProperty('--tip-arrow',pos.arrow+'px');tip.dataset.side=pos.above?'above':'below';
        const ids=(el.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
        el.setAttribute('aria-describedby',[...new Set([...ids,ID])].join(' '));
      };
      if(immediate)reveal();else timer=win.setTimeout(reveal,180);
    }
    const over=e=>{if(e.pointerType==='touch'||!win.matchMedia('(hover:hover)').matches)return;const el=target(e.target);if(el)show(el);};
    const out=e=>{if(owner?.contains(e.target)&&!owner.contains(e.relatedTarget))hide();};
    const focus=e=>{const el=target(e.target);if(el&&el.matches(':focus-visible'))show(el,true);else hide();};
    const blur=e=>{if(owner?.contains(e.target))hide();};
    const key=e=>{if(e.key==='Escape'&&owner){hide();e.stopPropagation();}};
    const listeners=[['pointerover',over],['pointerout',out],['focusin',focus],['focusout',blur],['pointerdown',hide],['keydown',key],['scroll',hide]];
    for(const [type,fn]of listeners)doc.addEventListener(type,fn,true);
    win.addEventListener('resize',hide);
    const observer=new win.MutationObserver(()=>{if(owner&&!owner.isConnected)hide();});
    observer.observe(doc.body,{childList:true,subtree:true});
    return {hide,destroy(){hide();tip?.remove();observer.disconnect();for(const [type,fn]of listeners)doc.removeEventListener(type,fn,true);win.removeEventListener('resize',hide);}};
  }
  return {mount,placement};
})();
if(typeof document!=='undefined')GardenTooltips.mount();
if(typeof module!=='undefined')module.exports=GardenTooltips;
