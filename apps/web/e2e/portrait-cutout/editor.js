import { expandedRemovalMask } from './engine/removal-mask.js';

const byId = (id) => document.getElementById(id);
const fileInput = byId('file');
const brushSize = byId('brush-size');
const download = byId('download');
const undo = byId('undo');
const outputButtons = [...document.querySelectorAll('.output-mode')];
const cancelRepair = byId('cancel-repair');
const originalStage = byId('original-stage');
const previewStage = byId('preview-stage');
const sourceFrame = byId('source-frame');
const previewFrame = byId('preview-frame');
const source = byId('source');
const outline = byId('outline');
const result = byId('result');
const marker = byId('point');
const brushCursor = byId('brush-cursor');
const modeButtons = [...document.querySelectorAll('.mode')];
const sampleButtons = [];
const mask = document.createElement('canvas');
const baseMask = document.createElement('canvas');
const transientMask = document.createElement('canvas');
const maskContext = mask.getContext('2d');

let image;
let activeSource;
let sourceVersion = 0;
let requestId = 0;
let modelWorker;
let workerFailed = false;
let lastSelection;
let edits = [];
let stroke;
let mode = 'pick';
let scale = 1;
let fitted = 1;
let frame = 0;
let loadingImage = false;
let running = false;
let exporting = false;
let outputMode = 'keep';
let previewBackground = 'checker';
let repairRequest;
let repairResult;
let widenedMask;
let releaseFallbackModel;
let nextPoint = { x: 0.5, y: 0.5 };

const isBusy = () => running || loadingImage || Boolean(repairRequest) || exporting;
const canBrush = () => Boolean(lastSelection) && !isBusy();
const displayDiameter = () => Number(brushSize.value);
const fitWithin = (width, height, edge) => {
  const factor = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
};

function status(message, error = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('is-error', error);
}

function refreshControls() {
  for (const button of modeButtons) {
    button.setAttribute('aria-pressed', String(mode === button.dataset.mode));
    button.disabled = button.dataset.mode === 'pick' ? !image || isBusy() : !canBrush();
  }
  sourceFrame.classList.toggle('is-brushing', mode !== 'pick');
  brushSize.disabled = mode === 'pick' || !canBrush();
  undo.disabled = !edits.length || !canBrush() || Boolean(stroke);
  download.disabled = !canBrush() || Boolean(stroke);
  const removal = outputMode === 'remove';
  byId('action-label').textContent = removal
    ? repairRequest ? '正在补全…' : repairResult ? '下载补全 PNG' : '移除并补全'
    : '导出透明 PNG';
  download.querySelector('.download-icon').hidden = removal && !repairResult;
  for (const button of outputButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.output === outputMode));
    button.disabled = Boolean(repairRequest || stroke || exporting);
  }
  cancelRepair.hidden = !repairRequest || repairRequest.signal.aborted;
  byId('upload').disabled = Boolean(repairRequest);
  for (const button of sampleButtons) button.disabled = Boolean(repairRequest);
  byId('zoom-out').disabled = !image || scale <= 1;
  byId('zoom-in').disabled = !image || scale >= 3;
  byId('zoom-fit').disabled = !image;
}

function setMode(next) {
  if (stroke || (next !== 'pick' && !canBrush())) return;
  mode = next;
  brushCursor.hidden = true;
  updateCanvasHint();
  refreshControls();
}

function updateCanvasHint() {
  const remove = outputMode === 'remove';
  byId('canvas-hint').textContent = ({
    pick: remove ? '点选主体，自动包含边缘残影' : '点击要处理的主体',
    add: '涂抹以补选遗漏区域',
    erase: remove ? '从选区擦掉要保留的部分' : '涂掉误选区域',
  })[mode];
}

function layout() {
  if (!image) return;
  const viewport = originalStage;
  const style = getComputedStyle(viewport);
  const width = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  fitted = Math.min(width / source.width, height / source.height);
  const displayW = Math.max(1, source.width * fitted * scale);
  const displayH = Math.max(1, source.height * fitted * scale);
  for (const element of [sourceFrame, previewFrame]) {
    element.style.width = `${displayW}px`;
    element.style.height = `${displayH}px`;
    element.parentElement.classList.toggle('zoomed', scale > 1);
  }
  byId('zoom-fit').textContent = scale === 1 ? '适合窗口' : `${Math.round(scale * 100)}%`;
  refreshControls();
}

function setZoom(value) {
  const oldX = originalStage.scrollWidth > 0
    ? (originalStage.scrollLeft + originalStage.clientWidth / 2) / originalStage.scrollWidth : 0.5;
  const oldY = originalStage.scrollHeight > 0
    ? (originalStage.scrollTop + originalStage.clientHeight / 2) / originalStage.scrollHeight : 0.5;
  scale = Math.min(3, Math.max(1, value));
  layout();
  for (const stage of [originalStage, previewStage]) {
    stage.scrollLeft = stage.scrollWidth * oldX - stage.clientWidth / 2;
    stage.scrollTop = stage.scrollHeight * oldY - stage.clientHeight / 2;
  }
}

const imageObserver = new ResizeObserver(layout);
imageObserver.observe(originalStage);

function clearRepairResult() {
  repairResult?.preview.close();
  repairResult = undefined;
}

function resetRemovalMask() {
  if (widenedMask) widenedMask.width = widenedMask.height = 1;
  widenedMask = undefined;
}

function currentRemovalMask() {
  if (!widenedMask) {
    widenedMask = expandedRemovalMask(baseMask);
    const context = widenedMask.getContext('2d');
    // Expand the automatic selection, then apply manual brush strokes at their exact size.
    for (const edit of edits) paintEdit(edit, context);
  }
  return widenedMask;
}

function showPreview() {
  const removal = outputMode === 'remove';
  const ready = removal ? Boolean(repairResult && !stroke) : Boolean(lastSelection);
  byId('preview-title').textContent = removal ? '补全预览' : '抠图预览';
  byId('preview-backgrounds').hidden = removal;
  previewStage.dataset.background = removal ? 'image' : previewBackground;
  previewFrame.hidden = !ready;
  const empty = byId('preview-empty');
  empty.hidden = ready;
  empty.textContent = removal
    ? repairRequest ? '正在补全选区，结果会显示在这里。' : '选中要移除的内容，再点击「移除并补全」。'
    : '选中主体后，这里会显示透明背景的效果。';
  if (!ready) return;

  const context = result.getContext('2d');
  context.clearRect(0, 0, result.width, result.height);
  if (removal) {
    context.drawImage(repairResult.preview, 0, 0);
    return;
  }
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-over';
}

async function openImage(url, name, sampleId = '') {
  repairRequest?.abort();
  const version = ++sourceVersion;
  loadingImage = true;
  running = false;
  status('正在读取图片…');
  refreshControls();
  const next = new Image();
  next.src = url;
  try {
    await next.decode();
    if (version !== sourceVersion) return;
    if (next.naturalWidth * next.naturalHeight > 24_000_000)
      throw new Error('请选择不超过 2400 万像素的图片。');
    if (activeSource?.startsWith('blob:')) URL.revokeObjectURL(activeSource);
    activeSource = url;
    image = next;
    lastSelection = undefined;
    clearRepairResult();
    resetRemovalMask();
    edits = [];
    stroke = undefined;
    scale = 1;
    nextPoint = { x: 0.5, y: 0.5 };
    const { width, height } = fitWithin(next.naturalWidth, next.naturalHeight, 1100);
    for (const canvas of [source, outline, result, mask, baseMask]) {
      canvas.width = width;
      canvas.height = height;
    }
    source.getContext('2d').drawImage(image, 0, 0, width, height);
    sourceFrame.hidden = false;
    byId('source-empty').hidden = true;
    showPreview();
    marker.hidden = true;
    brushCursor.hidden = true;
    byId('file-name').textContent = name;
    byId('file-size').textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    byId('file-thumbnail').src = url;
    byId('file-thumbnail').hidden = false;
    byId('timing').textContent = '';
    for (const button of sampleButtons) button.setAttribute('aria-pressed', String(button.dataset.sample === sampleId));
    status('点击要处理的主体，预览选区。');
    setMode('pick');
    setZoom(1);
  } catch (error) {
    if (version === sourceVersion) status(error.message || '图片无法打开，请换一张重试。', true);
  } finally {
    if (url !== activeSource && url.startsWith('blob:')) URL.revokeObjectURL(url);
    if (version === sourceVersion) {
      loadingImage = false;
      refreshControls();
    }
  }
}

function pointOnSource(event) {
  const bounds = source.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
}

function showMarker(point) {
  marker.hidden = false;
  marker.style.left = `${point.x * 100}%`;
  marker.style.top = `${point.y * 100}%`;
}

async function selectInWorker(input, point) {
  const bitmap = await createImageBitmap(input);
  try {
    modelWorker ??= new Worker(new URL('./engine/worker.js', import.meta.url));
  } catch (error) {
    bitmap.close();
    throw error;
  }
  const id = ++requestId;
  const worker = modelWorker;
  return new Promise((resolve, reject) => {
    function settle(error, selection) {
      clearTimeout(timeout);
      worker.removeEventListener('message', receive);
      worker.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve(selection);
    }
    function receive({ data }) {
      if (data.id === id) settle(data.error && new Error(data.error), data.selection);
    }
    function failed(event) { settle(new Error(event.message || 'Worker unavailable')); }
    const timeout = setTimeout(() => settle(new Error('Worker timed out')), 20000);
    worker.addEventListener('message', receive);
    worker.addEventListener('error', failed);
    try {
      worker.postMessage({ id, bitmap, point }, [bitmap]);
    } catch (error) {
      bitmap.close();
      settle(error);
    }
  });
}

async function infer(input, point) {
  if (!workerFailed && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      return { ...await selectInWorker(input, point), backend: 'Worker' };
    } catch (error) {
      console.info('Worker inference unavailable, trying the browser thread:', error.message);
      workerFailed = true;
      modelWorker?.terminate();
      modelWorker = undefined;
    }
  }
  const { selectSubject, releaseSegmenter } = await import('./engine/segment.js');
  releaseFallbackModel = releaseSegmenter;
  return { ...await selectSubject(input, point), backend: '浏览器主线程' };
}

function replaceMask(selection) {
  const { alpha, width, height } = selection;
  transientMask.width = width;
  transientMask.height = height;
  const small = transientMask.getContext('2d');
  const pixels = small.createImageData(width, height);
  for (let index = 0; index < alpha.length; index++) pixels.data[index * 4 + 3] = alpha[index];
  small.putImageData(pixels, 0, 0);
  const base = baseMask.getContext('2d');
  base.clearRect(0, 0, baseMask.width, baseMask.height);
  base.drawImage(transientMask, 0, 0, baseMask.width, baseMask.height);
  transientMask.width = 1;
  transientMask.height = 1;
  edits = [];
  replayEdits();
}

async function pick(point) {
  if (isBusy() || stroke || !image) return;
  const version = sourceVersion;
  running = true;
  nextPoint = point;
  showMarker(point);
  status(lastSelection ? '正在更新主体选区…' : '正在准备模型并识别主体…');
  refreshControls();
  try {
    const input = document.createElement('canvas');
    const { width, height } = fitWithin(source.width, source.height, 768);
    input.width = width;
    input.height = height;
    input.getContext('2d').drawImage(source, 0, 0, width, height);
    const selection = await infer(input, point);
    input.width = 1;
    input.height = 1;
    if (sourceVersion !== version) return;
    if (selection.coverage < 0.008 || selection.coverage > 0.98) {
      status('这个点没分出明确的主体。请试试点在主体中央。', true);
      return;
    }
    lastSelection = point;
    clearRepairResult();
    replaceMask(selection);
    byId('timing').textContent = `点选 ${selection.milliseconds} ms`;
    byId('timing').title = selection.backend;
    status('已选中主体。用「补选」或「擦除」调整选区。');
  } catch (error) {
    if (sourceVersion === version) {
      console.warn('Segmentation failed:', error);
      status('当前图片未能完成识别。可以重新点击，或更换图片重试。', true);
    }
  } finally {
    if (sourceVersion === version) {
      running = false;
      refreshControls();
    }
  }
}

function redraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!lastSelection || !image) return;
    const width = mask.width;
    const height = mask.height;
    showPreview();

    const overlay = outline.getContext('2d');
    overlay.clearRect(0, 0, width, height);
    const showExpanded = outputMode === 'remove';
    const selection = showExpanded ? currentRemovalMask() : mask;
    const thickness = Math.max(1, 1.6 / Math.max(0.35, fitted * scale));
    for (const [x, y] of [[-1,0], [1,0], [0,-1], [0,1]]) overlay.drawImage(selection, x * thickness, y * thickness);
    overlay.globalCompositeOperation = 'destination-out';
    overlay.drawImage(selection, 0, 0);
    overlay.globalCompositeOperation = 'source-in';
    overlay.fillStyle = '#754cff';
    overlay.fillRect(0, 0, width, height);
    overlay.globalCompositeOperation = 'source-over';
    if (showExpanded) {
      overlay.save();
      overlay.globalAlpha = 0.16;
      overlay.drawImage(selection, 0, 0);
      overlay.restore();
    }
  });
}

function drawEdit(edit, from, to = from, context = maskContext) {
  context.save();
  context.globalCompositeOperation = edit.mode === 'add' ? 'source-over' : 'destination-out';
  const { width, height } = context.canvas;
  const ax = from.x * width;
  const ay = from.y * height;
  const bx = to.x * width;
  const by = to.y * height;
  const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, edit.radius * .28)));
  for (let step = 1; step <= count; step++) {
    const x = ax + (bx - ax) * step / count;
    const y = ay + (by - ay) * step / count;
    const gradient = context.createRadialGradient(x, y, edit.radius * .7, x, y, edit.radius);
    gradient.addColorStop(0, '#754cff');
    gradient.addColorStop(1, 'transparent');
    context.fillStyle = gradient;
    context.fillRect(x - edit.radius, y - edit.radius, edit.radius * 2, edit.radius * 2);
  }
  context.restore();
}

function drawStrokeSegment(edit, from, to = from) {
  drawEdit(edit, from, to);
  if (widenedMask) drawEdit(edit, from, to, widenedMask.getContext('2d'));
}

function replayEdits() {
  resetRemovalMask();
  maskContext.clearRect(0, 0, mask.width, mask.height);
  maskContext.drawImage(baseMask, 0, 0);
  for (const edit of edits) paintEdit(edit, maskContext);
  redraw();
}

function paintEdit(edit, context) {
  drawEdit(edit, edit.points[0], edit.points[0], context);
  for (let i = 1; i < edit.points.length; i++) drawEdit(edit, edit.points[i - 1], edit.points[i], context);
}

function restoreLastEdit() {
  if (!edits.length || !canBrush() || stroke) return;
  edits.pop();
  clearRepairResult();
  replayEdits();
  status('已撤销最后一笔。');
  refreshControls();
}

function showBrush(point) {
  const diameter = displayDiameter();
  brushCursor.hidden = false;
  brushCursor.style.width = brushCursor.style.height = `${diameter}px`;
  brushCursor.style.left = `${point.x * 100}%`;
  brushCursor.style.top = `${point.y * 100}%`;
}

source.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || mode === 'pick' || !canBrush() || stroke) return;
  if (outputMode === 'remove') currentRemovalMask();
  event.preventDefault();
  source.setPointerCapture(event.pointerId);
  const point = pointOnSource(event);
  const radius = displayDiameter() * source.width / source.getBoundingClientRect().width / 2;
  stroke = { mode, radius, points: [point], id: event.pointerId };
  drawStrokeSegment(stroke, point);
  showBrush(point);
  refreshControls();
  redraw();
});
source.addEventListener('pointermove', (event) => {
  if (mode === 'pick' || !canBrush()) return;
  const point = pointOnSource(event);
  showBrush(point);
  if (stroke?.id !== event.pointerId) return;
  drawStrokeSegment(stroke, stroke.points.at(-1), point);
  stroke.points.push(point);
  redraw();
});
source.addEventListener('pointerleave', () => { if (!stroke) brushCursor.hidden = true; });
function finishStroke(event) {
  if (stroke?.id !== event.pointerId) return;
  if (event.type === 'pointercancel') replayEdits();
  else {
    edits.push(stroke);
    clearRepairResult();
    status(stroke.mode === 'add' ? '已补选涂抹区域。' : '已擦除涂抹区域。');
  }
  stroke = undefined;
  redraw();
  refreshControls();
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) source.addEventListener(type, finishStroke);
source.addEventListener('click', (event) => {
  if (mode === 'pick') void pick(pointOnSource(event));
});
source.addEventListener('keydown', (event) => {
  if (mode !== 'pick') return;
  if (event.key === 'Enter') {
    event.preventDefault();
    void pick(nextPoint);
    return;
  }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  nextPoint = {
    x: Math.min(.99, Math.max(.01, nextPoint.x + delta[0] * .025)),
    y: Math.min(.99, Math.max(.01, nextPoint.y + delta[1] * .025)),
  };
  showMarker(nextPoint);
});

byId('upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
    status('请选择 JPG、PNG 或 WebP 图片。', true);
    return;
  }
  void openImage(URL.createObjectURL(file), file.name);
});
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
brushSize.addEventListener('input', () => {
  byId('brush-value').textContent = `${displayDiameter()} px`;
  brushCursor.hidden = true;
});
undo.addEventListener('click', restoreLastEdit);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && edits.length) {
    event.preventDefault();
    restoreLastEdit();
  }
});
byId('zoom-out').addEventListener('click', () => setZoom(scale / 1.5));
byId('zoom-in').addEventListener('click', () => setZoom(scale * 1.5));
byId('zoom-fit').addEventListener('click', () => setZoom(1));
for (const button of outputButtons) {
  button.addEventListener('click', () => {
    if (button.disabled || outputMode === button.dataset.output) return;
    outputMode = button.dataset.output;
    updateCanvasHint();
    status(outputMode === 'keep'
      ? '保留选中主体，导出透明 PNG。'
      : repairResult ? '可以下载补全后的图片。' : '移除选中区域，用周围画面补全。');
    showPreview();
    redraw();
    refreshControls();
  });
}
for (const button of document.querySelectorAll('#preview-backgrounds button')) {
  button.addEventListener('click', () => {
    previewBackground = button.dataset.background;
    showPreview();
    for (const option of button.parentElement.children) option.setAttribute('aria-pressed', String(option === button));
  });
}

function downloadPng(png, suffix) {
  const url = URL.createObjectURL(png);
  const link = document.createElement('a');
  link.href = url;
  link.download = byId('file-name').textContent.replace(/\.[^.]+$/, '') + suffix + '.png';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function repairSelection() {
  const version = sourceVersion;
  const controller = new AbortController();
  repairRequest = controller;
  status('正在准备修复模型（约 107 MB）…');
  refreshControls();
  showPreview();
  try {
    modelWorker?.terminate();
    modelWorker = undefined;
    if (releaseFallbackModel) await releaseFallbackModel();
    const { removeSubject } = await import('./engine/remove-subject.js');
    const repaired = await removeSubject(image, currentRemovalMask(), controller.signal, () => {
      status('正在移除主体并补全背景…');
    });
    if (sourceVersion !== version || controller.signal.aborted) {
      repaired.preview.close();
      return;
    }
    repairResult = repaired;
    status('补全完成，可以预览和下载 PNG。');
  } catch (error) {
    if (sourceVersion !== version) return;
    if (controller.signal.aborted) {
      status('已取消补全，选区可继续编辑。');
    } else {
      const messages = {
        unsupported: '补全需要支持 WebGPU FP16 的浏览器。仍可使用「保留主体」导出透明 PNG。',
        selection: '选区太小或已擦空。请重选主体或用笔刷补选。',
        background: '请缩小选区，给模型留一些周围背景。',
        load: '修复模型加载失败。请点击「移除并补全」重试。',
      };
      status(messages[error.message] ?? '这次补全失败，选区仍可编辑。请重试或换一张图片。', true);
    }
  } finally {
    repairRequest = undefined;
    showPreview();
    refreshControls();
  }
}

cancelRepair.addEventListener('click', () => {
  repairRequest?.abort();
  refreshControls();
});
download.addEventListener('click', async () => {
  if (!canBrush() || stroke) return;
  if (outputMode === 'remove') {
    if (repairResult) downloadPng(repairResult.png, '-补全');
    else await repairSelection();
    return;
  }
  const version = sourceVersion;
  exporting = true;
  const clean = document.createElement('canvas');
  clean.width = image.naturalWidth;
  clean.height = image.naturalHeight;
  try {
    refreshControls();
    status('正在导出原尺寸透明 PNG…');
    const output = clean.getContext('2d');
    output.drawImage(image, 0, 0);
    output.globalCompositeOperation = 'destination-in';
    output.drawImage(mask, 0, 0, clean.width, clean.height);
    const png = await new Promise((resolve) => clean.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG unavailable');
    if (version === sourceVersion) {
      downloadPng(png, '-抠图');
      status('已导出透明 PNG。');
    }
  } catch {
    if (version === sourceVersion) status('PNG 导出失败。请稍后重试，或换一张尺寸较小的图片。', true);
  } finally {
    clean.width = 1;
    clean.height = 1;
    exporting = false;
    refreshControls();
  }
});

function openSample(sample) {
  return openImage(sample.file, sample.label + '.jpg', sample.id);
}

async function showSamples() {
  const samples = await fetch('./samples/sources.json').then((response) => {
    if (!response.ok) throw new Error('Sample list unavailable');
    return response.json();
  });
  for (const sample of samples) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sample';
    button.dataset.sample = sample.id;
    button.setAttribute('aria-pressed', 'false');
    const thumb = new Image();
    thumb.src = sample.file;
    thumb.alt = '';
    const caption = document.createElement('span');
    caption.textContent = sample.label;
    button.append(thumb, caption);
    button.title = `照片：${sample.credit} / Unsplash`;
    button.addEventListener('click', () => void openSample(sample));
    byId('samples').append(button);
    sampleButtons.push(button);
  }
  if (!image && !loadingImage && sourceVersion === 0 && samples.length) {
    const preferred = samples.find((sample) => sample.id === new URLSearchParams(location.search).get('sample')) || samples[0];
    await openSample(preferred);
  }
}
showSamples().catch(() => status('示例暂时无法打开，可以选择自己的图片。', true));
refreshControls();
