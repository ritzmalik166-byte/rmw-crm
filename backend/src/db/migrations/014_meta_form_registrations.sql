-- Client Meta lead forms received WITHOUT access to the client's Facebook Page.
-- The client registers a form (form id, name, project, field mapping, i.e. the "Campaign Detail / Fields Level Mapping"
-- sheet) and gets a per-form push URL. Their middleware (Zapier, Make, Pabbly, LeadsBridge or their own server) posts
-- every lead of that form to it; leads can also be imported from the Meta CSV export.
CREATE TABLE IF NOT EXISTS meta_form_registrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_name VARCHAR(150) NOT NULL,          -- shown as the client card in Client Leads, e.g. "M3M"
  form_id VARCHAR(64) NOT NULL,               -- Meta lead form id, e.g. 801811845786683
  form_name VARCHAR(255) NOT NULL,            -- e.g. IC_m3mcrown_leadgen_13oct25_
  project_name VARCHAR(255) NULL,             -- e.g. M3M Crown Leadgen
  campaign_type VARCHAR(60) NOT NULL DEFAULT 'Facebook Campaign',
  integration_type VARCHAR(30) NOT NULL DEFAULT 'MIDDLEWARE',
  api_key VARCHAR(64) NOT NULL,               -- secret in the push URL
  website_id INT UNSIGNED NOT NULL,           -- pipeline the leads go into
  assignment_team_id INT UNSIGNED NULL,
  field_map JSON NULL,                        -- { crmField: "field:<payload key>" | "const:<text>" }
  detected_fields JSON NULL,                  -- payload keys seen so far (drives the mapping dropdowns)
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  leads_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_lead_at DATETIME(3) NULL,
  last_test_at DATETIME(3) NULL,
  last_error VARCHAR(500) NULL,
  last_error_at DATETIME(3) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mfr_form (form_id),
  UNIQUE KEY uq_mfr_key (api_key),
  KEY idx_mfr_website (website_id),
  CONSTRAINT fk_mfr_website FOREIGN KEY (website_id) REFERENCES websites(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
