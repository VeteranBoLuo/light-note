export const REMOVAL_ALPHA_THRESHOLD = 110;

// Expand in two sweeps so the work stays proportional to the mask size.
export function expandedRemovalMask(mask) {
  const { width, height } = mask;
  const source = mask.getContext('2d').getImageData(0, 0, width, height).data;
  const radius = Math.max(2, Math.round(Math.max(width, height) * 52 / 1100));
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let nearest = -radius - 1;
    for (let x = 0; x < width; x++) {
      if (source[(row + x) * 4 + 3] >= REMOVAL_ALPHA_THRESHOLD) nearest = x;
      if (x - nearest <= radius) horizontal[row + x] = 1;
    }
    nearest = width + radius;
    for (let x = width - 1; x >= 0; x--) {
      if (source[(row + x) * 4 + 3] >= REMOVAL_ALPHA_THRESHOLD) nearest = x;
      if (nearest - x <= radius) horizontal[row + x] = 1;
    }
  }

  const expansion = document.createElement('canvas');
  expansion.width = width;
  expansion.height = height;
  const context = expansion.getContext('2d');
  const pixels = context.createImageData(width, height);
  for (let x = 0; x < width; x++) {
    let nearest = -radius - 1;
    for (let y = 0; y < height; y++) {
      const index = y * width + x;
      if (horizontal[index]) nearest = y;
      if (y - nearest <= radius) pixels.data[index * 4 + 3] = 255;
    }
    nearest = height + radius;
    for (let y = height - 1; y >= 0; y--) {
      const index = y * width + x;
      if (horizontal[index]) nearest = y;
      if (nearest - y <= radius) pixels.data[index * 4 + 3] = 255;
    }
  }
  for (let index = 0; index < pixels.data.length; index += 4) {
    pixels.data[index] = 117;
    pixels.data[index + 1] = 76;
    pixels.data[index + 2] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return expansion;
}
