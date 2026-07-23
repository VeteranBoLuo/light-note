import crypto from 'crypto';
import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { bucketBaseUrl, putObjectBodyToObs } from '../obsClient.js';
import { insertResourceTagRelations, RESOURCE_TYPE } from '../resourceTags.js';

export const NEW_USER_SEED_VERSION = 'v1';

const DEFAULT_SITE_URL = 'https://boluo66.top';
const PROJECT_REPOSITORY_URL = 'https://github.com/VeteranBoLuo/light-note';

function svgDataUrl(body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

const TAG_ICON_URLS = Object.freeze({
  'getting-started': svgDataUrl(
    '<defs><linearGradient id="startGradient" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs>' +
      '<circle cx="12" cy="12" r="10" fill="url(#startGradient)"/>' +
      '<circle cx="12" cy="12" r="7.2" fill="#FFFFFF" fill-opacity=".16"/>' +
      '<path d="m16.4 7.6-2.7 6.1-6.1 2.7 2.7-6.1 6.1-2.7Z" fill="#FFFFFF"/>' +
      '<circle cx="12" cy="12" r="1.35" fill="#C4B5FD"/>',
  ),
  'read-later': svgDataUrl(
    '<defs><linearGradient id="readGradient" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#FB7185"/><stop offset="1" stop-color="#F97316"/></linearGradient></defs>' +
      '<path d="M6.5 4.5A2.5 2.5 0 0 1 9 2h6a2.5 2.5 0 0 1 2.5 2.5V21l-5.5-3.3L6.5 21V4.5Z" fill="url(#readGradient)"/>' +
      '<path d="m12 5.3.85 1.72 1.9.28-1.37 1.34.32 1.89-1.7-.9-1.7.9.32-1.89L9.25 7.3l1.9-.28L12 5.3Z" fill="#FFFFFF"/>' +
      '<path d="M9.2 13h5.6" stroke="#FFE4E6" stroke-width="1.5" stroke-linecap="round"/>',
  ),
  work: svgDataUrl(
    '<defs><linearGradient id="workGradient" x1="3" y1="7" x2="21" y2="20" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#38BDF8"/><stop offset="1" stop-color="#0D9488"/></linearGradient></defs>' +
      '<path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7h-2V5.7a.7.7 0 0 0-.7-.7h-2.6a.7.7 0 0 0-.7.7V7H8Z" fill="#BAE6FD"/>' +
      '<rect x="2.5" y="6.5" width="19" height="14.5" rx="3" fill="url(#workGradient)"/>' +
      '<path d="M2.5 11.5h19v2.1a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3v-2.1Z" fill="#FFFFFF" fill-opacity=".16"/>' +
      '<rect x="10" y="11" width="4" height="3.5" rx="1" fill="#FFFFFF"/>',
  ),
  ideas: svgDataUrl(
    '<defs><linearGradient id="ideaGradient" x1="7" y1="5" x2="17" y2="18" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#FDE047"/><stop offset="1" stop-color="#FB7185"/></linearGradient></defs>' +
      '<path d="M12 3.1a7.1 7.1 0 0 0-4.4 12.67c.75.6 1.18 1.35 1.28 2.23h6.24c.1-.88.53-1.63 1.28-2.23A7.1 7.1 0 0 0 12 3.1Z" fill="url(#ideaGradient)"/>' +
      '<path d="m12 7.1.85 2.05 2.05.85-2.05.85L12 12.9l-.85-2.05L9.1 10l2.05-.85L12 7.1Z" fill="#FFFFFF"/>' +
      '<path d="M9.2 19h5.6M10.2 21.2h3.6" stroke="#8B5CF6" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M4.2 5.3 3 4.1M19.8 5.3 21 4.1M12 1V.2" stroke="#F472B6" stroke-width="1.5" stroke-linecap="round"/>',
  ),
});

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
      { key: 'getting-started', name: '轻笺入门', sort: 0, iconUrl: TAG_ICON_URLS['getting-started'] },
      { key: 'read-later', name: '稍后阅读', sort: 1, iconUrl: TAG_ICON_URLS['read-later'] },
      { key: 'work', name: '工作', sort: 2, iconUrl: TAG_ICON_URLS.work },
      { key: 'ideas', name: '灵感', sort: 3, iconUrl: TAG_ICON_URLS.ideas },
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
      files: [
        {
          key: 'guide',
          fileName: '轻笺使用说明.md',
          fileType: 'text/markdown',
          folder: 'sample',
          tagKeys: ['getting-started'],
          content:
            '# 轻笺使用说明\n\n这是一份可以正常预览、下载、重命名和删除的示例文件。\n\n' +
            '## 四类内容\n\n- **书签**：收藏网页和资料入口\n- **笔记**：记录想法和整理知识\n' +
            '- **云空间**：保存文件并跨设备访问\n- **标签**：把不同类型的内容关联起来\n\n' +
            '## 试一试\n\n1. 给这个文件换一个名字。\n2. 为它增加或更换标签。\n3. 不再需要时直接删除。\n',
        },
        {
          key: 'quick-capture',
          fileName: '待整理清单.md',
          fileType: 'text/markdown',
          folder: null,
          tagKeys: ['read-later'],
          content:
            '# 待整理清单\n\n这份文件放在云空间根目录，不属于“轻笺示例”文件夹。\n\n' +
            '你可以把暂时不知道如何分类的文件先放在这里，之后再移动到合适的文件夹。\n\n' +
            '- [ ] 整理一份最近下载的资料\n- [ ] 给文件加上标签\n- [ ] 建立自己的第一个文件夹\n',
        },
      ],
    },
  };
}

function buildEnglishSeed(siteUrl) {
  return {
    lang: 'en-US',
    tags: [
      { key: 'getting-started', name: 'Getting Started', sort: 0, iconUrl: TAG_ICON_URLS['getting-started'] },
      { key: 'read-later', name: 'Read Later', sort: 1, iconUrl: TAG_ICON_URLS['read-later'] },
      { key: 'work', name: 'Work', sort: 2, iconUrl: TAG_ICON_URLS.work },
      { key: 'ideas', name: 'Ideas', sort: 3, iconUrl: TAG_ICON_URLS.ideas },
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
      files: [
        {
          key: 'guide',
          fileName: 'Getting Started.md',
          fileType: 'text/markdown',
          folder: 'sample',
          tagKeys: ['getting-started'],
          content:
            '# Getting Started with Light Note\n\nThis is a real example file that you can preview, download, rename, and delete.\n\n' +
            '## Four kinds of content\n\n- **Bookmarks** save useful pages\n- **Notes** capture and develop ideas\n' +
            '- **Cloud storage** keeps files available across devices\n- **Tags** connect all of them\n\n' +
            '## Try it\n\n1. Rename this file.\n2. Add or change its tags.\n3. Delete it whenever you no longer need it.\n',
        },
        {
          key: 'quick-capture',
          fileName: 'To Organize.md',
          fileType: 'text/markdown',
          folder: null,
          tagKeys: ['read-later'],
          content:
            '# To Organize\n\nThis file lives at the root of cloud storage rather than inside the “Light Note Examples” folder.\n\n' +
            'Keep files here when you have not decided how to organize them, then move them into a folder later.\n\n' +
            '- [ ] Organize a recent download\n- [ ] Add a tag to a file\n- [ ] Create your first folder\n',
        },
      ],
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
          iconUrl: tag.iconUrl,
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

function cloudSeedObjectKey(userId, fileKey) {
  // 首份文件沿用已发布的确定性 key，避免升级后给已初始化账号重复创建说明文件。
  const suffix = fileKey === 'guide' ? '' : `-${fileKey}`;
  return `files/${userId}/system/onboarding-${NEW_USER_SEED_VERSION}${suffix}.md`;
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
  const cloudFiles = [];

  for (const file of content.cloud.files) {
    const objectKey = cloudSeedObjectKey(userId, file.key);
    const existing = await findExistingCloudSeed(pool, userId, objectKey);
    const fileBody = Buffer.from(file.content, 'utf8');
    cloudFiles.push({ ...file, objectKey, fileBody, existing });

    if (!existing) {
      // OBS 成功后才写文件元数据，绝不让云空间出现无法预览或下载的“假文件”。
      await putObjectBodyToObs(objectKey, fileBody, file.fileType);
    }
  }

  if (cloudFiles.every((file) => file.existing)) {
    const files = cloudFiles.map((file) => ({
      key: file.key,
      created: false,
      id: Number(file.existing.id),
      folderId: file.existing.folder_id,
    }));
    return { created: false, id: files[0].id, folderId: files[0].folderId, files };
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [userRows] = await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    if (!userRows.length) throw seedError('NEW_USER_CLOUD_SEED_USER_NOT_FOUND', '新用户不存在');

    const results = [];
    for (const file of cloudFiles) {
      // 上传前后各查一次：并发重复调用最多覆盖同一份确定性对象，不会插入两条文件记录。
      const existingAfterUpload = await findExistingCloudSeed(connection, userId, file.objectKey);
      if (existingAfterUpload) {
        results.push({
          key: file.key,
          created: false,
          id: Number(existingAfterUpload.id),
          folderId: existingAfterUpload.folder_id,
        });
        continue;
      }

      const resolvedFolderId =
        file.folder === 'sample'
          ? await resolveSeedFolder(connection, {
              userId,
              folderId,
              folderName: content.cloud.folderName,
            })
          : null;
      const [insertResult] = await connection.query('INSERT INTO files SET ?', [
        {
          create_by: userId,
          file_name: file.fileName,
          file_type: file.fileType,
          file_size: file.fileBody.length,
          directory: `${bucketBaseUrl}/files/${userId}/`,
          folder_id: resolvedFolderId,
          del_flag: 0,
          obs_key: file.objectKey,
          share_token: crypto.randomBytes(16).toString('hex'),
        },
      ]);
      const fileId = Number(insertResult.insertId);

      const tagIds = [];
      for (const tagKey of file.tagKeys) {
        const tagId = ids.tags[tagKey];
        const [tagRows] = await connection.query(
          'SELECT id FROM tag WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1',
          [tagId, userId],
        );
        if (tagRows.length) tagIds.push(tagId);
      }
      if (tagIds.length) {
        await insertResourceTagRelations(connection, {
          tagIds,
          resourceType: RESOURCE_TYPE.FILE,
          resourceId: String(fileId),
          userId,
          source: 'onboarding',
        });
      }

      results.push({
        key: file.key,
        created: true,
        id: fileId,
        folderId: resolvedFolderId,
      });
    }

    await connection.commit();
    return {
      created: results.some((file) => file.created),
      id: results[0].id,
      folderId: results[0].folderId,
      files: results,
    };
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
