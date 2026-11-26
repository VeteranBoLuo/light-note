import { applyReducedRepairPatch, enhancedRepairBounds, ENHANCED_REPAIR_EDGE, runEnhancedImageRepair } from './repair-core.js';
import { REMOVAL_ALPHA_THRESHOLD } from './removal-mask.js';

function prepareMask(mask, imageWidth, imageHeight) {
  const { width, height } = mask;
  const { data } = mask.getContext('2d').getImageData(0, 0, width, height);
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < REMOVAL_ALPHA_THRESHOLD) continue;
      left = Math.min(x, left);
      top = Math.min(y, top);
      right = Math.max(x + 1, right);
      bottom = Math.max(y + 1, bottom);
    }
  }
  if (left >= right || top >= bottom) throw new Error('selection');

  const x = Math.floor(left * imageWidth / width);
  const y = Math.floor(top * imageHeight / height);
  const rect = {
    x, y,
    width: Math.ceil(right * imageWidth / width) - x,
    height: Math.ceil(bottom * imageHeight / height) - y,
  };
  const bounds = enhancedRepairBounds(rect, imageWidth, imageHeight);
  const ratio = Math.min(1, ENHANCED_REPAIR_EDGE / Math.max(bounds.width, bounds.height));
  const workingWidth = Math.max(1, Math.floor(bounds.width * ratio));
  const workingHeight = Math.max(1, Math.floor(bounds.height * ratio));
  const originalMask = new Uint8Array(bounds.width * bounds.height);
  const workingMask = new Uint8Array(workingWidth * workingHeight);
  // Project from the editor mask without allocating a full-size RGBA array.
  const editorColumns = Int32Array.from({ length: bounds.width }, (_, col) =>
    Math.floor((bounds.x + col + 0.5) * width / imageWidth));
  const workingColumns = Int32Array.from({ length: bounds.width }, (_, col) =>
    Math.floor(col * workingWidth / bounds.width));
  for (let row = 0; row < bounds.height; row++) {
    const editorRow = Math.floor((bounds.y + row + 0.5) * height / imageHeight) * width;
    const originalRow = row * bounds.width;
    const workingRow = Math.floor(row * workingHeight / bounds.height) * workingWidth;
    for (let col = 0; col < bounds.width; col++) {
      const alpha = data[(editorRow + editorColumns[col]) * 4 + 3];
      if (alpha < REMOVAL_ALPHA_THRESHOLD) continue;
      originalMask[originalRow + col] = 255;
      workingMask[workingRow + workingColumns[col]] = 255;
    }
  }
  if (!workingMask.includes(255)) throw new Error('selection');
  if (!workingMask.includes(0)) throw new Error('background');
  return { bounds, workingWidth, workingHeight, originalMask, workingMask };
}

export async function removeSubject(image, mask, signal, onPhase) {
  signal.throwIfAborted();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const { bounds, workingWidth, workingHeight, originalMask, workingMask } = prepareMask(mask, width, height);
  const working = document.createElement('canvas');
  working.width = workingWidth;
  working.height = workingHeight;
  const context = working.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, workingWidth, workingHeight);
  const input = context.getImageData(0, 0, workingWidth, workingHeight);
  working.width = working.height = 1;
  const repaired = await runEnhancedImageRepair(input, workingMask, signal, onPhase);
  signal.throwIfAborted();

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  let preview;
  try {
    const destination = output.getContext('2d', { willReadFrequently: true });
    destination.drawImage(image, 0, 0);
    applyReducedRepairPatch(destination, repaired, bounds, originalMask);
    // Keep a small display bitmap and the PNG, then release the full-size canvas.
    preview = await createImageBitmap(output, { resizeWidth: mask.width, resizeHeight: mask.height });
    const png = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    signal.throwIfAborted();
    if (!png) throw new Error('export');
    return { preview, png };
  } catch (error) {
    preview?.close();
    throw error;
  } finally {
    output.width = output.height = 1;
  }
}
