-- AI calling agent: an automated call to each new lead a few minutes after it arrives.
-- One row per call attempt. Retries (no answer / busy) are new rows with attempt + 1.
CREATE TABLE IF NOT EXISTS ai_calls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  attempt TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('SCHEDULED','DIALING','IN_PROGRESS','COMPLETED','NO_ANSWER','BUSY','FAILED','CANCELLED','SKIPPED') NOT NULL DEFAULT 'SCHEDULED',
  trigger_type ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  scheduled_at DATETIME(3) NOT NULL,
  provider VARCHAR(30) NULL,
  provider_call_id VARCHAR(120) NULL,
  to_phone VARCHAR(20) NOT NULL,
  started_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  duration_seconds INT UNSIGNED NULL,
  ended_reason VARCHAR(120) NULL,
  outcome VARCHAR(30) NULL,            -- INTERESTED | NOT_INTERESTED | CALLBACK | WRONG_NUMBER | DO_NOT_CALL | UNCLEAR
  summary TEXT NULL,
  transcript MEDIUMTEXT NULL,
  extracted JSON NULL,                 -- answers: configuration, budget, location, timeline, site visit, callback time…
  recording_url VARCHAR(1000) NULL,    -- provider's copy
  recording_path VARCHAR(255) NULL,    -- our copy (relative to AI_CALL_RECORDINGS_DIR)
  cost_amount DECIMAL(10,4) NULL,
  cost_currency CHAR(3) NULL,
  skip_reason VARCHAR(100) NULL,
  error VARCHAR(1000) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_ai_calls_due (status, scheduled_at),
  KEY idx_ai_calls_lead (lead_id, created_at),
  KEY idx_ai_calls_phone (to_phone, created_at),
  UNIQUE KEY uq_ai_calls_provider (provider, provider_call_id),
  CONSTRAINT fk_ai_calls_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_calls_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-row settings for the agent (kept out of system_settings so the System settings page never overwrites it).
CREATE TABLE IF NOT EXISTS ai_call_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  config JSON NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ai_call_config_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Don't call me" said on an AI call (or set by the team): the agent never calls this lead again.
ALTER TABLE leads ADD COLUMN do_not_call TINYINT(1) NOT NULL DEFAULT 0;

INSERT INTO permissions (code, group_name, description) VALUES
  ('aicall.view', 'ai calling', 'Listen to AI call recordings and read transcripts on leads they can see'),
  ('aicall.manage', 'ai calling', 'Configure the AI calling agent (on/off, websites, hours, script)')
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description);

-- View: every role that can see leads. Manage: Owner and Super Admin.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.id FROM role_permissions rp
JOIN permissions lv ON lv.id = rp.permission_id AND lv.code = 'lead.view'
JOIN permissions p ON p.code = 'aicall.view';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'aicall.manage'
WHERE r.code IN ('OWNER', 'SUPER_ADMIN');
