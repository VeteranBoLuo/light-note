const FILE_LIST_SORT_COLUMNS = Object.freeze({
  createTime: 'files.create_time',
  fileName: 'files.file_name',
  fileSize: 'files.file_size',
});

export function normalizeFileListSort(value = {}) {
  if (!Object.hasOwn(FILE_LIST_SORT_COLUMNS, value?.field)) return { field: 'createTime', order: 'desc' };
  const field = value.field;
  const order = String(value?.order || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { field, order };
}

export function buildFileListOrderBy(value = {}) {
  const sort = normalizeFileListSort(value);
  const direction = sort.order.toUpperCase();
  const column = FILE_LIST_SORT_COLUMNS[sort.field];
  if (sort.field === 'createTime') return `${column} ${direction}, files.id ${direction}`;
  return `${column} ${direction}, files.create_time DESC, files.id DESC`;
}
