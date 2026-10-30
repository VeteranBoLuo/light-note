import os from 'node:os';
import multer from 'multer';
import { L, resultData } from './common.js';
import { ensureNotVisitor } from './auth.js';

// 浏览器导出的书签 HTML 可能内嵌站点图标，上限放宽到 20MB。
export const BOOKMARK_HTML_MAX_BYTES = 20 * 1024 * 1024;

// 先确认身份再接收文件：游客、未登录和不允许写入的代管请求不落盘。
// 超限或格式错误时 multer 会删掉已写入的临时文件；正常请求由导入处理函数读完后删除。
export function createBookmarkHtmlUpload({ dest = os.tmpdir(), maxBytes = BOOKMARK_HTML_MAX_BYTES } = {}) {
  const upload = multer({ dest, limits: { fileSize: maxBytes, files: 1 } }).single('file');
  return (req, res, next) => {
    if (!ensureNotVisitor(req, res)) return;
    upload(req, res, (error) => {
      if (!error) return next();
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? L(req, '书签文件不能超过 20MB', 'Bookmark file must be 20 MB or smaller')
          : L(req, '书签文件上传失败，请检查文件后重试', 'Bookmark file upload failed. Check the file and try again.');
      res.send(resultData(null, 400, message));
    });
  };
}
