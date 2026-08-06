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
router.post('/restore', todoHandle.restoreTodo);
router.post('/batch-status', todoHandle.batchStatusTodo);
router.post('/batch-delete', todoHandle.batchDeleteTodo);
router.post('/batch-restore', todoHandle.batchRestoreTodo);
router.post('/reorder', todoHandle.reorderTodo);
router.post('/snooze', todoHandle.snoozeTodo);
// App 内 .ics 落不了 blob，先换一次性 http 地址再交给系统 DownloadManager（见 handler 顶部说明）
router.post('/exportCalendar', todoHandle.createTodoCalendarTicket);
router.get('/exportCalendar', todoHandle.downloadTodoCalendarFile);

export default router;
