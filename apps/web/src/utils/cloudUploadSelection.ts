import { CLOUD_UPLOAD_MAX_BYTES, unnumberedCloudUploadStem } from '@lightnote/shared/cloud-upload';
/** 云空间单文件上限；>5GiB 由队列选择分片协议。 */
export const CLOUD_UPLOAD_MAX_FILE_BYTES = CLOUD_UPLOAD_MAX_BYTES;

function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Upload selection cancelled', 'AbortError');
}

/** 文件元信息可能触发浏览器向本地文件系统查询，不能在一次事件中遍历整个相册。 */
export async function yieldUploadSelection(signal?: AbortSignal) {
  assertActive(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assertActive(signal);
}

export class CloudUploadSizeError extends Error {
  constructor(
    public readonly names: string[],
    public readonly count: number,
  ) {
    super('CLOUD_UPLOAD_FILE_TOO_LARGE');
  }
}

export async function prepareCloudUploadSelection(
  files: readonly File[],
  signal?: AbortSignal,
  changed?: (processed: number) => void,
) {
  const names: string[] = [];
  const oversizedNames: string[] = [];
  let oversizedCount = 0;
  // 先让“正在检查文件”绘制出来；只读元信息，不解码照片、不复制原件内容。
  await yieldUploadSelection(signal);
  let sliceStarted = performance.now();
  for (let index = 0; index < files.length; index++) {
    assertActive(signal);
    const file = files[index];
    if (!(file instanceof File)) throw new Error('UPLOAD_SOURCE_INVALID');
    const name = file.name.normalize('NFC').trim();
    names.push(name);
    if (file.size > CLOUD_UPLOAD_MAX_FILE_BYTES) {
      oversizedCount++;
      if (oversizedNames.length < 3) oversizedNames.push(name);
    }
    if ((index + 1) % 64 === 0 || performance.now() - sliceStarted >= 8) {
      changed?.(index + 1);
      await yieldUploadSelection(signal);
      sliceStarted = performance.now();
    }
  }
  changed?.(files.length);
  if (oversizedCount) throw new CloudUploadSizeError(oversizedNames, oversizedCount);
  return names;
}

/** 优先保留本批原名，只为撞名项分配序号，并缓存下一个可用序号。 */
export async function renameCloudUploadSelection(
  files: readonly File[],
  names: readonly string[],
  existing: Set<string>,
  signal?: AbortSignal,
) {
  const nextSuffix = new Map<string, number>();
  const originalNames = new Set<string>();
  const renamed: File[] = [];
  let operations = 0;
  let sliceStarted = performance.now();
  const checkpoint = async () => {
    assertActive(signal);
    if (++operations % 64 === 0 || performance.now() - sliceStarted >= 8) {
      await yieldUploadSelection(signal);
      sliceStarted = performance.now();
    }
  };
  for (const name of names) {
    originalNames.add(name);
    await checkpoint();
  }
  for (let index = 0; index < files.length; index++) {
    const name = names[index];
    const file = files[index];
    await checkpoint();
    if (!existing.has(name)) {
      existing.add(name);
      renamed.push(file);
      continue;
    }
    const dot = name.lastIndexOf('.');
    const stem = unnumberedCloudUploadStem(dot > 0 ? name.slice(0, dot) : name);
    const extension = dot > 0 ? name.slice(dot) : '';
    const baseName = stem + extension;
    let suffix = nextSuffix.get(baseName) || 1;
    let candidate: string;
    do {
      candidate = `${stem} (${suffix++})${extension}`;
      await checkpoint();
    } while (existing.has(candidate) || originalNames.has(candidate));
    nextSuffix.set(baseName, suffix);
    existing.add(candidate);
    renamed.push(new File([file], candidate, { type: file.type, lastModified: file.lastModified }));
  }
  return renamed;
}
