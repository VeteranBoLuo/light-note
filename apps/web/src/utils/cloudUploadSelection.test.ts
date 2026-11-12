import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_UPLOAD_MAX_FILE_BYTES,
  CloudUploadSizeError,
  prepareCloudUploadSelection,
  renameCloudUploadSelection,
} from './cloudUploadSelection';

afterEach(() => {
  vi.useRealTimers();
});
const photo = (name = 'photo.jpg') => new File(['original bytes'], name, { type: 'image/jpeg', lastModified: 42 });

describe('大批次文件选择', () => {
  it('先交还主线程，分段读取几千个文件元信息，可在处理过程中取消', async () => {
    vi.useFakeTimers();
    const files = Array.from({ length: 3100 }, (_, index) => photo(`photo-${index}.jpg`));
    const controller = new AbortController();
    const changed = vi.fn((count: number) => {
      if (count > 0) controller.abort();
    });
    const size = vi.spyOn(files[0], 'size', 'get');
    const result = prepareCloudUploadSelection(files, controller.signal, changed).catch((error) => error);
    expect(size).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect((await result).name).toBe('AbortError');
    expect(changed.mock.calls[0][0]).toBeLessThan(files.length);
  });

  it('10GiB 边界可以选择；超过时列出原始名称，保留完整批次而不静默截断', async () => {
    const allowed = photo('boundary.bin');
    Object.defineProperty(allowed, 'size', { value: CLOUD_UPLOAD_MAX_FILE_BYTES });
    expect(await prepareCloudUploadSelection([allowed])).toEqual(['boundary.bin']);
    const tooLarge = photo('11GB-video.mp4');
    Object.defineProperty(tooLarge, 'size', { value: CLOUD_UPLOAD_MAX_FILE_BYTES + 1 });
    await expect(prepareCloudUploadSelection([photo('valid.jpg'), tooLarge])).rejects.toMatchObject({
      names: ['11GB-video.mp4'],
      count: 1,
    });
    await expect(prepareCloudUploadSelection([tooLarge])).rejects.toBeInstanceOf(CloudUploadSizeError);
  });

  it('按 NFC 规范化名称，不创建 FileReader 或读取原件内容', async () => {
    const file = photo('  e\u0301.jpg  ');
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');
    expect(await prepareCloudUploadSelection([file])).toEqual(['é.jpg']);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

describe('批量自动改名', () => {
  it('3100 个相同名称生成唯一序号，查找成本随文件数增长，不反复扫描旧序号', async () => {
    const files = Array.from({ length: 3100 }, () => photo('same.jpg'));
    const existing = new Set(['same.jpg', 'same (1).jpg']);
    const has = vi.spyOn(existing, 'has');
    const renamed = await renameCloudUploadSelection(
      files,
      files.map((file) => file.name),
      existing,
    );
    expect(new Set(renamed.map((file) => file.name)).size).toBe(3100);
    expect(renamed[0].name).toBe('same (2).jpg');
    expect(renamed.at(-1)!.name).toBe('same (3101).jpg');
    expect(has.mock.calls.length).toBeLessThan(6500);
    expect(renamed[0].type).toBe('image/jpeg');
    expect(renamed[0].lastModified).toBe(42);
    expect(await renamed[0].text()).toBe('original bytes');
  });

  it('不抢占本批后续原名，同时处理无扩展名和点文件', async () => {
    const files = ['a.jpg', 'a (1).jpg', '.env', 'README'].map((name) => photo(name));
    const result = await renameCloudUploadSelection(
      files,
      files.map((file) => file.name),
      new Set(),
    );
    expect(result.map((file) => file.name)).toEqual(['a (2).jpg', 'a (1) (1).jpg', '.env (1)', 'README (1)']);
  });

  it('历史名称已占用大量序号时也可响应取消', async () => {
    vi.useFakeTimers();
    const existing = new Set(Array.from({ length: 10000 }, (_, index) => `same (${index + 1}).jpg`));
    const controller = new AbortController();
    const result = renameCloudUploadSelection([photo('same.jpg')], ['same.jpg'], existing, controller.signal).catch(
      (error) => error,
    );
    setTimeout(() => controller.abort(), 0);
    await vi.runAllTimersAsync();
    expect((await result).name).toBe('AbortError');
  });
});
