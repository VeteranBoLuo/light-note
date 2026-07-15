import express from 'express';
import * as todoHandle from '../router_handle/todoHandle.js';

const router = express.Router();

router.post('/list', todoHandle.listTodo);
router.post('/count', todoHandle.countTodo);
router.post('/create', todoHandle.createTodo);
router.post('/update', todoHandle.updateTodo);
router.post('/complete', todoHandle.completeTodo);
router.post('/reopen', todoHandle.reopenTodo);
router.post('/delete', todoHandle.deleteTodo);

export default router;
