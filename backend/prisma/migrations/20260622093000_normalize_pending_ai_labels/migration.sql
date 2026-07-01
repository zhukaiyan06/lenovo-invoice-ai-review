-- Keep records created before Step 7 consistent with their existing status.
UPDATE "Report"
SET "aiLabel" = '正常'
WHERE "status" = '待人工审批-正常' AND "aiLabel" = '未打标';
