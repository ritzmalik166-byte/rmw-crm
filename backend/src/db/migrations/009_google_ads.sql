-- Google Ads lead form webhook integration.
-- One settings row (id = 1): the shared webhook key (encrypted), target CRM website/pipeline and assignment team.
CREATE TABLE IF NOT EXISTS google_ads_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  webhook_key_enc TEXT NULL,
  key_rotated_at DATETIME(3) NULL,
  website_id INT UNSIGNED NULL,
  assignment_team_id INT UNSIGNED NULL,
  last_webhook_at DATETIME(3) NULL,
  last_lead_at DATETIME(3) NULL,
  last_test_at DATETIME(3) NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every webhook delivery, idempotent on the Google lead id (Google may re-send).
CREATE TABLE IF NOT EXISTS google_ads_lead_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_lead_id VARCHAR(190) NOT NULL,
  form_id VARCHAR(64) NULL,
  campaign_id VARCHAR(64) NULL,
  adgroup_id VARCHAR(64) NULL,
  is_test TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('RECEIVED','PROCESSED','DUPLICATE','FAILED','IGNORED') NOT NULL DEFAULT 'RECEIVED',
  payload JSON NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  attempts INT NOT NULL DEFAULT 0,
  error VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  UNIQUE KEY uq_gale_lead (google_lead_id),
  KEY idx_gale_status (status, created_at),
  CONSTRAINT fk_gale_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO google_ads_settings (id) VALUES (1);
