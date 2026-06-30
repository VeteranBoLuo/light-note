import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import * as noteLibraryHandle from '../router_handle/noteLibraryHandle.js';

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
import { resultData, snakeCaseKeys, insertData } from '../util/common.js';
import pool from '../db/index.js';
import { ensureNotVisitor } from '../util/auth.js';

router.post('/uploadImage', upload.single('file'), async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    if (!req.file) {
      return res.send(resultData(null, 400, '没有上传文件'));
    }
    // 构建文件的URL
    const fileUrl = `https://boluo66.top/uploads/${req.file.filename}`;
    const userId = req.user.id;
    const noteParams = {
      createBy: userId,
      title: '未命名文档',
    };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction(); // 开始事务
      let noteId = '';
      if (req.body.noteId) {
        noteId = req.body.noteId;
      } else {
        await connection.query('INSERT INTO note SET ?', [insertData(noteParams)]);
        // 获取新插入的标签ID
        const getNoteSql = `SELECT id FROM note ORDER BY create_time DESC LIMIT 1`;
        const [noteResult] = await connection.query(getNoteSql);
        const insertedNoteId = noteResult[0].id;
        noteId = insertedNoteId;
      }
      const params = {
        noteId: noteId,
        url: fileUrl,
      };
      pool
        .query('INSERT INTO note_images set ?', [insertData(params)])
        .then(() => {
          if (!req.body.noteId) {
            res.send(resultData({ url: fileUrl, noteId: noteId }));
          } else {
            res.send(resultData({ url: fileUrl }));
          }
        })
        .catch((err) => {
          res.send(resultData(null, 500, '服务器内部错误: ' + err.message)); // 设置状态码为500
        });
    } catch (error) {
      await connection.rollback(); // 回滚事务
      res.send(resultData(null, 500, '服务器内部错误: ' + error.message)); // 设置状态码为500
    } finally {
      connection.release(); // 释放连接
    }
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误' + e));
  }
});

router.post('/updateNote', noteLibraryHandle.updateNote);
router.post('/addNote', noteLibraryHandle.addNote);
router.post('/queryNoteList', noteLibraryHandle.queryNoteList);
router.post('/getNoteDetail', noteLibraryHandle.getNoteDetail);
router.post('/delNote', noteLibraryHandle.delNote);
router.post('/updateNoteSort', noteLibraryHandle.updateNoteSort);

router.post('/addNoteTag', noteLibraryHandle.addNoteTag);
router.post('/editNoteTag', noteLibraryHandle.editNoteTag);
router.post('/queryNoteTagList', noteLibraryHandle.queryNoteTagList);
router.post('/getNoteTags', noteLibraryHandle.getNoteTags);
router.post('/delNoteTag', noteLibraryHandle.delNoteTag);
router.post('/updateNoteTags', noteLibraryHandle.updateNoteTags);

import { assistNote } from '../router_handle/chatHandle.js';

// 笔记组手 —— AI 辅助编辑
router.post('/assist', assistNote);

export default router;
