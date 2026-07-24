import { insertData } from '../agent/data.js';
import { RESOURCE_TYPE, insertResourceTagRelations } from '../resourceTags.js';
import { inspectBookmarkUrl } from '../bookmarkUrl.js';

function toText(value, maxLength = 255) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function normalizeTagNames(value) {
  const rawNames = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  const tagNames = [];
  rawNames.forEach((rawName) => {
    const name = toText(rawName);
    if (!name || seen.has(name)) return;
    seen.add(name);
    tagNames.push(name);
  });
  return tagNames;
}

function normalizeImportItem(item) {
  return {
    name: toText(item?.name),
    url: String(item?.url ?? '').trim(),
    description: toText(item?.description),
    // HTML 导入传 folder，Excel 导入传 tagNames；两种来源走完全相同的去重与关联规则。
    tagNames: normalizeTagNames(item?.tagNames ?? item?.folder),
  };
}

/**
 * 在调用方已开启的事务内导入书签。标签与书签均先预加载并在内存映射中同步更新，
 * 因而同一批次以及当前账号既有数据都不会重复创建；已有书签只补缺失标签关联。
 */
export async function importBookmarksWithTags(connection, { userId, items = [] } = {}) {
  if (!connection) throw new Error('缺少数据库连接');
  if (!userId) throw new Error('缺少用户身份');

  const sourceItems = Array.isArray(items) ? items : [];
  const [tagRows] = await connection.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
  const [bookmarkRows] = await connection.query(
    'SELECT id, name, url FROM bookmark WHERE user_id = ? AND del_flag = 0',
    [userId],
  );

  const tagMap = new Map(tagRows.map((row) => [toText(row.name), row.id]).filter(([name]) => Boolean(name)));
  const bookmarkMap = new Map(bookmarkRows.map((row) => [toText(row.name), row.id]).filter(([name]) => Boolean(name)));
  const bookmarkUrlMap = new Map(
    bookmarkRows
      .map((row) => [inspectBookmarkUrl(row.url, { allowTextExtraction: false }).canonicalUrl, row.id])
      .filter(([url]) => Boolean(url)),
  );

  const stats = {
    parsedTotal: sourceItems.length,
    createdTags: 0,
    createdBookmarks: 0,
    boundRelations: 0,
    skippedInvalidUrls: 0,
  };

  for (const rawItem of sourceItems) {
    const item = normalizeImportItem(rawItem);
    const resolution = inspectBookmarkUrl(item.url, { allowTextExtraction: false });
    const canonicalUrl = resolution.canonicalUrl;
    if (!canonicalUrl || canonicalUrl.length > 255) {
      stats.skippedInvalidUrls += 1;
      continue;
    }

    const tagIds = [];
    for (const tagName of item.tagNames) {
      let tagId = tagMap.get(tagName);
      if (!tagId) {
        const tagPayload = insertData({ name: tagName, userId });
        await connection.query('INSERT INTO tag SET ?', [tagPayload]);
        tagId = tagPayload.id;
        tagMap.set(tagName, tagId);
        stats.createdTags += 1;
      }
      tagIds.push(tagId);
    }

    const bookmarkName = item.name || canonicalUrl;
    let bookmarkId = bookmarkUrlMap.get(canonicalUrl) || bookmarkMap.get(bookmarkName);
    if (!bookmarkId) {
      const bookmarkPayload = insertData({
        name: bookmarkName,
        userId,
        url: canonicalUrl,
        description: item.description,
      });
      await connection.query('INSERT INTO bookmark SET ?', [bookmarkPayload]);
      bookmarkId = bookmarkPayload.id;
      bookmarkMap.set(bookmarkName, bookmarkId);
      bookmarkUrlMap.set(canonicalUrl, bookmarkId);
      stats.createdBookmarks += 1;
    }

    const inserted = await insertResourceTagRelations(connection, {
      tagIds,
      resourceType: RESOURCE_TYPE.BOOKMARK,
      resourceId: bookmarkId,
      userId,
      source: 'import',
    });
    stats.boundRelations += Number(inserted || 0);
  }

  return stats;
}
