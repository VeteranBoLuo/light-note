export const REMOVAL_ALPHA_THRESHOLD = 110;

// Refine each detected subject before combining it with other subjects or brush strokes.
export function createRemovalAlpha({ alpha, width, height }) {
  const distances = new Uint16Array(alpha.length);
  distances.fill(65535);
  let area = 0;
  let perimeter = 0;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alpha[i] < REMOVAL_ALPHA_THRESHOLD) continue;
      distances[i] = 0;
      area++;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      if (
        (x > 0 && alpha[i - 1] < REMOVAL_ALPHA_THRESHOLD) ||
        (x + 1 < width && alpha[i + 1] < REMOVAL_ALPHA_THRESHOLD) ||
        (y > 0 && alpha[i - width] < REMOVAL_ALPHA_THRESHOLD) ||
        (y + 1 < height && alpha[i + width] < REMOVAL_ALPHA_THRESHOLD)
      ) perimeter++;
    }
  }

  const result = new Uint8ClampedArray(alpha.length);
  if (!area) return result;
  const imageEdge = Math.max(width, height);
  const subjectEdge = Math.min(right - left + 1, bottom - top + 1);
  const padding = Math.max(1, Math.round(imageEdge / 512));
  // A smooth object needs a narrow seam. A dense contour has more thin edges to clean up.
  const detail = Math.min(1, Math.max(0, (perimeter / Math.sqrt(area) - 4.15) / 2.8));
  const detailPadding = Math.max(padding, Math.min(imageEdge * 0.045, subjectEdge * 0.085));
  const threshold = Math.round((padding + detail * (detailPadding - padding)) * 3);
  const x0 = Math.max(0, left - Math.ceil(threshold / 3));
  const x1 = Math.min(width - 1, right + Math.ceil(threshold / 3));
  const y0 = Math.max(0, top - Math.ceil(threshold / 3));
  const y1 = Math.min(height - 1, bottom + Math.ceil(threshold / 3));

  // Two passes approximate a round dilation. Diagonals cost more than horizontal and vertical steps.
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      if (distances[i] === 0) continue;
      if (x > x0) distances[i] = Math.min(distances[i], distances[i - 1] + 3);
      if (y === y0) continue;
      distances[i] = Math.min(distances[i], distances[i - width] + 3);
      if (x > x0) distances[i] = Math.min(distances[i], distances[i - width - 1] + 4);
      if (x < x1) distances[i] = Math.min(distances[i], distances[i - width + 1] + 4);
    }
  }
  for (let y = y1; y >= y0; y--) {
    for (let x = x1; x >= x0; x--) {
      const i = y * width + x;
      if (x < x1) distances[i] = Math.min(distances[i], distances[i + 1] + 3);
      if (y < y1) {
        distances[i] = Math.min(distances[i], distances[i + width] + 3);
        if (x > x0) distances[i] = Math.min(distances[i], distances[i + width - 1] + 4);
        if (x < x1) distances[i] = Math.min(distances[i], distances[i + width + 1] + 4);
      }
      if (distances[i] <= threshold) result[i] = 255;
    }
  }
  return result;
}
