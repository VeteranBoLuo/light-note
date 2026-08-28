import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'QuickSave.vue'), 'utf8');

describe('书签栏收藏模式', () => {
  it('先选择快速待整理或正式保存，待整理模式隐藏 AI、标签与网页存档', () => {
    expect(source).toContain("const mode = ref<BookmarkCaptureMode>('formal')");
    expect(source).toContain('<template v-if="mode === \'formal\'">');
    expect(source).toContain("'quickSave.saveInbox'");
    expect(source).toContain("'quickSave.saveFormal'");
    expect(source).toContain("source: 'quick_capture'");
  });

  it('保存请求包含共享模式载荷和按载荷复用的幂等键', () => {
    expect(source).toContain('buildBookmarkCapturePayload({');
    expect(source).toContain('resolveBookmarkCaptureReceipt({');
    expect(source).toContain('idempotencyKey: receipt.key');
  });
});
