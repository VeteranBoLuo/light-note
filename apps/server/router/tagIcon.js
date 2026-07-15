import express from 'express';
import * as tagIconHandle from '../router_handle/tagIconHandle.js';

const router = express.Router();

router.post('/search', tagIconHandle.search);
router.post('/resolve', tagIconHandle.resolve);

export default router;
