import crypto from 'crypto';
import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { bucketBaseUrl, putObjectBodyToObs } from '../obsClient.js';
import { insertResourceTagRelations, RESOURCE_TYPE } from '../resourceTags.js';

export const NEW_USER_SEED_VERSION = 'v1';

const DEFAULT_SITE_URL = 'https://boluo66.top';
const PROJECT_REPOSITORY_URL = 'https://github.com/VeteranBoLuo/light-note';

function seedError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function normalizeLang(lang) {
  return String(lang || '')
    .trim()
    .toLowerCase()
    .startsWith('en')
    ? 'en-US'
    : 'zh-CN';
}

function normalizeSiteUrl(siteUrl) {
  try {
    const parsed = new URL(String(siteUrl || process.env.SITE_URL || DEFAULT_SITE_URL).trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_SITE_URL;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function deterministicSeedId(userId, key) {
  const hex = crypto
    .createHash('sha256')
    .update(`${NEW_USER_SEED_VERSION}:${String(userId)}:${String(key)}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildChineseSeed(siteUrl) {
  return {
    lang: 'zh-CN',
    tags: [
      { key: 'getting-started', name: '轻笺入门', sort: 0 },
      { key: 'read-later', name: '稍后阅读', sort: 1 },
      { key: 'work', name: '工作', sort: 2 },
      { key: 'ideas', name: '灵感', sort: 3 },
    ],
    bookmarks: [
      {
        key: 'help',
        name: '轻笺使用帮助',
        url: `${siteUrl}/help`,
        description: '了解书签、笔记、标签和云空间的常用操作。',
        tagKeys: ['getting-started'],
      },
      {
        key: 'co-build',
        name: '共建轻笺',
        url: `${siteUrl}/co-build`,
        description: '查看产品进度，也可以提交你希望轻笺实现的新功能。',
        tagKeys: ['ideas'],
      },
      {
        key: 'repository',
        name: 'Light Note 开源项目',
        url: PROJECT_REPOSITORY_URL,
        description: '轻笺的开源仓库、更新记录与协作入口。',
        tagKeys: ['read-later'],
      },
    ],
    notes: [
      {
        key: 'welcome',
        title: '欢迎使用轻笺',
        type: 'html',
        content:
          '<h2>欢迎来到你的轻笺</h2>' +
          '<p>这里已经准备了少量示例内容，帮助你快速了解书签、笔记、标签和云空间如何配合使用。</p>' +
          '<h3>可以从这四件事开始</h3>' +
          '<ol><li>收藏一个稍后要看的网页，并给它加上标签。</li>' +
          '<li>把零散想法写成笔记，Markdown 和富文本都可以。</li>' +
          '<li>上传资料到云空间，让文件和其他内容使用同一套标签。</li>' +
          '<li>在资源中心统一搜索，或打开轻笺智域询问自己的内容。</li></ol>' +
          '<blockquote>这些示例都属于你的账号，可以自由编辑或删除。</blockquote>',
        tagKeys: ['getting-started'],
      },
      {
        key: 'first-note',
        title: '我的第一篇笔记',
        type: 'markdown',
        content:
          '# 我的第一篇笔记\n\n把这篇示例改成你自己的内容吧。\n\n' +
          '## 今天想做的事\n\n- [ ] 收藏一篇稍后阅读的文章\n' +
          '- [ ] 记录一个突然出现的灵感\n- [ ] 整理一份工作资料\n\n' +
          '> 你可以修改标题、正文和标签，也可以直接删除这篇笔记。',
        tagKeys: ['work', 'ideas'],
      },
    ],
    cloud: {
      folderName: '轻笺示例',
      fileName: '轻笺使用说明.md',
      fileType: 'text/markdown',
      tagKeys: ['getting-started'],
      content:
        '# 轻笺使用说明\n\n这是一份可以正常预览、下载、重命名和删除的示例文件。\n\n' +
        '## 四类内容\n\n- **书签**：收藏网页和资料入口\n- **笔记**：记录想法和整理知识\n' +
        '- **云空间**：保存文件并跨设备访问\n- **标签**：把不同类型的内容关联起来\n\n' +
        '## 试一试\n\n1. 给这个文件换一个名字。\n2. 为它增加或更换标签。\n3. 不再需要时直接删除。\n',
    },
  };
}

function buildEnglishSeed(siteUrl) {
  return {
    lang: 'en-US',
    tags: [
      { key: 'getting-started', name: 'Getting Started', sort: 0 },
      { key: 'read-later', name: 'Read Later', sort: 1 },
      { key: 'work', name: 'Work', sort: 2 },
      { key: 'ideas', name: 'Ideas', sort: 3 },
    ],
    bookmarks: [
      {
        key: 'help',
        name: 'Light Note Help',
        url: `${siteUrl}/help`,
        description: 'Learn the everyday basics of bookmarks, notes, tags, and cloud storage.',
        tagKeys: ['getting-started'],
      },
      {
        key: 'co-build',
        name: 'Build Light Note Together',
        url: `${siteUrl}/co-build`,
        description: 'Follow product progress and suggest what Light Note should build next.',
        tagKeys: ['ideas'],
      },
      {
        key: 'repository',
        name: 'Light Note on GitHub',
        url: PROJECT_REPOSITORY_URL,
        description: 'The open-source repository, release history, and contribution entry point.',
        tagKeys: ['read-later'],
      },
    ],
    notes: [
      {
        key: 'welcome',
        title: 'Welcome to Light Note',
        type: 'html',
        content:
          '<h2>Welcome to your Light Note workspace</h2>' +
          '<p>A few examples are ready so you can see how bookmarks, notes, tags, and cloud files work together.</p>' +
          '<h3>Four easy ways to get started</h3>' +
          '<ol><li>Save a page you want to revisit and add a tag.</li>' +
          '<li>Turn a quick thought into a note using rich text or Markdown.</li>' +
          '<li>Upload a document to cloud storage and organize it with the same tags.</li>' +
          '<li>Search everything from the resource center, or ask Light Note AI about your content.</li></ol>' +
          '<blockquote>These examples belong to your account. Feel free to edit or delete them.</blockquote>',
        tagKeys: ['getting-started'],
      },
      {
        key: 'first-note',
        title: 'My First Note',
        type: 'markdown',
        content:
          '# My First Note\n\nTurn this example into something of your own.\n\n' +
          '## Things to try today\n\n- [ ] Save an article to read later\n' +
          '- [ ] Capture a new idea\n- [ ] Organize a work document\n\n' +
          '> You can change the title, body, and tags, or simply delete this note.',
        tagKeys: ['work', 'ideas'],
      },
    ],
    cloud: {
      folderName: 'Light Note Examples',
      fileName: 'Getting Started.md',
      fileType: 'text/markdown',
      tagKeys: ['getting-started'],
      content:
        '# Getting Started with Light Note\n\nThis is a real example file that you can preview, download, rename, and delete.\n\n' +
        '## Four kinds of content\n\n- **Bookmarks** save useful pages\n- **Notes** capture and develop ideas\n' +
        '- **Cloud storage** keeps files available across devices\n- **Tags** connect all of them\n\n' +
        '## Try it\n\n1. Rename this file.\n2. Add or change its tags.\n3. Delete it whenever you no longer need it.\n',
    },
  };
}

export function buildNewUserSeedContent({ lang = 'zh-CN', siteUrl } = {}) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  return normalizeLang(lang) === 'en-US' ? buildEnglishSeed(normalizedSiteUrl) : buildChineseSeed(normalizedSiteUrl);
}

function buildSeedIds(userId, content) {
  return {
    tags: Object.fromEntries(content.tags.map((tag) => [tag.key, deterministicSeedId(userId, `tag:${tag.key}`)])),
    bookmarks: Object.fromEntries(
      content.bookmarks.map((bookmark) => [bookmark.key, deterministicSeedId(userId, `bookmark:${bookmark.key}`)]),
    ),
    notes: Object.fromEntries(content.notes.map((note) => [note.key, deterministicSeedId(userId, `note:${note.key}`)])),
  };
}

async function findSeedFolder(connection, userId, folderName) {
  const [rows] = await connection.query(
    `SELECT id FROM folders
      WHERE create_by = ? AND name = ? AND del_flag = 0
      ORDER BY id ASC LIMIT 1`,
    [userId, folderName],
  );
  return rows[0]?.id == null ? null : Number(rows[0].id);
}

export async function seedNewUserWorkspaceData({ userId, lang = 'zh-CN', siteUrl } = {}) {
  if (!userId) throw seedError('NEW_USER_SEED_USER_REQUIRED', '缺少新用户 ID');

  const content = buildNewUserSeedContent({ lang, siteUrl });
  const ids = buildSeedIds(userId, content);
  const markerNoteId = ids.notes.welcome;
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [userRows] = await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    if (!userRows.length) throw seedError('NEW_USER_SEED_USER_NOT_FOUND', '新用户不存在');

    // 欢迎笔记使用账号级确定性 ID，作为整批事务的幂等标记；即便被软删除也不重复灌入。
    const [markerRows] = await connection.query('SELECT id FROM note WHERE id = ? AND create_by = ? LIMIT 1', [
      markerNoteId,
      userId,
    ]);
    if (markerRows.length) {
      const folderId = await findSeedFolder(connection, userId, content.cloud.folderName);
      await connection.commit();
      return {
        created: false,
        version: NEW_USER_SEED_VERSION,
        folderId,
        counts: { tags: 0, bookmarks: 0, notes: 0, folders: 0 },
      };
    }

    for (const tag of content.tags) {
      await connection.query('INSERT INTO tag SET ?', [
        insertData({
          id: ids.tags[tag.key],
          name: tag.name,
          userId,
          sort: tag.sort,
          delFlag: 0,
        }),
      ]);
    }

    for (const bookmark of content.bookmarks) {
      const bookmarkId = ids.bookmarks[bookmark.key];
      await connection.query('INSERT INTO bookmark SET ?', [
        insertData({
          id: bookmarkId,
          name: bookmark.name,
          userId,
          url: bookmark.url,
          description: bookmark.description,
          sort: 0,
          delFlag: 0,
        }),
      ]);
      await insertResourceTagRelations(connection, {
        tagIds: bookmark.tagKeys.map((key) => ids.tags[key]),
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceId: bookmarkId,
        userId,
        source: 'onboarding',
      });
    }

    for (const note of content.notes) {
      const noteId = ids.notes[note.key];
      await connection.query('INSERT INTO note SET ?', [
        insertData({
          id: noteId,
          title: note.title,
          content: note.content,
          type: note.type,
          createBy: userId,
          sort: 0,
          delFlag: 0,
        }),
      ]);
      await insertResourceTagRelations(connection, {
        tagIds: note.tagKeys.map((key) => ids.tags[key]),
        resourceType: RESOURCE_TYPE.NOTE,
        resourceId: noteId,
        userId,
        source: 'onboarding',
      });
    }

    const [folderInsert] = await connection.query('INSERT INTO folders SET ?', [
      {
        create_by: userId,
        name: content.cloud.folderName,
        parent_id: null,
        del_flag: 0,
        sort: 0,
      },
    ]);
    const folderId = Number(folderInsert.insertId);

    await connection.commit();
    return {
      created: true,
      version: NEW_USER_SEED_VERSION,
      folderId,
      counts: {
        tags: content.tags.length,
        bookmarks: content.bookmarks.length,
        notes: content.notes.length,
        folders: 1,
      },
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始初始化错误，注册调用方只记录稳定错误码并继续完成注册。
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

function cloudSeedObjectKey(userId) {
  return `files/${userId}/system/onboarding-${NEW_USER_SEED_VERSION}.md`;
}

async function findExistingCloudSeed(db, userId, objectKey) {
  const [rows] = await db.query(
    'SELECT id, folder_id FROM files WHERE create_by = ? AND obs_key = ? AND del_flag = 0 LIMIT 1',
    [userId, objectKey],
  );
  return rows[0] || null;
}

async function resolveSeedFolder(connection, { userId, folderId, folderName }) {
  if (folderId != null) {
    const [rows] = await connection.query(
      'SELECT id FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1',
      [folderId, userId],
    );
    if (rows.length) return Number(rows[0].id);
  }

  const existingFolderId = await findSeedFolder(connection, userId, folderName);
  if (existingFolderId != null) return existingFolderId;

  const [insertResult] = await connection.query('INSERT INTO folders SET ?', [
    { create_by: userId, name: folderName, parent_id: null, del_flag: 0, sort: 0 },
  ]);
  return Number(insertResult.insertId);
}

export async function seedNewUserCloudFile({ userId, lang = 'zh-CN', siteUrl, folderId = null } = {}) {
  if (!userId) throw seedError('NEW_USER_CLOUD_SEED_USER_REQUIRED', '缺少新用户 ID');

  const content = buildNewUserSeedContent({ lang, siteUrl });
  const ids = buildSeedIds(userId, content);
  const objectKey = cloudSeedObjectKey(userId);
  const existingBeforeUpload = await findExistingCloudSeed(pool, userId, objectKey);
  if (existingBeforeUpload) {
    return { created: false, id: Number(existingBeforeUpload.id), folderId: existingBeforeUpload.folder_id };
  }

  const fileBody = Buffer.from(content.cloud.content, 'utf8');
  // OBS 成功后才写文件元数据，绝不让云空间出现无法预览或下载的“假文件”。
  await putObjectBodyToObs(objectKey, fileBody, content.cloud.fileType);

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [userRows] = await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    if (!userRows.length) throw seedError('NEW_USER_CLOUD_SEED_USER_NOT_FOUND', '新用户不存在');

    // 上传前后各查一次：并发重复调用最多覆盖同一份确定性对象，不会插入两条文件记录。
    const existingAfterUpload = await findExistingCloudSeed(connection, userId, objectKey);
    if (existingAfterUpload) {
      await connection.commit();
      return {
        created: false,
        id: Number(existingAfterUpload.id),
        folderId: existingAfterUpload.folder_id,
      };
    }

    const resolvedFolderId = await resolveSeedFolder(connection, {
      userId,
      folderId,
      folderName: content.cloud.folderName,
    });
    const [insertResult] = await connection.query('INSERT INTO files SET ?', [
      {
        create_by: userId,
        file_name: content.cloud.fileName,
        file_type: content.cloud.fileType,
        file_size: fileBody.length,
        directory: `${bucketBaseUrl}/files/${userId}/`,
        folder_id: resolvedFolderId,
        del_flag: 0,
        obs_key: objectKey,
        share_token: crypto.randomBytes(16).toString('hex'),
      },
    ]);
    const fileId = Number(insertResult.insertId);

    const gettingStartedTagId = ids.tags['getting-started'];
    const [tagRows] = await connection.query(
      'SELECT id FROM tag WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1',
      [gettingStartedTagId, userId],
    );
    if (tagRows.length) {
      await insertResourceTagRelations(connection, {
        tagIds: [gettingStartedTagId],
        resourceType: RESOURCE_TYPE.FILE,
        resourceId: String(fileId),
        userId,
        source: 'onboarding',
      });
    }

    await connection.commit();
    return { created: true, id: fileId, folderId: resolvedFolderId };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // OBS 中的对象使用确定性 key，可供后续幂等重试复用；不写坏的数据库记录。
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}
