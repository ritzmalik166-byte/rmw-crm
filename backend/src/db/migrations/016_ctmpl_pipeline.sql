-- CTMPL (Creative Thinks Media) website pipeline. Leads arrive through the Lead Capture API (key → this website).
-- The domain can be changed later in Super Admin → Websites.
INSERT INTO websites (code, name, domain, external_id_prefix, is_active)
SELECT 'CTMPL', 'Creative Thinks Media', 'creativethinksmedia.com', 'CTMPL', 1
WHERE NOT EXISTS (SELECT 1 FROM websites WHERE code = 'CTMPL');
