export async function canUseEnhancedImageRepair() {
  if (!globalThis.isSecureContext) return false;
  const webGpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<{ features: ReadonlySet<string> } | null> };
    }
  ).gpu;
  try {
    return (await webGpu?.requestAdapter())?.features.has('shader-f16') === true;
  } catch {
    return false;
  }
}
