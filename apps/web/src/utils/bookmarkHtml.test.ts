import { describe, expect, it } from 'vitest';
import { buildNetscapeBookmarkHtml } from './bookmarkHtml';

describe('buildNetscapeBookmarkHtml', () => {
  it('为每个标签组生成独立的 Chromium 可解析行，且保留全部书签', () => {
    const html = buildNetscapeBookmarkHtml(
      [
        { name: 'AI', bookmarks: [{ name: 'Alpha', url: 'https://a.example/?x=1&y=2' }] },
        { name: '工具', bookmarks: [{ name: 'Beta', url: 'https://b.example/' }] },
      ],
      { timestamp: 1_700_000_000 },
    );
    const lines = html.trimEnd().split('\r\n');

    expect(lines).toContain('<DL><p>');
    expect(lines).not.toContain('<DL><p><DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">AI</H3>');
    expect(lines).toContain('    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">AI</H3>');
    expect(lines).toContain('    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">工具</H3>');
    expect(lines).toContain('        <DT><A HREF="https://a.example/?x=1&amp;y=2" ADD_DATE="1700000000">Alpha</A>');
    expect(lines).toContain('        <DT><A HREF="https://b.example/" ADD_DATE="1700000000">Beta</A>');
    expect(lines.filter((line) => line.startsWith('    <DT><H3')).length).toBe(2);
    expect(lines.filter((line) => line.startsWith('        <DT><A')).length).toBe(2);
  });
});
