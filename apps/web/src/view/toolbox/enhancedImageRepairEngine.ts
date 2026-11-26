import assetsUrl from 'virtual:lightnote-image-repair-model';

export type EnhancedRepairError = 'unsupported' | 'load' | 'repair';
export type EnhancedRepairRequest = {
  assets: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  mask: ArrayBuffer;
};
export type EnhancedRepairResponse =
  { type: 'repairing' } | { type: 'failed'; reason: EnhancedRepairError } | { type: 'repaired'; pixels: ArrayBuffer };

export function runEnhancedImageRepair(
  image: ImageData,
  mask: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
): Promise<ImageData> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./enhancedImageRepair.worker.ts', import.meta.url), { type: 'module' });
    let deadline: number;
    let phase: EnhancedRepairError = 'load';
    function finish() {
      window.clearTimeout(deadline);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    }
    function abort() {
      finish();
      reject(signal.reason);
    }
    function fail(reason: EnhancedRepairError = phase) {
      finish();
      reject(new Error(reason));
    }
    signal.addEventListener('abort', abort, { once: true });
    deadline = window.setTimeout(fail, 240_000);
    worker.onerror = () => fail();
    worker.onmessageerror = () => fail();
    const { width, height, data } = image;
    worker.onmessage = ({ data: result }: MessageEvent<EnhancedRepairResponse>) => {
      if (result.type === 'repairing') {
        phase = 'repair';
        window.clearTimeout(deadline);
        deadline = window.setTimeout(fail, 30_000);
      } else if (result.type === 'failed') {
        fail(result.reason);
      } else if (result.pixels.byteLength !== width * height * 4) {
        fail('repair');
      } else {
        finish();
        resolve(new ImageData(new Uint8ClampedArray(result.pixels), width, height));
      }
    };
    try {
      const request: EnhancedRepairRequest = {
        assets: new URL(assetsUrl, location.href).href,
        width,
        height,
        pixels: data.buffer,
        mask: mask.buffer,
      };
      worker.postMessage(request, [request.pixels, request.mask]);
    } catch {
      fail();
    }
  });
}
