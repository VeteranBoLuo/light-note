let model;
const asset = (name) => new URL(name, new URL('../local-assets/engine/', import.meta.url)).href;

async function loadModel() {
  const { FilesetResolver, InteractiveSegmenter } = await import(/* @vite-ignore */ asset('./vision_bundle.mjs'));
  const runtime = await FilesetResolver.forVisionTasks(asset('./wasm'));
  return InteractiveSegmenter.createFromOptions(runtime, {
    baseOptions: { modelAssetPath: asset('./magic.tflite'), delegate: 'CPU' },
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
}

function probabilityAtPoint(data, width, height, point) {
  const cx = Math.round(point.x * (width - 1));
  const cy = Math.round(point.y * (height - 1));
  let total = 0;
  let count = 0;
  for (let y = Math.max(0, cy - 2); y <= Math.min(height - 1, cy + 2); y++) {
    for (let x = Math.max(0, cx - 2); x <= Math.min(width - 1, cx + 2); x++) {
      total += data[y * width + x];
      count++;
    }
  }
  return total / count;
}

export async function selectSubject(input, point) {
  model ??= loadModel().catch((error) => {
    model = undefined;
    throw error;
  });
  const ready = await model;
  const start = performance.now();
  const result = ready.segment(input, { keypoint: point });
  try {
    const planes = result.confidenceMasks;
    if (!planes?.length) throw new Error('Mask unavailable');
    const { width, height } = planes[0];
    let confidence;
    let strongest = -1;
    for (const mask of planes) {
      const values = mask.getAsFloat32Array();
      const strength = probabilityAtPoint(values, width, height, point);
      if (strength <= strongest) continue;
      confidence = values;
      strongest = strength;
    }
    const alpha = new Uint8ClampedArray(width * height);
    let covered = 0;
    for (let index = 0; index < alpha.length; index++) {
      const probability = planes.length === 1 && strongest < 0.5 ? 1 - confidence[index] : confidence[index];
      // Keep intermediate opacity near the model's boundary and suppress low-confidence spill.
      const edge = Math.min(1, Math.max(0, (probability - 0.26) / 0.48));
      alpha[index] = 255 * edge * edge * (3 - 2 * edge);
      if (alpha[index] > 127) covered++;
    }
    const milliseconds = Math.round(performance.now() - start);
    return { alpha, width, height, milliseconds, coverage: covered / alpha.length };
  } finally {
    result.close();
  }
}

export async function releaseSegmenter() {
  const cached = model;
  model = undefined;
  if (cached) (await cached.catch(() => undefined))?.close();
}
