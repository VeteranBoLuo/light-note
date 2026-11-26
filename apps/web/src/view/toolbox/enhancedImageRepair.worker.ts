import type { EnhancedRepairError, EnhancedRepairRequest, EnhancedRepairResponse } from './enhancedImageRepairEngine';
import { canUseEnhancedImageRepair } from './imageRepairCapabilities';
import { ENHANCED_REPAIR_EDGE as EDGE } from './imageRepairSelection';

const AREA = EDGE * EDGE;
const scope = globalThis as unknown as {
  postMessage(message: EnhancedRepairResponse, transfer?: Transferable[]): void;
  onmessage: (event: MessageEvent<EnhancedRepairRequest>) => void;
};

function reflect(index: number, size: number) {
  if (size === 1) return 0;
  const period = 2 * (size - 1);
  const wrapped = ((index % period) + period) % period;
  return Math.min(wrapped, period - wrapped);
}

scope.onmessage = async ({ data }) => {
  const { assets, width, height, pixels, mask } = data;
  let phase: EnhancedRepairError = 'unsupported';
  try {
    if (!(await canUseEnhancedImageRepair())) throw new Error('WebGPU FP16 is unavailable');

    phase = 'load';
    const moduleUrl = new URL('ort.webgpu.min.mjs', assets).href;
    const ort: typeof import('onnxruntime-web') = await import(/* @vite-ignore */ moduleUrl);
    ort.env.wasm.numThreads = 1;
    const response = await fetch(new URL('lama_512_fp16.onnx', assets));
    if (!response.ok) throw new Error('LaMa model unavailable');
    const session = await ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['webgpu'] });

    try {
      phase = 'repair';
      scope.postMessage({ type: 'repairing' });
      const rgba = new Uint8ClampedArray(pixels);
      const selected = new Uint8Array(mask);
      const offsetX = Math.floor((EDGE - width) / 2);
      const offsetY = Math.floor((EDGE - height) / 2);
      const values = new Float32Array(4 * AREA);

      // Pad the working image by reflection to preserve the original aspect ratio.
      // Reflect the mask too, so padding cannot expose copies of the selected object.
      for (let y = 0; y < EDGE; y += 1) {
        const row = reflect(y - offsetY, height) * width;
        for (let x = 0; x < EDGE; x += 1) {
          const source = row + reflect(x - offsetX, width);
          const target = y * EDGE + x;
          if (selected[source]) {
            values[3 * AREA + target] = 1;
          } else {
            const color = source * 4;
            values[target] = rgba[color] / 255;
            values[AREA + target] = rgba[color + 1] / 255;
            values[2 * AREA + target] = rgba[color + 2] / 255;
          }
        }
      }

      const input = new ort.Tensor('float32', values, [1, 4, EDGE, EDGE]);
      try {
        const output = (await session.run({ input })).output;
        try {
          const repaired = (await output.getData()) as Float32Array;
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const index = y * width + x;
              if (!selected[index]) continue;
              const target = (y + offsetY) * EDGE + x + offsetX;
              rgba[index * 4] = repaired[target] * 255;
              rgba[index * 4 + 1] = repaired[AREA + target] * 255;
              rgba[index * 4 + 2] = repaired[2 * AREA + target] * 255;
            }
          }
        } finally {
          output.dispose();
        }
      } finally {
        input.dispose();
      }
    } finally {
      await session.release();
    }
    scope.postMessage({ type: 'repaired', pixels }, [pixels]);
  } catch {
    scope.postMessage({ type: 'failed', reason: phase });
  }
};
