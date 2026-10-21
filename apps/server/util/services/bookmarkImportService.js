import { insertData } from '../agent/data.js';
import { RESOURCE_TYPE, insertResourceTagRelations } from '../resourceTags.js';
import { inspectBookmarkUrl } from '../bookmarkUrl.js';
import { createBookmarkExactUrlHash } from './bookmarkExactUrlService.js';

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
 * 因而同一批次以及当前账号既有数据都不会重复创建。Excel 可更新同网址书签的非空描述；
 * HTML 默认只补缺失标签关联，同名但网址不同的匹配不更新描述。
 */
export async function importBookmarksWithTags(connection, { userId, items = [], overwriteDescriptions = false } = {}) {
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
      .map((row) => [inspectBookmarkUrl(row.url, { allowTextExtraction: false }).canonicalUrl, row])
      .filter(([url]) => Boolean(url)),
  );

  const stats = {
    parsedTotal: sourceItems.length,
    createdTags: 0,
    createdBookmarks: 0,
    updatedBookmarks: 0,
    boundRelations: 0,
    skippedInvalidUrls: 0,
    // 阶段 3：图标补全用
    createdBookmarkIds: [],
    affectedBookmarkIds: [],
  };

  const processedRelations = new Map();
  const descriptionsToUpdate = new Map();
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
    const urlMatch = bookmarkUrlMap.get(canonicalUrl);
    let bookmarkId = urlMatch?.id || bookmarkMap.get(bookmarkName);
    const isNew = !bookmarkId;
    if (!bookmarkId) {
      const bookmarkPayload = insertData({
        name: bookmarkName,
        userId,
        url: canonicalUrl,
        description: item.description,
      });
      bookmarkPayload.url_exact_hash = createBookmarkExactUrlHash(canonicalUrl);
      await connection.query('INSERT INTO bookmark SET ?', [bookmarkPayload]);
      bookmarkId = bookmarkPayload.id;
      bookmarkMap.set(bookmarkName, bookmarkId);
      bookmarkUrlMap.set(canonicalUrl, { id: bookmarkId, url: canonicalUrl });
      stats.createdBookmarks += 1;
    }

    if (overwriteDescriptions && urlMatch && item.description) {
      // 同网址多行只写最后一条非空描述；名称兜底匹配不能变成网址别名。
      descriptionsToUpdate.set(bookmarkId, { description: item.description, url: urlMatch.url });
    }

    if (isNew) {
      stats.createdBookmarkIds.push(bookmarkId);
    }
    stats.affectedBookmarkIds.push(bookmarkId);

    // A successful INSERT IGNORE already holds the existing/new relation locks
    // until commit. Repeated input pairs cannot add another relation in this transaction.
    const processedTagIds = processedRelations.get(bookmarkId) || new Set();
    const pendingTagIds = tagIds.filter((tagId) => !processedTagIds.has(tagId));
    const inserted = await insertResourceTagRelations(connection, {
      tagIds: pendingTagIds,
      resourceType: RESOURCE_TYPE.BOOKMARK,
      resourceId: bookmarkId,
      userId,
      source: 'import',
    });
    pendingTagIds.forEach((tagId) => processedTagIds.add(tagId));
    processedRelations.set(bookmarkId, processedTagIds);
    stats.boundRelations += Number(inserted || 0);
  }

  const createdIds = new Set(stats.createdBookmarkIds);
  for (const [bookmarkId, { description, url }] of descriptionsToUpdate) {
    // 写入时再复核归属、删除状态和原网址，避免预加载后资料变化导致误覆盖。
    // 二进制比较保证大小写变化也能更新，并排除同值写入的更新计数。
    const [result] = await connection.query(
      `UPDATE bookmark SET description = ?
       WHERE id = ? AND user_id = ? AND del_flag = 0 AND BINARY url = BINARY ?
         AND NOT (BINARY description <=> BINARY ?)`,
      [description, bookmarkId, userId, url, description],
    );
    if (Number(result.affectedRows) > 0 && !createdIds.has(bookmarkId)) stats.updatedBookmarks += 1;
  }

  return stats;
}

/**
 * 统一执行 HTML / Excel 书签导入事务，并在提交后返回后续图标批次所需 stats。
 * 调用方只负责把稳定错误映射成对应接口文案。
 */
export async function runBookmarkImportTransaction(
  dbPool,
  { userId, items = [], overwriteDescriptions = false, importFn = importBookmarksWithTags } = {},
) {
  if (!dbPool?.getConnection) throw new Error('缺少数据库连接池');

  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const stats = await importFn(connection, { userId, items, overwriteDescriptions });
    await connection.commit();
    return stats;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
