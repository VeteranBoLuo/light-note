import express from 'express';
import rateLimit from 'express-rate-limit';
const router = express.Router();
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import * as noteLibraryHandle from '../router_handle/noteLibraryHandle.js';
import * as noteShareHandle from '../router_handle/noteShareHandle.js';
import { ensureNotVisitor } from '../util/auth.js';
import { L, resultData } from '../util/common.js';
import { NOTE_IMAGE_MAX_BYTES, noteImageExtensionForMimeType } from '../util/noteImageUpload.js';

const noteShareAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.send(
      resultData(
        { errorCode: 'SHARE_RATE_LIMITED' },
        429,
        L(req, '尝试次数过多，请稍后再试', 'Too many attempts. Try again later'),
      ),
    ),
});
const noteShareReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.send(
      resultData(
        { errorCode: 'NOTE_SHARE_READ_RATE_LIMITED' },
        429,
        L(req, '阅读请求过于频繁，请稍后重试', 'Too many reading requests. Try again later'),
      ),
    ),
});

// 游客拦截必须先于 multer 落盘,否则游客请求也会在磁盘留下孤儿文件
const blockVisitorUpload = (req, res, next) => {
  if (!ensureNotVisitor(req, res)) return;
  next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/www/wwwroot/images');
  },
  filename: (req, file, cb) => {
    const extension = noteImageExtensionForMimeType(file.mimetype);
    cb(null, `note-${Date.now()}-${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: NOTE_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!noteImageExtensionForMimeType(file.mimetype)) {
      const error = new Error('NOTE_IMAGE_TYPE_UNSUPPORTED');
      error.code = 'NOTE_IMAGE_TYPE_UNSUPPORTED';
      return cb(error);
    }
    return cb(null, true);
  },
});

const receiveNoteImage = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.send(resultData(null, 413, '单张图片不能超过 20MB'));
    }
    return res.send(resultData(null, 400, '仅支持 JPG、PNG、WebP 或 GIF 图片'));
  });
};

// 归属校验、事务与建档逻辑在 handler 层(uploadNoteImage);游客拦截前置于 multer
router.post('/uploadImage', blockVisitorUpload, receiveNoteImage, noteLibraryHandle.uploadNoteImage);

router.post('/updateNote', noteLibraryHandle.updateNote);
router.post('/updateDrawingNote', noteLibraryHandle.updateDrawingNote);
router.post('/convertMode', noteLibraryHandle.convertNoteMode);
router.post('/addNote', noteLibraryHandle.addNote);
router.post('/queryNoteList', noteLibraryHandle.queryNoteList);
router.post('/queryDrawingPreviews', noteLibraryHandle.queryDrawingPreviews);
router.get('/image-thumbnail/:fileName', noteLibraryHandle.getNoteImageThumbnail);
router.post('/getNoteTreeFeatures', noteLibraryHandle.getNoteTreeFeatures);
router.post('/queryNoteTree', noteLibraryHandle.queryNoteTree);
router.post('/queryNoteBreadcrumb', noteLibraryHandle.queryNoteBreadcrumb);
router.post('/moveNoteNode', noteLibraryHandle.moveNoteNode);
router.post('/moveNoteNodes', noteLibraryHandle.moveNoteNodes);
router.post('/getNoteDetail', noteLibraryHandle.getNoteDetail);
router.post('/getNotesForExport', noteLibraryHandle.getNotesForExport);
router.post('/resolveResourceRefs', noteLibraryHandle.resolveResourceRefs);
router.post('/resourceBacklinks', noteLibraryHandle.resourceBacklinks);
router.post('/delNote', noteLibraryHandle.delNote);
router.post('/deleteNoteSubtree', noteLibraryHandle.deleteNoteSubtree);
router.post('/updateNoteSort', noteLibraryHandle.updateNoteSort);
router.post('/toggleNoteTop', noteLibraryHandle.toggleNoteTop);

router.post('/share/create', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return noteShareHandle.createNoteShare(req, res);
});
router.post('/share/list', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return noteShareHandle.listNoteShares(req, res);
});
router.post('/share/revoke', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return noteShareHandle.revokeNoteShare(req, res);
});
router.post('/share/rotate', (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  return noteShareHandle.rotateNoteShare(req, res);
});
router.post('/share/resolve', noteShareAccessLimiter, noteShareHandle.resolveNoteShare);
router.post('/share/page', noteShareReadLimiter, noteShareHandle.getNoteSharePage);
router.post('/share/tree', noteShareReadLimiter, noteShareHandle.getNoteShareTree);

router.post('/addNoteTag', noteLibraryHandle.addNoteTag);
router.post('/editNoteTag', noteLibraryHandle.editNoteTag);
router.post('/queryNoteTagList', noteLibraryHandle.queryNoteTagList);
router.post('/getNoteTags', noteLibraryHandle.getNoteTags);
router.post('/delNoteTag', noteLibraryHandle.delNoteTag);
router.post('/updateNoteTags', noteLibraryHandle.updateNoteTags);

router.post('/getNoteVersions', noteLibraryHandle.getNoteVersions);
router.post('/createNoteVersion', noteLibraryHandle.createNoteVersion);
router.post('/getNoteVersionDetail', noteLibraryHandle.getNoteVersionDetail);
router.post('/restoreNoteVersion', noteLibraryHandle.restoreNoteVersion);

// 导出中转:POST 换一次性下载票据,GET 由系统 DownloadManager 取件(仅 Android App 需要)
router.post('/exportFile', noteLibraryHandle.createNoteExportTicket);
router.get('/exportFile', noteLibraryHandle.downloadNoteExportFile);

router.post('/queryNoteTemplates', noteLibraryHandle.queryNoteTemplates);
router.post('/getNoteTemplateDetail', noteLibraryHandle.getNoteTemplateDetail);
router.post('/addNoteTemplate', noteLibraryHandle.addNoteTemplate);
router.post('/updateNoteTemplate', noteLibraryHandle.updateNoteTemplate);
router.post('/duplicateNoteTemplate', noteLibraryHandle.duplicateNoteTemplate);
router.post('/delNoteTemplate', noteLibraryHandle.delNoteTemplate);

import { assistNote } from '../router_handle/chatHandle.js';

// 笔记组手 —— AI 辅助编辑
router.post('/assist', assistNote);

export default router;
