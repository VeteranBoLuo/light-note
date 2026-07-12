import express from 'express';
const router = express.Router();

import * as todoHandle from '../router_handle/todoHandle.js';

router.post('/list', todoHandle.getTodos);
router.post('/add', todoHandle.addTodo);
router.post('/update', todoHandle.updateTodo);
router.post('/toggle', todoHandle.toggleTodo);
router.post('/delete', todoHandle.removeTodo);
router.post('/clearDone', todoHandle.clearDone);

export default router;
