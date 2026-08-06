import express from 'express';
import * as todoHandle from '../router_handle/todoHandle.js';

const router = express.Router();

router.post('/list', todoHandle.listTodo);
router.post('/count', todoHandle.countTodo);
router.post('/create', todoHandle.createTodo);
router.post('/v2/config', todoHandle.todoPlanConfigV2);
router.post('/v2/preview', todoHandle.previewTodoV2);
router.post('/v2/create', todoHandle.createTodoV2);
router.post('/v2/convert-preview', todoHandle.previewLegacyConversionV2);
router.post('/v2/convert', todoHandle.convertLegacyTodoV2);
router.post('/v2/update-preview', todoHandle.updatePreviewTodoV2);
router.post('/v2/update', todoHandle.updateTodoV2);
router.post('/v2/series/pause', todoHandle.pauseTodoSeriesV2);
router.post('/v2/series/resume', todoHandle.resumeTodoSeriesV2);
router.post('/v2/series/stop', todoHandle.stopTodoSeriesV2);
router.post('/v2/instance/skip', todoHandle.skipTodoInstanceV2);
router.post('/v2/delete', todoHandle.deleteTodoV2);
router.post('/v2/admin/diagnostics', todoHandle.todoPlanDiagnosticsV2);
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
