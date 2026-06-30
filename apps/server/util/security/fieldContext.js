export const FIELD_CONTEXT = {
  freeText: [
    'description',
    'content',
    'comment',
    'note',
    'summary',
    'body',
    'remark',
    'reply',
    'replyContent',
    'title',
    'name',
    'tagName',
    'alias',
    'key',
    'keyword',
    'value',
    'operation',
    'module',
    'type',
    'status',
    'message',
    'headPicture',
  ],
  numeric: ['pageSize', 'currentPage', 'level', 'sort', 'limit', 'offset', 'count'],
  identifier: [
    'id',
    'ids',
    'userId',
    'createBy',
    'updateBy',
    'handledBy',
    'tagId',
    'tagIds',
    'relatedTagIds',
    'resourceId',
    'resourceIds',
    'bookmarkId',
    'bookmarkIds',
    'noteId',
    'noteIds',
    'fileId',
    'fileIds',
    'folderId',
    'folderIds',
  ],
  url: ['url', 'link', 'callbackUrl', 'redirectUrl', 'href', 'avatar', 'iconUrl'],
  filename: ['fileName', 'filename', 'originalName', 'path', 'dir', 'folder'],
  auth: ['email', 'password', 'token', 'cookie', 'authorization', 'sid', 'secret'],
};

const normalizedFieldName = (field = '') => {
  const parts = String(field).split('.');
  return parts[parts.length - 1].replace(/\[[0-9]+\]/g, '');
};

export const getFieldContext = (field = '') => {
  const key = normalizedFieldName(field);
  for (const [context, fields] of Object.entries(FIELD_CONTEXT)) {
    if (fields.some((item) => item.toLowerCase() === key.toLowerCase())) {
      return context;
    }
  }
  if (/(user|create|update|handle).*id$/i.test(key)) {
    return 'identifier';
  }
  if (/^(id|ids)$/i.test(key) || /(?:^|_)(id|ids)$/i.test(key) || /ids$/i.test(key)) {
    return 'identifier';
  }
  if (/^(count|size|page|level|sort)$/i.test(key) || /(?:^|_)(count|size|page|level|sort)$/i.test(key)) {
    return 'numeric';
  }
  if (/(url|link|href|callback|redirect)/i.test(key)) {
    return 'url';
  }
  if (/(file|filename|path|dir|folder)/i.test(key)) {
    return 'filename';
  }
  return 'unknown';
};
