export type NetscapeBookmarkExportEntry = {
  name: string;
  url: string;
};

export type NetscapeBookmarkExportGroup = {
  name: string;
  bookmarks: NetscapeBookmarkExportEntry[];
};

function escapeBookmarkHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 使用 Chromium 书签导入器认可的 Netscape Bookmark File 格式生成 HTML。
 * 每个结构节点必须独占一行；若根 <DL> 与首个 <DT> 拼在同一行，Chromium
 * 会在第一个子文件夹闭合时停止解析，导致后续标签组丢失。
 */
export function buildNetscapeBookmarkHtml(
  groups: NetscapeBookmarkExportGroup[],
  { timestamp = Math.floor(Date.now() / 1000) }: { timestamp?: number } = {},
) {
  const safeTimestamp = Number.isFinite(Number(timestamp)) ? Math.max(0, Math.floor(Number(timestamp))) : 0;
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    ' It will be read and overwritten.',
    ' DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  groups.forEach(({ name, bookmarks }) => {
    lines.push(
      `    <DT><H3 ADD_DATE="${safeTimestamp}" LAST_MODIFIED="${safeTimestamp}">${escapeBookmarkHtml(name)}</H3>`,
    );
    lines.push('    <DL><p>');
    bookmarks.forEach((bookmark) => {
      lines.push(
        `        <DT><A HREF="${escapeBookmarkHtml(bookmark.url)}" ADD_DATE="${safeTimestamp}">${escapeBookmarkHtml(bookmark.name)}</A>`,
      );
    });
    lines.push('    </DL><p>');
  });

  lines.push('</DL><p>', '');
  return lines.join('\r\n');
}
