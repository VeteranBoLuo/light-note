// 云空间文件按 MIME 归类。files.file_type 存的是 MIME(image/jpeg、application/pdf、
// application/x-zip-compressed、text/markdown…),不能用 LIKE '类别%';这里统一归到
// image/video/audio/document/archive/other,供 AI 文件类工具共用,避免各工具口径不一致导致漏报。
// 说明:SQL 片段里用裸列名 file_type(查询只涉及 files 单表,不加别名也无歧义)。

export const FILE_CATEGORY_SQL = {
  image: "file_type LIKE 'image/%'",
  video: "file_type LIKE 'video/%'",
  audio: "file_type LIKE 'audio/%'",
  document:
    "(file_type = 'application/pdf' OR file_type LIKE 'text/%' OR file_type = 'application/json' OR file_type LIKE '%word%' OR file_type LIKE '%excel%' OR file_type LIKE '%spreadsheet%' OR file_type LIKE '%presentation%' OR file_type LIKE '%powerpoint%' OR file_type LIKE '%officedocument%' OR file_type LIKE '%opendocument%' OR file_type LIKE '%csv%')",
  archive:
    "(file_type LIKE '%zip%' OR file_type LIKE '%rar%' OR file_type LIKE '%gzip%' OR file_type LIKE '%7z%' OR file_type LIKE '%x-tar%' OR file_type LIKE '%compress%')",
};

// other = 不属于上述任何一类(如 application/octet-stream、application/x-msdownload 等)
export const FILE_OTHER_SQL = `NOT (${FILE_CATEGORY_SQL.image} OR ${FILE_CATEGORY_SQL.video} OR ${FILE_CATEGORY_SQL.audio} OR ${FILE_CATEGORY_SQL.document} OR ${FILE_CATEGORY_SQL.archive})`;

// 归类 CASE(GROUP BY 用),顺序即优先级
export const FILE_CATEGORY_CASE = `CASE
  WHEN ${FILE_CATEGORY_SQL.image} THEN 'image'
  WHEN ${FILE_CATEGORY_SQL.video} THEN 'video'
  WHEN ${FILE_CATEGORY_SQL.audio} THEN 'audio'
  WHEN ${FILE_CATEGORY_SQL.document} THEN 'document'
  WHEN ${FILE_CATEGORY_SQL.archive} THEN 'archive'
  ELSE 'other' END`;

export const FILE_CATEGORY_LABEL = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  archive: '压缩包',
  other: '其他',
};

// 单类别 → WHERE 片段(other 用排除法)
export function categoryCondition(type) {
  if (type === 'other') return FILE_OTHER_SQL;
  return FILE_CATEGORY_SQL[type] || null;
}

// 把 GROUP BY 结果行(含 category / c)整理成 { image: n, document: n, ... } + 可读文本
export function breakdownFromRows(rows) {
  const map = {};
  for (const r of rows || []) map[r.category] = Number(r.c);
  const order = ['image', 'document', 'archive', 'video', 'audio', 'other'];
  const text = order.filter((k) => map[k]).map((k) => `${FILE_CATEGORY_LABEL[k]} ${map[k]}`).join(' · ');
  return { map, text };
}
