-- Junk / non-lead flag. NULL = real lead. Junk leads stay stored (so re-syncs don't re-create them) but are hidden by default.
ALTER TABLE leads ADD COLUMN junk_reason VARCHAR(40) NULL AFTER is_duplicate_suspect;
ALTER TABLE leads ADD INDEX idx_leads_junk (website_id, junk_reason);
