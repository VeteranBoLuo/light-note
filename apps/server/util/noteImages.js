import pool from '../db/index.js';
import { promises as fsP } from 'node:fs';
import path from 'node:path';

// 笔记上传图片的物理目录与 URL 形态(router/noteLibrary.js uploadImage 写入)
export const NOTE_IMAGE_DIR = '/www/wwwroot/images';
const NOTE_IMAGE_URL_RE = /https?:\/\/boluo66\.top\/uploads\/[^\s"'()<>\][]+/g;

/** 从笔记/模板正文(html 或 markdown 源文本)提取本站上传图片 URL,去重 */
export function extractNoteImageUrls(content) {
  const matches = String(content || '').match(NOTE_IMAGE_URL_RE) || [];
  return [...new Set(matches)];
}

/** LIKE 模式转义(%、_、\) */
export function escapeLikePattern(text) {
  return String(text || '').replace(/[\\%_]/g, '\\$&');
}

/**
 * 过滤出确属该用户的图片 URL。两条归属路径:
 * 1) 曾由其笔记上传登记于 note_images;
 * 2) 出现在其自存模板正文中——源笔记彻底删除后 note_images 行已不在,
 *    此时模板是唯一引用;再用该模板建笔记必须仍能通过归属校验并登记新引用,否则链路断裂。
 * 用途:存为模板/新建笔记时,只认自己的图片,防止把他人图片锚定为自己的引用。
 * 可传事务 connection;省略时走连接池。
 */
export async function filterOwnedImageUrls({ urls, userId, connection = null }) {
  if (!urls?.length || !userId) return [];
  const runner = connection || pool;
  const ph = urls.map(() => '?').join(',');
  const [rows] = await runner.query(
    `SELECT DISTINCT ni.url
       FROM note_images ni
       JOIN note n ON n.id = ni.note_id
      WHERE ni.url IN (${ph}) AND n.create_by = ?`,
    [...urls, userId],
  );
  const owned = new Set(rows.map((r) => r.url));
  // 未被笔记登记的 URL,二查自己的模板正文(逐 URL LIKE;正文图片通常个位数,模板每人≤20)
  for (const url of urls) {
    if (owned.has(url)) continue;
    const [tplRows] = await runner.query(
      'SELECT COUNT(*) AS n FROM note_template WHERE create_by = ? AND content LIKE ?',
      [userId, `%${escapeLikePattern(url)}%`],
    );
    if (tplRows[0].n > 0) owned.add(url);
  }
  return urls.filter((u) => owned.has(u));
}

/**
 * 汇总全站"仍被引用"的图片文件名(不含扩展名)集合——供后台图库判定失效与清理校验。
 * 引用来源:书签图标、笔记图片登记(note_images)、模板正文。
 * 模板正文在内存提取(当前模板量小:每人≤20;规模增长后应改引用表)。
 */
export async function collectUsedImageNames() {
  const [bookmarkRows] = await pool.query('SELECT icon_url FROM bookmark');
  const [noteRows] = await pool.query('SELECT url FROM note_images');
  const [templateRows] = await pool.query('SELECT content FROM note_template');
  const urls = [
    ...bookmarkRows.map((r) => r.icon_url),
    ...noteRows.map((r) => r.url),
    ...templateRows.flatMap((r) => extractNoteImageUrls(r.content)),
  ];
  const usedNames = new Set();
  for (const url of urls) {
    if (typeof url !== 'string' || !url) continue;
    const seg = url.split('?')[0].split('/').pop() || '';
    const base = seg.replace(/\.[^.]+$/, '');
    if (base) usedNames.add(base);
  }
  return usedNames;
}

/**
 * 清理"可能成为孤儿"的图片物理文件——仅当既没有任何笔记引用(note_images 已无该 URL 行)、
 * 也没有任何模板正文仍包含该文件时才删磁盘文件。
 * 必须在删除事务提交之后调用(此时残留的 note_images 行即"其他笔记仍在引用")。
 * fire-and-forget:失败静默,不影响主流程。
 */
export async function cleanupOrphanNoteImages(urls) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  for (const u of unique) {
    try {
      const fileName = new URL(u).pathname.split('/').pop();
      if (!fileName) continue;
      const [noteRef] = await pool.query('SELECT COUNT(*) AS n FROM note_images WHERE url = ?', [u]);
      if (noteRef[0].n > 0) continue;
      // 模板引用按正文包含文件名判断(模板量小:每人≤20;文件名带时间戳唯一,误报≈0 且误报方向是多保留,安全)
      const [tplRef] = await pool.query('SELECT COUNT(*) AS n FROM note_template WHERE content LIKE ?', [
        `%${escapeLikePattern(fileName)}%`,
      ]);
      if (tplRef[0].n > 0) continue;
      await fsP.unlink(path.join(NOTE_IMAGE_DIR, fileName)).catch(() => {});
    } catch {
      /* 单个 URL 清理失败忽略,继续下一个 */
    }
  }
}
