-- Public Lead Capture API: one key per client / landing page. The key is public by design (it sits in the client's
-- landing-page form, like Sell.do's api_key); it only allows creating leads in its own pipeline, nothing else.
CREATE TABLE IF NOT EXISTS lead_capture_keys (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,                -- client / landing page label, e.g. "Eldeco Terra & Sol LP"
  api_key VARCHAR(64) NOT NULL,
  website_id INT UNSIGNED NOT NULL,          -- pipeline the leads go into
  assignment_team_id INT UNSIGNED NULL,
  allowed_domains VARCHAR(1000) NULL,        -- comma-separated; empty = any site may post
  default_project VARCHAR(255) NULL,         -- used when the form sends no project
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  leads_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_used_at DATETIME(3) NULL,
  last_error VARCHAR(500) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_lck_key (api_key),
  KEY idx_lck_website (website_id),
  CONSTRAINT fk_lck_website FOREIGN KEY (website_id) REFERENCES websites(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
