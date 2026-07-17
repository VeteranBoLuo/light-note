import express from 'express';
const router = express.Router();
import multer from 'multer';
import * as noteLibraryHandle from '../router_handle/noteLibraryHandle.js';
import { ensureNotVisitor } from '../util/auth.js';

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
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    const uniqueSuffix = Date.now();
    cb(null, 'note-' + uniqueSuffix + '-' + decodedName);
  },
});

const upload = multer({ storage: storage });

// 归属校验、事务与建档逻辑在 handler 层(uploadNoteImage);游客拦截前置于 multer
router.post('/uploadImage', blockVisitorUpload, upload.single('file'), noteLibraryHandle.uploadNoteImage);

router.post('/updateNote', noteLibraryHandle.updateNote);
router.post('/addNote', noteLibraryHandle.addNote);
router.post('/queryNoteList', noteLibraryHandle.queryNoteList);
router.post('/getNoteDetail', noteLibraryHandle.getNoteDetail);
router.post('/delNote', noteLibraryHandle.delNote);
router.post('/updateNoteSort', noteLibraryHandle.updateNoteSort);
router.post('/toggleNoteTop', noteLibraryHandle.toggleNoteTop);

router.post('/addNoteTag', noteLibraryHandle.addNoteTag);
router.post('/editNoteTag', noteLibraryHandle.editNoteTag);
router.post('/queryNoteTagList', noteLibraryHandle.queryNoteTagList);
router.post('/getNoteTags', noteLibraryHandle.getNoteTags);
router.post('/delNoteTag', noteLibraryHandle.delNoteTag);
router.post('/updateNoteTags', noteLibraryHandle.updateNoteTags);

router.post('/getNoteVersions', noteLibraryHandle.getNoteVersions);
router.post('/getNoteVersionDetail', noteLibraryHandle.getNoteVersionDetail);
router.post('/restoreNoteVersion', noteLibraryHandle.restoreNoteVersion);

router.post('/queryNoteTemplates', noteLibraryHandle.queryNoteTemplates);
router.post('/getNoteTemplateDetail', noteLibraryHandle.getNoteTemplateDetail);
router.post('/addNoteTemplate', noteLibraryHandle.addNoteTemplate);
router.post('/delNoteTemplate', noteLibraryHandle.delNoteTemplate);

import { assistNote } from '../router_handle/chatHandle.js';

// 笔记组手 —— AI 辅助编辑
router.post('/assist', assistNote);

export default router;
