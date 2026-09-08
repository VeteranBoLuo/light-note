-- Application rollback: stop new OCR creation and drain or cancel all free OCR tasks with the new Worker first.
-- Keep usage and input records: dropping them would lose settlement and cache state.
-- Keep nullable quote_id; it is backward-compatible with all paid jobs.
SELECT COUNT(*) AS free_ocr_tasks_to_drain FROM toolbox_jobs WHERE billing_medium = 'free' AND status IN ('queued','processing');
