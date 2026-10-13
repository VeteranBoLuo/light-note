import path from 'node:path';
export function hasMeaningfulFileName(title) {
  const stem = path
    .parse(String(title || ''))
    .name.normalize('NFKC')
    .trim();
  return (
    stem.length >= 2 &&
    !/^(?:(?:untitled|file|image|document|screenshot|新建文档|未命名|无标题|图片|文件)[_\s-]*\d*)$/iu.test(stem) &&
    !/^(?:[\p{N}\p{P}\p{S}\s_]+|[a-f\d-]{20,}|(?:paste|img|dsc|screenshot|微信图片|屏幕截图)[_\s-]*\d[\w\s-]*)$/iu.test(
      stem,
    )
  );
}

export function preserveFileExtension(original, name) {
  const ext = path.extname(original);
  return ext
    ? (path.extname(name).toLowerCase() === ext.toLowerCase() ? name.slice(0, -ext.length) : name) + ext
    : name;
}
