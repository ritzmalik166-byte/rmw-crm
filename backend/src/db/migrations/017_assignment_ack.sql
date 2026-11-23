-- Assignment remark + acknowledgement. The assignee acknowledges a manual assignment; if they haven't after
-- 10 minutes, the scheduler sends them a reminder popup and tells the person who assigned it.
ALTER TABLE lead_assignments
  MODIFY reason VARCHAR(500) NULL,
  ADD COLUMN acknowledged_at DATETIME(3) NULL AFTER reason,
  ADD COLUMN reminded_at DATETIME(3) NULL AFTER acknowledged_at,
  ADD KEY idx_lassign_pending (acknowledged_at, reminded_at, created_at);
