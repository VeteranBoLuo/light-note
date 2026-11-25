import {
  ENHANCED_REPAIR_EDGE,
  paintRepairSelection,
  type ImageRect,
  type RepairSelection,
} from './imageRepairSelection';

const MASK_STRIP_PIXELS = 512_000;

type RepairPatch =
  | { status: 'needs-background' }
  | {
      status: 'ready';
      width: number;
      height: number;
      mask: Uint8Array<ArrayBuffer>;
      originalMask?: Uint8Array<ArrayBuffer>;
    };

export function prepareRepairPatch(selections: readonly RepairSelection[], bounds: ImageRect): RepairPatch {
  const area = bounds.width * bounds.height;
  if (!area) return { status: 'needs-background' };

  const originalMask = new Uint8Array(area);
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width;
  // Read the full-resolution mask in strips to bound RGBA scratch memory.
  canvas.height = Math.min(bounds.height, Math.floor(MASK_STRIP_PIXELS / bounds.width));
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    for (let top = 0; top < bounds.height; top += canvas.height) {
      const rows = Math.min(canvas.height, bounds.height - top);
      context.resetTransform();
      context.clearRect(0, 0, canvas.width, rows);
      context.translate(-bounds.x, -bounds.y - top);
      for (const selection of selections) paintRepairSelection(context, selection);

      const rgba = context.getImageData(0, 0, bounds.width, rows).data;
      const offset = top * bounds.width;
      for (let index = 0; index < rgba.length / 4; index += 1) {
        if (rgba[index * 4 + 3] < 128) continue;
        originalMask[offset + index] = 255;
      }
    }
  } finally {
    canvas.width = canvas.height = 1;
  }

  if (!originalMask.includes(255) || !originalMask.includes(0)) return { status: 'needs-background' };
  const scale = ENHANCED_REPAIR_EDGE / Math.max(bounds.width, bounds.height);
  if (scale >= 1) {
    return { status: 'ready', width: bounds.width, height: bounds.height, mask: originalMask };
  }

  const width = Math.max(1, Math.floor(bounds.width * scale));
  const height = Math.max(1, Math.floor(bounds.height * scale));
  const mask = new Uint8Array(width * height);
  // Project selected source pixels individually so thin strokes survive reduction.
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceRow = y * bounds.width;
    const workingRow = Math.floor((y * height) / bounds.height) * width;
    for (let x = 0; x < bounds.width; x += 1) {
      if (originalMask[sourceRow + x]) mask[workingRow + Math.floor((x * width) / bounds.width)] = 255;
    }
  }
  if (!mask.includes(0)) return { status: 'needs-background' };
  return { status: 'ready', width, height, mask, originalMask };
}

export function applyReducedRepairPatch(
  output: CanvasRenderingContext2D,
  repaired: ImageData,
  bounds: ImageRect,
  originalMask: Uint8Array,
) {
  const patch = document.createElement('canvas');
  const strip = document.createElement('canvas');
  patch.width = repaired.width;
  patch.height = repaired.height;
  strip.width = bounds.width;
  strip.height = Math.min(bounds.height, Math.floor(MASK_STRIP_PIXELS / bounds.width));
  try {
    const patchContext = patch.getContext('2d');
    const stripContext = strip.getContext('2d', { willReadFrequently: true });
    if (!patchContext || !stripContext) throw new Error('Canvas unavailable');
    patchContext.putImageData(repaired, 0, 0);
    for (let top = 0; top < bounds.height; top += strip.height) {
      const rows = Math.min(strip.height, bounds.height - top);
      const offset = top * bounds.width;
      const mask = originalMask.subarray(offset, offset + rows * bounds.width);
      if (!mask.includes(255)) continue;
      stripContext.clearRect(0, 0, strip.width, rows);
      stripContext.drawImage(patch, 0, -top, bounds.width, bounds.height);
      const repairedPixels = stripContext.getImageData(0, 0, strip.width, rows).data;
      const destination = output.getImageData(bounds.x, bounds.y + top, bounds.width, rows);
      for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const rgba = index * 4;
        destination.data[rgba] = repairedPixels[rgba];
        destination.data[rgba + 1] = repairedPixels[rgba + 1];
        destination.data[rgba + 2] = repairedPixels[rgba + 2];
      }
      output.putImageData(destination, bounds.x, bounds.y + top);
    }
  } finally {
    patch.width = patch.height = strip.width = strip.height = 1;
  }
}
