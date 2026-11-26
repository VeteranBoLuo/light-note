import {
  hitRepairRectangle,
  moveRepairRectangle,
  rectangleBetween,
  repairRectangleHandles,
  resizeRepairRectangle,
} from '../../src/view/toolbox/imageRepairSelection.ts';
import { createRemovalAlpha } from './engine/removal-mask.js';

const SELECTION_COLOR = '#754cff';

/**
 * @param {HTMLElement} root
 * @param {{
 *   openPicker: () => void,
 *   text: (key: string, params?: Record<string, string | number>) => string,
 * }} options
 */
export function createCutoutEditor(root, options) {
  const lifetime = new AbortController();
  const text = options.text;
  const byId = (id) => root.querySelector('#' + id);

  const brushSize = byId('brush-size');
  const download = byId('download');
  const undo = byId('undo');
  const redo = byId('redo');
  const reset = byId('reset-selection');
  const continueButton = byId('continue-removal');
  const outputButtons = [...root.querySelectorAll('.output-mode')];
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
  const modeButtons = [...root.querySelectorAll('.mode')];
  const mask = document.createElement('canvas');
  const removalMask = document.createElement('canvas');
  const transientMask = document.createElement('canvas');
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  const removalContext = removalMask.getContext('2d');

  let image;
  let activeSource;
  let sourceVersion = 0;
  let requestId = 0;
  let modelWorker;
  let cancelWorkerRequest;
  let workerFailed = false;
  let lastSelection;
  let edits = [];
  let undoneEdits = [];
  let stroke;
  let keyboardRectangleStart;
  let mode = 'pick';
  let scale = 1;
  let fitted = 1;
  let frame = 0;
  let loadingImage = false;
  let currentStatus;
  let lastTiming;
  let running = false;
  let exporting = false;
  let outputMode = 'keep';
  let previewBackground = 'checker';
  let repairRequest;
  let repairResult;
  let workingResult;
  let releaseFallbackModel;
  let nextPoint = { x: 0.5, y: 0.5 };

  const isBusy = () => running || loadingImage || Boolean(repairRequest) || exporting;
  const canEdit = () => Boolean(image) && !isBusy() && !stroke;
  const hasSelection = () => edits.length > 0;
  const canBrush = () => hasSelection() && !isBusy();
  const isBrushMode = () => mode === 'add' || mode === 'erase';
  const downloadableFill = () => repairResult ?? (!hasSelection() ? workingResult : undefined);
  const displayDiameter = () => Number(brushSize.value);
  const fitWithin = (width, height, edge) => {
    const factor = Math.min(1, edge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
  };

  function status(key, error = false) {
    currentStatus = { key, error };
    byId('status-row').hidden = !key;
    byId('status').textContent = key ? text(key) : '';
    byId('status').classList.toggle('is-error', error);
  }

  function refreshControls() {
    for (const button of modeButtons) {
      button.setAttribute('aria-pressed', String(mode === button.dataset.mode));
      const selectionTool = button.dataset.mode === 'pick' || button.dataset.mode === 'rectangle';
      button.disabled = selectionTool ? !canEdit() : !canBrush();
    }
    sourceFrame.classList.toggle('is-brushing', isBrushMode());
    sourceFrame.classList.toggle('is-boxing', mode === 'rectangle');
    byId('brush-controls').hidden = !isBrushMode();
    brushSize.disabled = !canBrush();
    byId('empty-stage').hidden = Boolean(image);
    byId('loaded-stage').hidden = !image;
    undo.disabled = !edits.length || !canEdit();
    redo.disabled = !undoneEdits.length || !canEdit();
    reset.disabled = !canEdit() || (!hasSelection() && marker.hidden && !keyboardRectangleStart);
    const removal = outputMode === 'remove';
    const filled = removal && downloadableFill();
    download.disabled = (!hasSelection() && !filled) || isBusy() || Boolean(stroke);
    continueButton.hidden = !removal || !repairResult;
    continueButton.disabled = !canEdit();
    byId('action-label').textContent = removal
      ? text(repairRequest ? 'repairing' : filled ? 'downloadFilled' : 'remove')
      : text(exporting ? 'exporting' : 'downloadKeep');
    byId('download-icon').hidden = removal && !filled;
    byId('repair-icon').hidden = !removal || Boolean(filled);
    for (const button of outputButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.output === outputMode));
      button.disabled = !image || Boolean(repairRequest || stroke || exporting);
    }
    cancelRepair.hidden = !repairRequest || repairRequest.signal.aborted;
    byId('upload').disabled = !image || Boolean(repairRequest || exporting);
    byId('choose').disabled = loadingImage;
    byId('zoom-out').disabled = !image || scale <= 1;
    byId('zoom-in').disabled = !image || scale >= 3;
    byId('zoom-fit').disabled = !image;
  }

  function setMode(next) {
    if (stroke || ((next === 'add' || next === 'erase') && !canBrush())) return;
    mode = next;
    keyboardRectangleStart = undefined;
    source.style.cursor = '';
    brushCursor.hidden = true;
    updateCanvasHint();
    redraw();
    refreshControls();
  }

  function updateCanvasHint() {
    const remove = outputMode === 'remove';
    byId('canvas-hint').textContent = ({
      pick: remove ? text('pickRemoveHint') : text('pickHint'),
      rectangle: text('rectangleHint'),
      add: text('addHint'),
      erase: remove ? text('eraseRemoveHint') : text('eraseKeepHint'),
    })[mode];
    source.setAttribute('aria-label', text(mode === 'rectangle' ? 'rectangleCanvasLabel' : 'canvasLabel'));
  }

  function layout() {
    if (!image) return;
    fitted = Math.min(...[originalStage, previewStage].map((viewport) => {
      const style = getComputedStyle(viewport);
      const width = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      return Math.min(width / source.width, height / source.height);
    }));
    const displayW = Math.max(1, source.width * fitted * scale);
    const displayH = Math.max(1, source.height * fitted * scale);
    for (const element of [sourceFrame, previewFrame]) {
      element.style.width = `${displayW}px`;
      element.style.height = `${displayH}px`;
    }
    byId('zoom-fit').textContent = scale === 1 ? text('fit') : `${Math.round(scale * 100)}%`;
    redraw();
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
  imageObserver.observe(previewStage);

  function clearRepairResult() {
    repairResult?.preview.close();
    repairResult = undefined;
  }

  function clearSelection() {
    clearRepairResult();
    lastSelection = undefined;
    edits = [];
    undoneEdits = [];
    stroke = undefined;
    keyboardRectangleStart = undefined;
    nextPoint = { x: 0.5, y: 0.5 };
    marker.hidden = true;
    lastTiming = undefined;
    byId('timing').textContent = '';
    byId('timing').removeAttribute('title');
    for (const canvas of [outline, result, mask, removalMask]) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    showPreview();
    setMode('pick');
  }

  function showPreview() {
    const removal = outputMode === 'remove';
    const ready = removal ? Boolean(repairResult && !stroke) : hasSelection();
    byId('preview-title').textContent = removal ? text('fillPreview') : text('keepPreview');
    byId('preview-backgrounds').hidden = removal;
    previewStage.dataset.background = removal ? 'image' : previewBackground;
    previewFrame.hidden = !ready;
    const empty = byId('preview-empty');
    empty.hidden = ready;
    empty.textContent = removal
      ? repairRequest
        ? text('waitingForFill')
        : text('emptyFill')
      : text('emptyKeep');
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

  async function openImage(url, name, continued) {
    repairRequest?.abort();
    const version = ++sourceVersion;
    loadingImage = true;
    running = false;
    status('reading');
    refreshControls();
    const next = new Image();
    next.src = url;
    try {
      await next.decode();
      if (version !== sourceVersion) return;
      if (next.naturalWidth * next.naturalHeight > 24_000_000)
        throw new Error('maxPixels');
      if (activeSource?.startsWith('blob:')) URL.revokeObjectURL(activeSource);
      activeSource = url;
      image = next;
      workingResult = continued;
      if (!continued) scale = 1;
      const { width, height } = fitWithin(next.naturalWidth, next.naturalHeight, 1100);
      for (const canvas of [source, outline, result, mask, removalMask]) {
        canvas.width = width;
        canvas.height = height;
      }
      source.getContext('2d').drawImage(image, 0, 0, width, height);
      sourceFrame.hidden = false;
      byId('file-name').textContent = name;
      byId('file-size').textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
      byId('original-title').textContent = text(continued ? 'workingImage' : 'original');
      clearSelection();
      status(continued ? 'continueHint' : 'chooseHint');
      setZoom(scale);
    } catch (error) {
      if (version === sourceVersion) status(error.message === 'maxPixels' ? 'maxPixels' : 'openFailed', true);
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
      lifetime.signal.throwIfAborted();
      modelWorker ??= new Worker(new URL('./engine/worker.js', import.meta.url));
    } catch (error) {
      bitmap.close();
      throw error;
    }
    const id = ++requestId;
    const worker = modelWorker;
    return new Promise((resolve, reject) => {
      function settle(error, selection) {
        cancelWorkerRequest = undefined;
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
      cancelWorkerRequest = () => settle(lifetime.signal.reason);
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
        lifetime.signal.throwIfAborted();
        console.info('Worker inference unavailable, trying the browser thread:', error.message);
        workerFailed = true;
        modelWorker?.terminate();
        modelWorker = undefined;
      }
    }
    const { selectSubject, releaseSegmenter } = await import('./engine/segment.js');
    lifetime.signal.throwIfAborted();
    releaseFallbackModel = releaseSegmenter;
    return { ...await selectSubject(input, point), backend: text('mainThread') };
  }

  function drawSelection(selection, context, alpha) {
    const { width, height } = selection;
    transientMask.width = width;
    transientMask.height = height;
    const small = transientMask.getContext('2d');
    const pixels = small.createImageData(width, height);
    for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i];
    small.putImageData(pixels, 0, 0);
    small.globalCompositeOperation = 'source-in';
    small.fillStyle = SELECTION_COLOR;
    small.fillRect(0, 0, width, height);
    context.drawImage(transientMask, 0, 0, context.canvas.width, context.canvas.height);
  }

  async function pick(point) {
    if (!canEdit()) return;
    const x = Math.min(mask.width - 1, Math.floor(point.x * mask.width));
    const y = Math.min(mask.height - 1, Math.floor(point.y * mask.height));
    if (hasSelection() && maskContext.getImageData(x, y, 1, 1).data[3] > 220) return;
    const version = sourceVersion;
    running = true;
    nextPoint = point;
    showMarker(point);
    status(hasSelection() ? 'selecting' : 'loadingSegmentation');
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
        status('noSubject', true);
        return;
      }
      const pickEdit = { mode: 'select', selection, point, removalAlpha: createRemovalAlpha(selection) };
      edits.push(pickEdit);
      undoneEdits = [];
      lastSelection = point;
      clearRepairResult();
      paintEdit(pickEdit);
      redraw();
      lastTiming = selection.milliseconds;
      byId('timing').textContent = text('timing', { ms: lastTiming });
      byId('timing').title = selection.backend;
      status('selected');
    } catch (error) {
      if (sourceVersion === version) {
        console.warn('Segmentation failed:', error);
        status('selectFailed', true);
      }
    } finally {
      if (sourceVersion === version) {
        running = false;
        if (lastSelection) showMarker(lastSelection);
        else marker.hidden = true;
        refreshControls();
      }
    }
  }

  function redraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!image) return;
      const width = mask.width;
      const height = mask.height;
      showPreview();

      const overlay = outline.getContext('2d');
      overlay.clearRect(0, 0, width, height);
      if (hasSelection()) {
        const showExpanded = outputMode === 'remove';
        const selection = showExpanded ? removalMask : mask;
        const thickness = Math.max(1, 1.6 / Math.max(0.35, fitted * scale));
        for (const [x, y] of [[-1,0], [1,0], [0,-1], [0,1]]) overlay.drawImage(selection, x * thickness, y * thickness);
        overlay.globalCompositeOperation = 'destination-out';
        overlay.drawImage(selection, 0, 0);
        overlay.globalCompositeOperation = 'source-in';
        overlay.fillStyle = SELECTION_COLOR;
        overlay.fillRect(0, 0, width, height);
        overlay.globalCompositeOperation = 'source-over';
        if (showExpanded) {
          overlay.save();
          overlay.globalAlpha = 0.16;
          overlay.drawImage(selection, 0, 0);
          overlay.restore();
        }
      }
      if (mode === 'rectangle') drawRectangleOverlay(overlay);
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
      gradient.addColorStop(0, SELECTION_COLOR);
      gradient.addColorStop(1, 'transparent');
      context.fillStyle = gradient;
      context.fillRect(x - edit.radius, y - edit.radius, edit.radius * 2, edit.radius * 2);
    }
    context.restore();
  }

  function drawStrokeSegment(edit, from, to = from) {
    drawEdit(edit, from, to);
    drawEdit(edit, from, to, removalContext);
  }

  function paintEdit(edit) {
    if (edit.mode === 'rectangle') {
      const { x, y, width, height } = edit.rect;
      for (const context of [maskContext, removalContext]) {
        context.fillStyle = SELECTION_COLOR;
        context.fillRect(x, y, width, height);
      }
      return;
    }
    if (edit.mode === 'select') {
      drawSelection(edit.selection, maskContext, edit.selection.alpha);
      drawSelection(edit.selection, removalContext, edit.removalAlpha);
      transientMask.width = transientMask.height = 1;
      return;
    }
    drawStrokeSegment(edit, edit.points[0]);
    for (let i = 1; i < edit.points.length; i++) drawStrokeSegment(edit, edit.points[i - 1], edit.points[i]);
  }

  function replayEdits(excluded) {
    maskContext.clearRect(0, 0, mask.width, mask.height);
    removalContext.clearRect(0, 0, removalMask.width, removalMask.height);
    const replaced = new Set(edits.flatMap((edit) => edit.replaces ? [edit.replaces] : []));
    for (const edit of edits) {
      if (edit !== excluded && !replaced.has(edit)) paintEdit(edit);
    }
    lastSelection = edits.findLast((edit) => edit.mode === 'select')?.point;
    nextPoint = lastSelection ?? { x: 0.5, y: 0.5 };
    if (lastSelection) showMarker(lastSelection);
    else marker.hidden = true;
    if (!hasSelection() && isBrushMode()) setMode('pick');
    redraw();
  }

  function restoreLastEdit() {
    if (!edits.length || !canEdit()) return;
    undoneEdits.push(edits.pop());
    clearRepairResult();
    replayEdits();
    status('undone');
    refreshControls();
  }

  function restoreUndoneEdit() {
    if (!undoneEdits.length || !canEdit()) return;
    edits.push(undoneEdits.pop());
    clearRepairResult();
    replayEdits();
    status('redone');
    refreshControls();
  }

  function showBrush(point) {
    const diameter = displayDiameter();
    brushCursor.hidden = false;
    brushCursor.style.width = brushCursor.style.height = `${diameter}px`;
    brushCursor.style.left = `${point.x * 100}%`;
    brushCursor.style.top = `${point.y * 100}%`;
  }

  function sourcePixel(point) {
    return { x: point.x * source.width, y: point.y * source.height };
  }

  function activeRectangle() {
    const edit = edits.at(-1);
    return edit?.mode === 'rectangle' ? edit : undefined;
  }

  function rectangleHit(point, pointerType) {
    const edit = activeRectangle();
    const frameScale = fitted * scale;
    if (!edit || !frameScale) return;
    const hit = hitRepairRectangle([edit.rect], 0, point, (pointerType === 'touch' ? 18 : 8) / frameScale);
    return hit && { edit, handle: hit.handle };
  }

  function rectangleDraft(gesture, point) {
    if (!gesture.previous) return rectangleBetween(gesture.start, point);
    const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
    const rect = gesture.previous.rect;
    return gesture.handle
      ? resizeRepairRectangle(rect, gesture.handle, delta, source.width, source.height)
      : moveRepairRectangle(rect, delta, source.width, source.height);
  }

  function drawRectangleOverlay(overlay) {
    const draft = stroke?.mode === 'rectangle'
      ? stroke.draft
      : keyboardRectangleStart && rectangleBetween(keyboardRectangleStart, sourcePixel(nextPoint));
    const rect = draft ?? activeRectangle()?.rect;
    if (!rect) return;
    const { x, y, width, height } = rect;
    const density = 1 / Math.max(0.05, fitted * scale);
    overlay.save();
    overlay.lineWidth = 1.5 * density;
    overlay.strokeStyle = SELECTION_COLOR;
    overlay.strokeRect(x, y, width, height);
    if (draft) {
      overlay.globalAlpha = 0.16;
      overlay.fillStyle = SELECTION_COLOR;
      overlay.fillRect(x, y, width, height);
    } else {
      const size = 6 * density;
      overlay.fillStyle = '#fff';
      for (const handle of repairRectangleHandles(rect)) {
        overlay.fillRect(handle.x - size / 2, handle.y - size / 2, size, size);
        overlay.strokeRect(handle.x - size / 2, handle.y - size / 2, size, size);
      }
    }
    overlay.restore();
  }

  function commitRectangle(rect, previous) {
    const side = Math.min(rect.width, rect.height);
    if (side < 2 || side * fitted * scale < 2) return false;
    if (previous && ['x', 'y', 'width', 'height'].every((key) => previous.rect[key] === rect[key])) return false;
    edits.push({ mode: 'rectangle', rect, replaces: previous });
    undoneEdits = [];
    clearRepairResult();
    replayEdits();
    status('rectangleSelected');
    return true;
  }

  source.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || mode === 'pick' || !canEdit()) return;
    if (isBrushMode() && !canBrush()) return;
    event.preventDefault();
    source.focus({ preventScroll: true });
    source.setPointerCapture(event.pointerId);
    keyboardRectangleStart = undefined;
    const point = pointOnSource(event);
    if (mode === 'rectangle') {
      const start = sourcePixel(point);
      const hit = rectangleHit(start, event.pointerType);
      stroke = { mode, id: event.pointerId, start, previous: hit?.edit, handle: hit?.handle };
      stroke.draft = rectangleDraft(stroke, start);
      if (hit) replayEdits(hit.edit);
    } else {
      const radius = displayDiameter() * source.width / source.getBoundingClientRect().width / 2;
      stroke = { mode, radius, points: [point], id: event.pointerId };
      drawStrokeSegment(stroke, point);
      showBrush(point);
    }
    refreshControls();
    redraw();
  });
  source.addEventListener('pointermove', (event) => {
    const point = pointOnSource(event);
    if (mode === 'rectangle') {
      if (stroke?.id === event.pointerId) {
        stroke.draft = rectangleDraft(stroke, sourcePixel(point));
        redraw();
      } else if (!stroke && canEdit() && event.pointerType === 'mouse') {
        const hit = rectangleHit(sourcePixel(point), event.pointerType);
        source.style.cursor = hit ? hit.handle ? `${hit.handle}-resize` : 'move' : '';
      }
      return;
    }
    if (!isBrushMode() || !canBrush()) return;
    showBrush(point);
    if (stroke?.id !== event.pointerId) return;
    drawStrokeSegment(stroke, stroke.points.at(-1), point);
    stroke.points.push(point);
    redraw();
  });
  source.addEventListener('pointerleave', () => {
    if (!stroke) {
      brushCursor.hidden = true;
      source.style.cursor = '';
    }
  });
  function finishStroke(event) {
    if (stroke?.id !== event.pointerId) return;
    const finished = stroke;
    stroke = undefined;
    if (finished.mode === 'rectangle') {
      const rect = event.type === 'pointerup'
        ? rectangleDraft(finished, sourcePixel(pointOnSource(event)))
        : event.type === 'lostpointercapture' ? finished.draft : undefined;
      if (!(rect && commitRectangle(rect, finished.previous)) && finished.previous) replayEdits();
    } else if (event.type === 'pointercancel') replayEdits();
    else {
      undoneEdits = [];
      edits.push(finished);
      clearRepairResult();
      status(finished.mode === 'add' ? 'added' : 'erased');
    }
    redraw();
    refreshControls();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) source.addEventListener(type, finishStroke);
  source.addEventListener('click', (event) => {
    if (mode === 'pick') void pick(pointOnSource(event));
  });
  source.addEventListener('keydown', (event) => {
    if ((mode !== 'rectangle' && mode !== 'pick') || !canEdit()) return;
    if (event.key === 'Escape' && keyboardRectangleStart) {
      event.preventDefault();
      keyboardRectangleStart = undefined;
      marker.hidden = !lastSelection;
      if (lastSelection) showMarker(lastSelection);
      redraw();
      refreshControls();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (mode === 'pick') void pick(nextPoint);
      else if (keyboardRectangleStart) {
        if (commitRectangle(rectangleBetween(keyboardRectangleStart, sourcePixel(nextPoint)))) {
          keyboardRectangleStart = undefined;
          marker.hidden = !lastSelection;
          if (lastSelection) showMarker(lastSelection);
        }
      } else keyboardRectangleStart = sourcePixel(nextPoint);
      redraw();
      refreshControls();
      return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    nextPoint = {
      x: Math.min(1, Math.max(0, nextPoint.x + delta[0] * .025)),
      y: Math.min(1, Math.max(0, nextPoint.y + delta[1] * .025)),
    };
    showMarker(nextPoint);
    if (mode === 'rectangle') redraw();
    refreshControls();
  });
  source.addEventListener('blur', () => {
    if (!keyboardRectangleStart) return;
    keyboardRectangleStart = undefined;
    marker.hidden = !lastSelection;
    if (lastSelection) showMarker(lastSelection);
    redraw();
    refreshControls();
  });

  byId('choose').addEventListener('click', options.openPicker);
  byId('upload').addEventListener('click', options.openPicker);
  function acceptImage(files) {
    if (!files.length || lifetime.signal.aborted || repairRequest || exporting) return;
    if (files.length !== 1) {
      status('oneImage', true);
      return;
    }
    const [file] = files;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      status('invalidFormat', true);
      return;
    }
    void openImage(URL.createObjectURL(file), file.name);
  }
  for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
  brushSize.addEventListener('input', () => {
    byId('brush-value').textContent = `${displayDiameter()} px`;
    brushCursor.hidden = true;
  });
  undo.addEventListener('click', restoreLastEdit);
  redo.addEventListener('click', restoreUndoneEdit);
  reset.addEventListener('click', () => {
    if (!canEdit() || reset.disabled) return;
    clearSelection();
    status('selectionReset');
  });
  continueButton.addEventListener('click', () => {
    if (!canEdit() || !repairResult) return;
    const { png } = repairResult;
    void openImage(URL.createObjectURL(png), byId('file-name').textContent, { png });
  });
  root.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || !canEdit()) return;
    const history = event.shiftKey ? undoneEdits : edits;
    if (!history.length) return;
    event.preventDefault();
    if (event.shiftKey) restoreUndoneEdit();
    else restoreLastEdit();
  }, { signal: lifetime.signal });
  byId('zoom-out').addEventListener('click', () => setZoom(scale / 1.5));
  byId('zoom-in').addEventListener('click', () => setZoom(scale * 1.5));
  byId('zoom-fit').addEventListener('click', () => setZoom(1));
  for (const button of outputButtons) {
    button.addEventListener('click', () => {
      if (button.disabled || outputMode === button.dataset.output) return;
      outputMode = button.dataset.output;
      updateCanvasHint();
      status(outputMode === 'keep'
        ? 'keepHint'
        : downloadableFill() ? 'fillReady' : 'fillHint');
      showPreview();
      redraw();
      refreshControls();
    });
  }
  for (const button of root.querySelectorAll('#preview-backgrounds button')) {
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
    status('repairing');
    refreshControls();
    showPreview();
    try {
      modelWorker?.terminate();
      modelWorker = undefined;
      if (releaseFallbackModel) await releaseFallbackModel();
      const { removeSubject } = await import('./engine/remove-subject.js');
      const repaired = await removeSubject(image, removalMask, controller.signal);
      if (sourceVersion !== version || controller.signal.aborted) {
        repaired.preview.close();
        return;
      }
      repairResult = repaired;
      status('fillDone');
    } catch (error) {
      if (sourceVersion !== version) return;
      if (controller.signal.aborted) {
        status('cancelled');
      } else {
        const messages = {
          unsupported: 'unsupported',
          selection: 'invalidSelection',
          background: 'needsBackground',
          load: 'loadFailed',
        };
        status(messages[error.message] ?? 'fillFailed', true);
      }
    } finally {
      repairRequest = undefined;
      if (version === sourceVersion) {
        showPreview();
        refreshControls();
      }
    }
  }

  cancelRepair.addEventListener('click', () => {
    repairRequest?.abort();
    refreshControls();
  });

  download.addEventListener('click', async () => {
    if (isBusy() || stroke || download.disabled) return;
    if (outputMode === 'remove') {
      const filled = downloadableFill();
      if (filled) {
        downloadPng(filled.png, text('fillSuffix'));
        status('fillDownloaded');
      } else {
        await repairSelection();
      }
      return;
    }
    const version = sourceVersion;
    exporting = true;

    const clean = document.createElement('canvas');
    clean.width = image.naturalWidth;
    clean.height = image.naturalHeight;
    try {
      refreshControls();
      status('exportingOriginal');
      const output = clean.getContext('2d');
      output.drawImage(image, 0, 0);
      output.globalCompositeOperation = 'destination-in';
      output.drawImage(mask, 0, 0, clean.width, clean.height);
      const png = await new Promise((resolve) => clean.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('PNG unavailable');
      if (version === sourceVersion) {
        downloadPng(png, text('keepSuffix'));
        status('keepDownloaded');
      }
    } catch {
      if (version === sourceVersion) status('exportFailed', true);
    } finally {
      clean.width = 1;
      clean.height = 1;
      exporting = false;
      refreshControls();
    }
  });

  refreshControls();

  return {
    acceptImage,
    refreshLanguage() {
      if (!image) byId('file-name').textContent = text('noImage');
      byId('original-title').textContent = text(workingResult ? 'workingImage' : 'original');
      if (currentStatus) status(currentStatus.key, currentStatus.error);
      if (lastTiming !== undefined) byId('timing').textContent = text('timing', { ms: lastTiming });
      refreshControls();
      updateCanvasHint();
      showPreview();
      layout();
    },
    dispose() {
      ++sourceVersion;
      lifetime.abort();
      cancelWorkerRequest?.();
      modelWorker?.terminate();
      repairRequest?.abort();
      void releaseFallbackModel?.();
      imageObserver.disconnect();
      cancelAnimationFrame(frame);
      clearRepairResult();
      if (activeSource) URL.revokeObjectURL(activeSource);
    },
  };
}
