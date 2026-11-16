-- Marketing integrations: Meta (Facebook + Instagram) Lead Ads now; Google Ads / WhatsApp later.
-- Extends the existing leads table (no parallel lead system) and adds conversion tracking.

-- 1. Lead source typing + ad attribution on the existing leads table. All nullable: manual and website leads keep working.
ALTER TABLE leads
  ADD COLUMN source_type VARCHAR(20) NULL AFTER source_id,
  ADD COLUMN source_lead_id VARCHAR(100) NULL AFTER source_type,
  ADD COLUMN campaign_id VARCHAR(64) NULL,
  ADD COLUMN campaign_name VARCHAR(255) NULL,
  ADD COLUMN ad_set_id VARCHAR(64) NULL,
  ADD COLUMN ad_set_name VARCHAR(255) NULL,
  ADD COLUMN ad_id VARCHAR(64) NULL,
  ADD COLUMN ad_name VARCHAR(255) NULL,
  ADD COLUMN form_id VARCHAR(64) NULL,
  ADD COLUMN form_name VARCHAR(255) NULL,
  ADD COLUMN page_id VARCHAR(64) NULL,
  ADD COLUMN instagram_account_id VARCHAR(64) NULL,
  ADD COLUMN external_metadata JSON NULL,
  ADD UNIQUE KEY uq_leads_source_lead (source_type, source_lead_id),
  ADD KEY idx_leads_source_type (source_type, created_at),
  ADD KEY idx_leads_campaign (campaign_id),
  ADD KEY idx_leads_ad (ad_id),
  ADD KEY idx_leads_created (created_at);

UPDATE leads SET source_type = IF(form_type = 'manual', 'MANUAL', 'WEBSITE') WHERE source_type IS NULL;

-- 2. Funnel stages used by Meta analytics and conversion tracking. Placed between Qualified and Converted.
INSERT INTO lead_statuses (code, name, color, sort_order)
SELECT 'SITE_VISIT', 'Site visit', 'indigo', q.sort_order + 2 FROM lead_statuses q
WHERE q.code = 'QUALIFIED' AND NOT EXISTS (SELECT 1 FROM (SELECT code FROM lead_statuses) x WHERE x.code = 'SITE_VISIT');

INSERT INTO lead_statuses (code, name, color, sort_order)
SELECT 'NEGOTIATION', 'Negotiation', 'violet', q.sort_order + 4 FROM lead_statuses q
WHERE q.code = 'QUALIFIED' AND NOT EXISTS (SELECT 1 FROM (SELECT code FROM lead_statuses) x WHERE x.code = 'NEGOTIATION');

-- 3. Meta connection (one active connection; tokens are AES-256-GCM encrypted with APP_ENCRYPTION_KEY).
CREATE TABLE IF NOT EXISTS meta_connections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  status ENUM('PENDING_SETUP','ACTIVE','ERROR','DISCONNECTED') NOT NULL DEFAULT 'PENDING_SETUP',
  meta_user_id VARCHAR(64) NULL,
  meta_user_name VARCHAR(190) NULL,
  user_token_enc TEXT NULL,
  token_expires_at DATETIME(3) NULL,
  token_checked_at DATETIME(3) NULL,
  token_valid TINYINT(1) NULL,
  granted_scopes JSON NULL,
  website_id INT UNSIGNED NULL,
  assignment_team_id INT UNSIGNED NULL,
  connected_by INT UNSIGNED NULL,
  connected_at DATETIME(3) NULL,
  last_webhook_at DATETIME(3) NULL,
  last_lead_at DATETIME(3) NULL,
  sync_started_at DATETIME(3) NULL,
  last_sync_at DATETIME(3) NULL,
  last_sync_status ENUM('SUCCESS','PARTIAL','FAILED') NULL,
  last_sync_stats JSON NULL,
  last_error_code VARCHAR(60) NULL,
  last_error VARCHAR(1000) NULL,
  last_error_at DATETIME(3) NULL,
  disconnected_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_mc_status (status),
  CONSTRAINT fk_mc_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE SET NULL,
  CONSTRAINT fk_mc_team FOREIGN KEY (assignment_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT fk_mc_user FOREIGN KEY (connected_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Selected Business / Page / Instagram account / Ad account. Page tokens (never sent to the browser) are encrypted.
CREATE TABLE IF NOT EXISTS meta_assets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  connection_id INT UNSIGNED NOT NULL,
  asset_type ENUM('BUSINESS','PAGE','INSTAGRAM','AD_ACCOUNT') NOT NULL,
  external_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  parent_external_id VARCHAR(64) NULL,
  access_token_enc TEXT NULL,
  is_selected TINYINT(1) NOT NULL DEFAULT 1,
  webhook_subscribed_at DATETIME(3) NULL,
  meta JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ma_asset (connection_id, asset_type, external_id),
  KEY idx_ma_external (asset_type, external_id, is_selected),
  CONSTRAINT fk_ma_connection FOREIGN KEY (connection_id) REFERENCES meta_connections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meta_forms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  connection_id INT UNSIGNED NOT NULL,
  page_id VARCHAR(64) NOT NULL,
  form_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NULL,
  status VARCHAR(30) NULL,
  leads_count INT UNSIGNED NULL,
  questions JSON NULL,
  last_synced_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mf_form (form_id),
  KEY idx_mf_page (page_id),
  CONSTRAINT fk_mf_connection FOREIGN KEY (connection_id) REFERENCES meta_connections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campaign names/status and daily spend (Insights API) for cost-per-lead. Ad set / ad names live on each lead.
CREATE TABLE IF NOT EXISTS meta_campaigns (
  campaign_id VARCHAR(64) NOT NULL PRIMARY KEY,
  ad_account_id VARCHAR(64) NULL,
  name VARCHAR(255) NULL,
  status VARCHAR(30) NULL,
  objective VARCHAR(60) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_mcamp_account (ad_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meta_campaign_insights (
  campaign_id VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  spend DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NULL,
  impressions BIGINT UNSIGNED NULL,
  clicks BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (campaign_id, date),
  KEY idx_mci_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every leadgen notification (webhook or sync), idempotent on the Meta lead id.
CREATE TABLE IF NOT EXISTS meta_webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  leadgen_id VARCHAR(64) NOT NULL,
  page_id VARCHAR(64) NULL,
  form_id VARCHAR(64) NULL,
  ad_id VARCHAR(64) NULL,
  source ENUM('WEBHOOK','SYNC') NOT NULL DEFAULT 'WEBHOOK',
  status ENUM('RECEIVED','PROCESSING','PROCESSED','DUPLICATE','FAILED','IGNORED') NOT NULL DEFAULT 'RECEIVED',
  payload JSON NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  attempts INT NOT NULL DEFAULT 0,
  error VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  UNIQUE KEY uq_mwe_leadgen (leadgen_id),
  KEY idx_mwe_status (status, created_at),
  CONSTRAINT fk_mwe_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth state: single use, short lived, bound to the CRM session that started the flow.
CREATE TABLE IF NOT EXISTS meta_oauth_states (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  state_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  session_id INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mos_state (state_hash),
  CONSTRAINT fk_mos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Provider-agnostic integration log (OAuth, webhooks, imports, sync runs, API errors). Never holds tokens.
CREATE TABLE IF NOT EXISTS integration_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,
  level ENUM('info','warn','error') NOT NULL DEFAULT 'info',
  event VARCHAR(60) NOT NULL,
  message VARCHAR(500) NOT NULL,
  meta JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_il_provider (provider, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Conversion tracking: first time a lead reaches each stage. Ready for server-side conversion APIs.
CREATE TABLE IF NOT EXISTS lead_conversions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  conversion_type ENUM('QUALIFIED','SITE_VISIT','CONVERTED') NOT NULL,
  conversion_value DECIMAL(14,2) NULL,
  currency CHAR(3) NULL,
  conversion_date DATETIME(3) NOT NULL,
  recorded_by INT UNSIGNED NULL,
  provider VARCHAR(20) NULL,
  provider_sync_status ENUM('NOT_APPLICABLE','PENDING','SENT','SKIPPED','FAILED') NOT NULL DEFAULT 'NOT_APPLICABLE',
  provider_sync_error VARCHAR(500) NULL,
  provider_synced_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_lc_lead_type (lead_id, conversion_type),
  KEY idx_lc_type_date (conversion_type, conversion_date),
  KEY idx_lc_sync (provider, provider_sync_status),
  CONSTRAINT fk_lc_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lc_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
