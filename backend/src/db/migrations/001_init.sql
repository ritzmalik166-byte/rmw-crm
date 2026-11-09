-- RMW CRM initial schema (MySQL 8 / Aiven)
CREATE TABLE IF NOT EXISTS websites (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(255) NULL,
  external_id_prefix VARCHAR(16) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_websites_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teams (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  website_id INT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_teams_dept_name (department_id, name),
  CONSTRAINT fk_teams_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_teams_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  level INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  group_name VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('PENDING_APPROVAL','ACTIVE','DISABLED','SUSPENDED','REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  department_id INT UNSIGNED NULL,
  last_login_at DATETIME(3) NULL,
  password_changed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_mobile (mobile),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_website_access (
  user_id INT UNSIGNED NOT NULL,
  website_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, website_id),
  CONSTRAINT fk_uwa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uwa_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members (
  team_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  is_lead TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (team_id, user_id),
  KEY idx_tm_user (user_id),
  CONSTRAINT fk_tm_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_registration_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  requested_department_id INT UNSIGNED NULL,
  requested_team_id INT UNSIGNED NULL,
  requested_website_ids JSON NULL,
  notes VARCHAR(1000) NULL,
  status ENUM('PENDING_APPROVAL','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_urr_status (status, created_at),
  CONSTRAINT fk_urr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_urr_dept FOREIGN KEY (requested_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_urr_team FOREIGN KEY (requested_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT fk_urr_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_devices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  device_hash CHAR(64) NOT NULL,
  device_name VARCHAR(150) NULL,
  browser VARCHAR(100) NULL,
  operating_system VARCHAR(100) NULL,
  ip_address VARCHAR(64) NULL,
  last_login_at DATETIME(3) NULL,
  last_seen_at DATETIME(3) NULL,
  is_trusted TINYINT(1) NOT NULL DEFAULT 0,
  trusted_until DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_device (user_id, device_hash),
  CONSTRAINT fk_ud_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  device_id INT UNSIGNED NULL,
  token_hash CHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  auth_method ENUM('PASSWORD','PASSWORD_OTP','OTP') NOT NULL,
  otp_verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoked_reason VARCHAR(100) NULL,
  revoked_by INT UNSIGNED NULL,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_device FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_revoker FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_challenges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose ENUM('LOGIN_OTP','NEW_DEVICE') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  device_hash CHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_challenge_token (token_hash),
  CONSTRAINT fk_ac_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otp_verification_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  mobile VARCHAR(20) NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  status ENUM('SENT','VERIFIED','FAILED','EXPIRED','SEND_FAILED','SUPERSEDED') NOT NULL DEFAULT 'SENT',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at DATETIME(3) NOT NULL,
  verified_at DATETIME(3) NULL,
  ip_address VARCHAR(64) NULL,
  provider_response VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_otp_mobile_created (mobile, created_at),
  KEY idx_otp_challenge (challenge_id),
  CONSTRAINT fk_otp_challenge FOREIGN KEY (challenge_id) REFERENCES auth_challenges(id) ON DELETE CASCADE,
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_prt_token (token_hash),
  KEY idx_prt_user (user_id),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS website_integrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  website_id INT UNSIGNED NOT NULL,
  method ENUM('WEBHOOK','POLLING') NOT NULL DEFAULT 'WEBHOOK',
  api_key_prefix VARCHAR(16) NULL,
  api_key_hash CHAR(64) NULL,
  hmac_secret_enc VARCHAR(512) NULL,
  require_signature TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_received_at DATETIME(3) NULL,
  last_success_at DATETIME(3) NULL,
  last_failure_at DATETIME(3) NULL,
  last_error VARCHAR(1000) NULL,
  success_count INT UNSIGNED NOT NULL DEFAULT 0,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  key_rotated_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_wi_website (website_id),
  KEY idx_wi_key (api_key_hash),
  CONSTRAINT fk_wi_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_statuses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'slate',
  sort_order INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_conversion TINYINT(1) NOT NULL DEFAULT 0,
  is_closed TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ls_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_sources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_lsrc_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  website_id INT UNSIGNED NOT NULL,
  external_lead_id VARCHAR(100) NOT NULL,
  external_raw_id VARCHAR(100) NULL,
  name VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  phone_normalized VARCHAR(20) NULL,
  email VARCHAR(190) NULL,
  email_normalized VARCHAR(190) NULL,
  location VARCHAR(255) NULL,
  interest VARCHAR(255) NULL,
  message TEXT NULL,
  form_type VARCHAR(80) NULL,
  status_id INT UNSIGNED NOT NULL,
  source_id INT UNSIGNED NULL,
  assigned_user_id INT UNSIGNED NULL,
  team_id INT UNSIGNED NULL,
  is_duplicate_suspect TINYINT(1) NOT NULL DEFAULT 0,
  merged_into_lead_id BIGINT UNSIGNED NULL,
  extra JSON NULL,
  raw_payload JSON NULL,
  external_created_at DATETIME(3) NULL,
  converted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_leads_external (website_id, external_lead_id),
  KEY idx_leads_phone (phone_normalized),
  KEY idx_leads_email (email_normalized),
  KEY idx_leads_status (status_id, created_at),
  KEY idx_leads_assigned (assigned_user_id, created_at),
  KEY idx_leads_website_created (website_id, created_at),
  KEY idx_leads_source (source_id),
  KEY idx_leads_merged (merged_into_lead_id),
  CONSTRAINT fk_leads_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE RESTRICT,
  CONSTRAINT fk_leads_status FOREIGN KEY (status_id) REFERENCES lead_statuses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_leads_source FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_assigned FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_merged FOREIGN KEY (merged_into_lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_attributions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(255) NULL,
  medium VARCHAR(255) NULL,
  campaign VARCHAR(255) NULL,
  term VARCHAR(255) NULL,
  content VARCHAR(255) NULL,
  landing_page VARCHAR(2048) NULL,
  referrer VARCHAR(2048) NULL,
  utm_source VARCHAR(255) NULL,
  utm_medium VARCHAR(255) NULL,
  utm_campaign VARCHAR(255) NULL,
  utm_term VARCHAR(255) NULL,
  utm_content VARCHAR(255) NULL,
  gclid VARCHAR(255) NULL,
  fbclid VARCHAR(255) NULL,
  msclkid VARCHAR(255) NULL,
  page_name VARCHAR(255) NULL,
  extra JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_la_lead (lead_id),
  KEY idx_la_utm_source (utm_source),
  KEY idx_la_campaign (utm_campaign),
  CONSTRAINT fk_la_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  assigned_user_id INT UNSIGNED NULL,
  previous_user_id INT UNSIGNED NULL,
  assigned_by INT UNSIGNED NULL,
  team_id INT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_lassign_lead (lead_id, created_at),
  CONSTRAINT fk_lassign_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lassign_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lassign_prev FOREIGN KEY (previous_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lassign_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_lassign_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_lnotes_lead (lead_id, created_at),
  CONSTRAINT fk_lnotes_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lnotes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_followups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NULL,
  due_at DATETIME(3) NOT NULL,
  notes TEXT NULL,
  priority ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('UPCOMING','COMPLETED','OVERDUE','CANCELLED') NOT NULL DEFAULT 'UPCOMING',
  completed_at DATETIME(3) NULL,
  reminder_sent_at DATETIME(3) NULL,
  overdue_notified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_lf_user_due (user_id, status, due_at),
  KEY idx_lf_status_due (status, due_at),
  KEY idx_lf_lead (lead_id),
  CONSTRAINT fk_lf_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lf_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  type VARCHAR(50) NOT NULL,
  meta JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_lact_lead (lead_id, created_at),
  CONSTRAINT fk_lact_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lact_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_duplicates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id BIGINT UNSIGNED NOT NULL,
  candidate_lead_id BIGINT UNSIGNED NOT NULL,
  match_reasons JSON NOT NULL,
  status ENUM('OPEN','MERGED','KEPT_SEPARATE') NOT NULL DEFAULT 'OPEN',
  resolved_by INT UNSIGNED NULL,
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ldup_pair (lead_id, candidate_lead_id),
  KEY idx_ldup_status (status),
  CONSTRAINT fk_ldup_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_ldup_cand FOREIGN KEY (candidate_lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_ldup_resolver FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  website_id INT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(190) NOT NULL,
  status ENUM('RECEIVED','PROCESSING','PROCESSED','DUPLICATE','FAILED') NOT NULL DEFAULT 'RECEIVED',
  payload JSON NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  attempts INT NOT NULL DEFAULT 0,
  error VARCHAR(1000) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  UNIQUE KEY uq_ie_idem (website_id, idempotency_key),
  KEY idx_ie_status (status, created_at),
  CONSTRAINT fk_ie_website FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
  CONSTRAINT fk_ie_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(1000) NULL,
  link VARCHAR(500) NULL,
  data JSON NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  in_app TINYINT(1) NOT NULL DEFAULT 1,
  push TINYINT(1) NOT NULL DEFAULT 1,
  email TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, type),
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ss_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  meta JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_actor (actor_user_id, created_at),
  KEY idx_audit_action (action, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
