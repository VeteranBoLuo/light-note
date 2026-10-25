/* 种田素材：作物、种子袋、苗床状态叠加、鱼苗袋均为 Codex 生图后切好的透明图（farm/*.webp，见 tools/build-farm-assets.py）。
   作物格 512 × 512：第 1–5 格为播种、发芽、幼苗、开花/青果、成熟，默认根部锚点 (256, 400)，播种组可按土面居中；第 6 格是收获物图标。 */
const FarmArt = (() => {
  const BASE = "knowledge-garden-v19/farm/";
  const html = markup => typeof GardenStartup!=="undefined"&&GardenStartup.html?GardenStartup.html(markup):markup;
  const cropSrc = (key, stage) => `${BASE}crop-${key}-${stage}-r55.webp`;
  const img = (src, cls) => html(`<img class="${cls}" src="${src}" alt="" draggable="false" decoding="async">`);
  // 模型的生长阶段（0 播种 … 4 成熟）对应第 1–5 格
  const spriteStage = (growthStage) => Math.max(1, Math.min(5, growthStage + 1));
  const packet = (key) => img(`${BASE}seed-${key}.webp`, "farm-packet");
  const giftPack = () => img(`${BASE}seed-basic-gift.webp`, "farm-packet");
  const icon = (key) => img(cropSrc(key, 6), "farm-icon");
  const fryBag = () => img(`${BASE}fish-fry-bag.webp`, "farm-fry");
  // Semantic, multicolor game atlas. Each crop is measured in the native 1774×887 image.
  const UI_CROPS = {
    pouch:[19,69,278],basket:[306,70,284],receipt:[605,73,279],sprout:[896,70,280],fish:[1190,72,282],house:[1487,66,284],
    clock:[29,348,273],water:[312,350,270],coin:[606,348,274],build:[896,348,274],lock:[1197,349,272],back:[1490,350,273],
    pollen:[21,611,274],crate:[311,614,273],bait:[605,615,273],crest:[895,610,276],"leaves-left":[1194,611,274],"leaves-right":[1489,612,275],
  };
  function ui(key,cls="") {
    const crop=UI_CROPS[key];if(!crop)return "";
    const [x,y,n]=crop;
    return `<span class="game-icon ${cls}" data-icon="${key}" aria-hidden="true" style="background-size:${1774/n*100}% ${887/n*100}%;background-position:${x/(1774-n)*100}% ${y/(887-n)*100}%"></span>`;
  }
  function sceneDetails(d) {
    const details=(d.detailTiles||[]).map(tile=>{
      if(tile.matrix){
        const [w,h]=tile.pixels,pose=tile.matrix.join(','),polygon=tile.clip||[[0,0],[d.image[0],0],[d.image[0],d.image[1]],[0,d.image[1]]];
        const clip=`polygon(${polygon.map(([x,y])=>`${x/d.image[0]*100}% ${y/d.image[1]*100}%`).join(',')})`;
        return `<div class="scene-detail-tile scene-measured-detail" data-pose="${pose}" data-polygon='${JSON.stringify(polygon)}' aria-hidden="true" style="left:${-d.safe[0]}px;top:${-d.safe[1]}px;width:${d.image[0]}px;height:${d.image[1]}px;clip-path:${clip}"><img src="knowledge-garden-v19/${tile.asset}" alt="" draggable="false" style="width:${w}px;height:${h}px;transform-origin:0 0;transform:matrix(${pose})"></div>`;
      }
      const [x,y,w,h]=tile.rect,c=tile.column,row=tile.row;
      const horizontal=`linear-gradient(90deg,${c?"transparent 0%,#000 4.5%":"#000 0%"},${c<2?"#000 95.5%,transparent 100%":"#000 100%"})`;
      const vertical=`linear-gradient(180deg,${row?"transparent 0%,#000 6.2%":"transparent 0%,#000 3%"},${row?"#000 100%":"#000 93.8%,transparent 100%"})`;
      return `<div class="scene-detail-tile" aria-hidden="true" style="left:${x-d.safe[0]}px;top:${y-d.safe[1]}px;width:${w}px;height:${h}px;mask-image:${horizontal}"><img src="knowledge-garden-v19/${tile.asset}" alt="" draggable="false" style="mask-image:${vertical}"></div>`;
    }).join("");
    const patches=(d.scenePatches||[]).map(patch=>{
      const [x,y,w,h]=patch.rect;
      return `<div class="scene-detail-tile scene-terrain-patch" aria-hidden="true" style="left:${x-d.safe[0]}px;top:${y-d.safe[1]}px;width:${w}px;height:${h}px;mask-image:linear-gradient(90deg,#000 0%,#000 calc(100% - ${patch.featherRight}px),transparent 100%)"><img src="knowledge-garden-v19/${patch.asset}" alt="" draggable="false" style="mask-image:linear-gradient(180deg,transparent 0px,#000 ${patch.featherTop}px,#000 100%)"></div>`;
    }).join("");
    return details+patches;
  }
  // 各阶段透明素材的可见边界（alpha > 24）。预览按内容居中，场景仍保留原来的根部锚点。
  const PREVIEW_BOUNDS = {
    lettuce: [[107, 298, 405, 488], [111, 275, 401, 488], [76, 171, 436, 488], [61, 136, 451, 488], [61, 145, 451, 488]],
    eggplant: [[107, 298, 405, 488], [111, 264, 401, 488], [76, 187, 436, 488], [61, 134, 451, 488], [63, 118, 448, 488]],
    sunflower: [[122, 298, 390, 488], [125, 258, 386, 488], [85, 148, 427, 488], [61, 134, 451, 488], [80, 118, 431, 488]],
    pepper: [[104, 298, 408, 488], [111, 264, 401, 488], [78, 148, 433, 488], [63, 118, 449, 488], [66, 118, 445, 488]],
    blueberry: [[110, 298, 401, 488], [111, 287, 401, 488], [91, 148, 421, 488], [61, 124, 451, 488], [81, 118, 431, 488]],

    carrot: [[108,290,418,488],[125,269,395,488],[70,162,426,488],[44,125,487,488],[73,163,448,488]],
    corn: [[96,302,430,487],[119,241,403,487],[84,157,438,487],[89,130,426,487],[90,148,443,488]],
    lavender: [[82,297,435,487],[79,253,444,485],[64,192,464,484],[91,167,441,485],[78,158,439,486]],
    moonorchid: [[99,308,433,488],[99,262,419,487],[68,184,450,487],[102,188,437,488],[105,171,440,488]],
    pumpkin: [[116,303,401,488],[101,268,418,487],[85,251,431,488],[88,201,439,488],[78,186,437,488]],
    radish: [[107,307,422,488],[108,262,410,488],[36,142,481,488],[45,145,488,487],[96,175,451,487]],
    rainbowcorn: [[80,310,453,487],[79,245,454,486],[25,114,480,488],[88,125,444,488],[84,132,442,488]],
    sprout: [[101,302,420,488],[112,284,418,488],[72,197,449,487],[66,161,485,487],[89,190,439,488]],
    starpumpkin: [[125,318,401,488],[128,280,394,488],[86,217,426,488],[79,164,455,488],[109,193,432,488]],
    strawberry: [[132,327,407,488],[130,313,389,488],[63,205,432,488],[61,137,488,472],[49,132,488,479]],
    tomato: [[124,332,396,488],[140,285,382,488],[61,181,435,487],[89,167,449,488],[87,167,445,488]],
  };
  function cropPreview(key, growthStage) {
    const stage = spriteStage(growthStage);
    const [l, t, r, b] = PREVIEW_BOUNDS[key]?.[stage - 1] || [0, 0, 512, 512];
    const size = (88 * 512 / Math.max(r - l, b - t)).toFixed(3);
    const x = ((l + r) / 1024 * 100).toFixed(3), y = ((t + b) / 1024 * 100).toFixed(3);
    return `<span class="crop-preview" aria-hidden="true" style="--crop-size:${size}%;--crop-x:-${x}%;--crop-y:-${y}%">${img(cropSrc(key, stage), "crop-preview-img")}</span>`;
  }
  function cropPlacement(key,growthStage,plot) {
    let [cx,cy]=plot.center,k=plot.cropScale,ax=256,ay=400;
    if(key==='corn'&&growthStage===0) {
      // 种子组按土面中心与可见边界留白；长成后继续使用原来的根部锚点。
      const opening=plot.soilOpening||plot.soil,[l,t,r,b]=PREVIEW_BOUNDS.corn[0];
      [cx,cy]=opening.reduce((p,q)=>[p[0]+q[0]/4,p[1]+q[1]/4],[0,0]);
      const height=((opening[2][1]+opening[3][1])-(opening[0][1]+opening[1][1]))/2;
      const width=Math.min(opening[1][0]-opening[0][0],opening[2][0]-opening[3][0]);
      k=Math.min(k,width*.82/(r-l),height*.82/(b-t));ax=(l+r)/2;ay=(t+b)/2;
    }
    return {x:cx-ax*k,y:cy-ay*k,size:512*k};
  }
  // 弹框里的作物展示：一块土 + 这一阶段的作物（播种未浇水时是干土，未开垦时盖帆布）
  function cropCard(key, growthStage, { dry = false, locked = false } = {}) {
    const layers = [];
    if (dry) layers.push(img(`${BASE}bed-dry-r55.webp`, "card-soil-overlay"));
    if (locked) layers.push(img(`${BASE}bed-tarp.webp`, "card-soil-overlay"));
    if (key && growthStage >= 0) layers.push(img(cropSrc(key, spriteStage(growthStage)), "card-crop"));
    return `<span class="crop-card${locked ? " locked" : ""}" aria-hidden="true"><span class="card-soil"></span>${layers.join("")}</span>`;
  }
  const fertilizerSrc = (kind = "eco") => `knowledge-garden-v19/incoming/farm-r2/sprites/${kind === "rabbit" ? "fert-rabbit" : "fert-sack"}.webp`;
  const fertilizer = (kind = "eco") => `<span class="fert-sack tier-${kind}" aria-hidden="true"><img src="${fertilizerSrc(kind)}" alt="" draggable="false"><i></i></span>`;
  // 继续使用庄园已经绘制的多色道具，不向独立 HTML 引入产品的单色图标组件。
  const ACTION_ART = {
    "plot-remove": "farm-r2/sprites/tool-trowel",
    "plot-remove-yes": "farm-r2/sprites/tool-trowel",
    "seed-select": "farm-r2/sprites/icon-sprout",
    "plant-seed": "farm-r2/sprites/icon-sprout",
    "fert-select": "farm-r2/sprites/icon-sprout",
    fishing: "farm-r2/sprites/tool-rod",
    bag: "dock-r3/backpack", stall: "dock-r3/shop",
    "shop-tab": "dock-r3/shop", atlas: "dock-r3/atlas",
  };
  const SEMANTIC_ACTION = {
    close:"back","purchase-cancel":"back","facility-shop":"pouch","facility-garden":"back","facility-focus":"back","hive-back":"back",
    "facility-detail":"house","facility-open":"house","facility-build":"build","facility-build-confirm":"build","purifier-upgrade":"build","upgrade-confirm":"build",
    "purifier-focus":"water","purifier-collect":"water","claim-all-daily-water":"water","craft-start":"bait","craft-collect":"crate","manual-open":"bait","manual-craft":"bait","workshop-back":"back","workshop-resume":"back",
    "hive-refill":"pollen","hive-pollinate":"pollen","hive-refill-confirm":"pollen","purchase-confirm":"pouch","sale-confirm":"basket","sell-confirm":"basket",sell:"basket","shop-sell-crop":"basket","shop-buyback":"receipt",
    "buy-seed":"pouch","buy-fry":"pouch","shop-buy-bait":"pouch","buy-bait":"pouch","buy-purifier":"build",
    "level-claim":"crate","level-claim-all":"crate","collection-claim":"crate","growth-gifts":"crate",
  };
  function decorateActions(root) {
    root.querySelectorAll("button.button,button.tile-btn").forEach(button=>{
      const semantic=SEMANTIC_ACTION[button.dataset.action];
      if(semantic&&!button.querySelector("img,.game-sprite,.fert-sack,.r18-sprite,.game-icon")) {
        button.insertAdjacentHTML("afterbegin",ui(semantic,"action-art"));button.classList.add("has-action-art");return;
      }
      const art=ACTION_ART[button.dataset.action];
      if(!art || button.querySelector("img,.game-sprite,.fert-sack,.game-icon"))return;
      button.insertAdjacentHTML("afterbegin",img(`knowledge-garden-v19/incoming/${art}.webp`,"action-art"));
      button.classList.add("has-action-art");
    });
  }
  return { BASE, html, ui, UI_CROPS, sceneDetails, cropSrc, spriteStage, packet, giftPack, icon, fryBag, cropCard, cropPreview, cropPlacement, fertilizerSrc, fertilizer, decorateActions };
})();
if (typeof module !== "undefined") module.exports = FarmArt;
