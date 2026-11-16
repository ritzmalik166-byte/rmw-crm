-- Meta leads are identified as META-<meta lead id> (no website prefix such as MPF-META-...).
UPDATE leads SET external_lead_id = CONCAT('META-', source_lead_id)
WHERE source_type = 'META' AND source_lead_id IS NOT NULL AND external_lead_id <> CONCAT('META-', source_lead_id);
