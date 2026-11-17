-- Google Ads integration removed from the CRM: drop its tables and log entries (no leads were ever received through it).
DROP TABLE IF EXISTS google_ads_lead_events;
DROP TABLE IF EXISTS google_ads_settings;
DELETE FROM integration_logs WHERE provider = 'GOOGLE_ADS';
