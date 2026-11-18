-- Multiple Facebook Pages on one Meta connection. Connect Meta once: every Page the account manages is imported into
-- meta_assets (is_selected = 0 until switched on). Each active Page can send its leads to its own pipeline / team;
-- NULL falls back to the connection defaults (meta_connections.website_id / assignment_team_id).
ALTER TABLE meta_assets
  ADD COLUMN website_id INT UNSIGNED NULL AFTER is_selected,
  ADD COLUMN assignment_team_id INT UNSIGNED NULL AFTER website_id,
  ADD CONSTRAINT fk_ma_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_ma_team FOREIGN KEY (assignment_team_id) REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_page ON leads (page_id);
