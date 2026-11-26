const cases = [
  {
    id: 'bridge', name: '桥边栏杆', credit: 'Bobby Thapa', url: 'https://unsplash.com/photos/sOmA16lt8QQ',
    auto: {
      description: '点选左边人物后，栏杆大致接上了，右边的人保留下来。放大后能看到栏杆后面的水纹变软，脚周围留有暗影。',
      region: '左边人物', time: '380 ms',
    },
  },
  {
    id: 'beach', name: '海边倒影', credit: 'Evgeny Ozerov', url: 'https://unsplash.com/photos/fFtjGiswAtY',
    auto: {
      description: '点了最左边的人，自动选区却同时圈进了旁边两人，水里的倒影也没选到。直接修复会破坏其他人。',
      region: '自动选区，包含部分邻人', time: '395 ms',
    },
    corrected: {
      description: '把旁边两人从选区里擦掉，再把左边人物的倒影涂进去。修复后两人和各自的倒影都保留，补过的水面纹理较柔和。',
      region: '左边人物和倒影', time: '488 ms',
    },
  },
  {
    id: 'group', name: '合照遮挡', credit: 'Will Haddock', url: 'https://unsplash.com/photos/UnldHt2vxYw',
    auto: {
      description: '点选中间穿 9 号球衣的人。远看人物和脚下的位置补起来了，放大能看到左右两人的袖口被抹糊，沙地也有一道软边。',
      region: '中间穿 9 号球衣的人', time: '455 ms',
    },
  },
];
const element = (id) => document.getElementById(id);
const frame = element('split-frame');
const after = element('after-image');
const before = element('before-image');
const mask = element('mask-image');
const range = element('position');
const tabs = [];
let active;
let variant;
let dragging;

for (const scene of cases) {
  const tab = document.createElement('button');
  tab.className = 'sample';
  tab.type = 'button';
  const thumb = new Image();
  thumb.src = '../local-assets/removal/photos/' + scene.id + '.jpg';
  thumb.alt = '';
  const name = document.createElement('span');
  name.textContent = scene.name;
  tab.append(thumb, name);
  tab.addEventListener('click', () => select(scene));
  element('scenes').append(tab);
  tabs.push(tab);
}

function layout() {
  if (!before.naturalWidth) return;
  const stage = frame.parentElement;
  const style = getComputedStyle(stage);
  const size = Math.min(
    (stage.clientWidth - 2 * parseFloat(style.paddingLeft)) / before.naturalWidth,
    (stage.clientHeight - 2 * parseFloat(style.paddingTop)) / before.naturalHeight,
  );
  frame.style.width = before.naturalWidth * size + 'px';
  frame.style.height = before.naturalHeight * size + 'px';
}

function divider(value) {
  const position = Math.max(0, Math.min(100, value));
  frame.style.setProperty('--position', position + '%');
  range.value = position;
  element('before-label').style.visibility = position < 10 ? 'hidden' : 'visible';
  element('after-label').style.visibility = position > 90 ? 'hidden' : 'visible';
}
function showMask(enabled) {
  frame.classList.toggle('show-mask', enabled);
  mask.hidden = !enabled;
  element('split-line').hidden = enabled;
  element('before-label').hidden = enabled;
  element('after-label').hidden = enabled;
  range.disabled = enabled;
  element('compare-tab').setAttribute('aria-pressed', String(!enabled));
  element('mask-tab').setAttribute('aria-pressed', String(enabled));
}
function select(scene) {
  active = scene;
  variant = scene.corrected ? 'corrected' : 'auto';
  for(const [index,tab] of tabs.entries()) tab.setAttribute('aria-pressed',String(cases[index]===scene));
  element('scene-title').textContent = scene.name;
  element('credits').textContent = scene.credit + ' / Unsplash';
  element('credits').href = scene.url;
  element('choices').hidden = !scene.corrected;
  before.src = '../local-assets/removal/photos/' + scene.id + '.jpg';
  showMask(false);
  divider(50);
  present();
}
function present() {
  const entry = active[variant];
  const isCorrected = variant === 'corrected';
  const filePrefix = '../local-assets/removal/outputs/' + active.id + (isCorrected ? '-tuned' : '-auto');
  const result = filePrefix + '-repaired.png';
  after.src = result;
  mask.src = filePrefix + '-overlay.jpg';
  const download = element('download');
  download.href = result;
  download.download = active.name + '-移除后.png';
  element('notes').textContent = entry.description;
  element('selection-notes').textContent = entry.region;
  element('inference').textContent = entry.time;
  element('auto').setAttribute('aria-pressed', String(!isCorrected));
  element('corrected').setAttribute('aria-pressed', String(isCorrected));
}

before.addEventListener('load', layout);
new ResizeObserver(layout).observe(frame.parentElement);
range.addEventListener('input', () => divider(Number(range.value)));
element('compare-tab').addEventListener('click', () => showMask(false));
element('mask-tab').addEventListener('click', () => showMask(true));
for (const [id,key] of [['auto','auto'],['corrected','corrected']]) {
  element(id).addEventListener('click',()=>{variant=key;present();});
}
function track(event) {
  const rect = frame.getBoundingClientRect();
  divider((event.clientX - rect.left) / rect.width * 100);
}
frame.addEventListener('pointerdown', event => {
  if (range.disabled || event.button !== 0) return;
  dragging = event.pointerId;
  frame.setPointerCapture(event.pointerId);
  track(event);
});
frame.addEventListener('pointermove', event => {
  if (event.pointerId === dragging && !range.disabled) track(event);
});
frame.addEventListener('lostpointercapture', () => { dragging = undefined; });
select(cases[0]);
