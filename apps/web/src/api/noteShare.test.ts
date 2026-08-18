import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn() }));

const { buildNoteShareUrl } = await import('./noteShare');

describe('note share URL', () => {
  it('把主令牌放进 fragment，不进入服务器可见的路径或查询串', () => {
    const token = 'secret_token-123';
    const url = new URL(buildNoteShareUrl(token, 'page-2'));
    expect(url.pathname).toBe('/share/note');
    expect(url.searchParams.get('page')).toBe('page-2');
    expect(url.hash).toBe(`#token=${token}`);
    expect(`${url.pathname}${url.search}`).not.toContain(token);
  });

  it('目录内切换页面时保留承载令牌的 fragment', () => {
    const readerSource = readFileSync(resolve(process.cwd(), 'src/view/share/NoteShareReader.vue'), 'utf8');
    expect(readerSource).toMatch(/router\.replace\(\{[\s\S]*?query:[\s\S]*?hash:\s*route\.hash/);
  });
});
