import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'NoteDetail.vue'), 'utf8');

describe('NoteDetail autosave policy', () => {
  it('正文使用 1.5 秒合并窗口，但离开路由前仍强制落库', () => {
    expect(source).toContain('const TEXT_SAVE_DEBOUNCE_DELAY = 1_500');
    expect(source).toContain('timer.value = setTimeout(');
    expect(source).toContain('onBeforeRouteLeave(async () =>');
    expect(source).toContain('return await persistBeforeLeave()');
    expect(source).toContain('const saved = await flushPendingSave()');
  });
});
