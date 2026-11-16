/**
 * Duplicate detection shared by every lead source.
 *
 * Match priority:
 *   1. Source lead id (e.g. the Meta leadgen id) -> the SAME lead; never create another, update/sync it instead.
 *   2. Phone (normalised)                        -> a different submission by the same person: flagged for review.
 *   3. Email (normalised)                        -> same, flagged for review.
 * 2 and 3 never merge automatically; they go to lead_duplicates so a user with lead.merge decides.
 */

/** Exact match on the provider's own lead id. `lock` takes a row lock inside a transaction. */
export async function findBySourceLeadId(sourceType, sourceLeadId, conn, { lock = false } = {}) {
  if (!sourceType || !sourceLeadId) return null;
  const [rows] = await conn.query(
    `SELECT * FROM leads WHERE source_type = ? AND source_lead_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [sourceType, String(sourceLeadId)],
  );
  return rows[0] || null;
}

/** Other live leads with the same phone or email. Returns rows with the reasons they matched. */
export async function findContactMatches({ excludeLeadId = 0, phoneN, emailN, websiteId = null }, conn) {
  if (!phoneN && !emailN) return [];
  const [rows] = await conn.query(
    `SELECT id, phone_normalized, email_normalized, website_id FROM leads
     WHERE id <> ? AND merged_into_lead_id IS NULL
       AND ((? IS NOT NULL AND phone_normalized = ?) OR (? IS NOT NULL AND email_normalized = ?))
     ORDER BY id DESC LIMIT 10`,
    [excludeLeadId || 0, phoneN || null, phoneN || null, emailN || null, emailN || null],
  );
  return rows.map((r) => {
    const reasons = [];
    if (phoneN && r.phone_normalized === phoneN) reasons.push('phone');
    if (emailN && r.email_normalized === emailN) reasons.push('email');
    if (websiteId && r.website_id !== websiteId) reasons.push('cross_website');
    return { ...r, reasons };
  });
}

/**
 * Highest-priority existing match for an incoming lead, or null. Used for reporting and pre-checks;
 * only `source_lead_id` means "same lead".
 */
export async function findExistingLead({ sourceType, sourceLeadId, phoneN, emailN }, conn) {
  const bySource = await findBySourceLeadId(sourceType, sourceLeadId, conn);
  if (bySource) return { matchedBy: 'source_lead_id', lead: bySource };
  const contacts = await findContactMatches({ phoneN, emailN }, conn);
  const byPhone = contacts.find((c) => c.reasons.includes('phone'));
  if (byPhone) return { matchedBy: 'phone', lead: byPhone };
  const byEmail = contacts.find((c) => c.reasons.includes('email'));
  if (byEmail) return { matchedBy: 'email', lead: byEmail };
  return null;
}

/** Record possible duplicates of a newly created lead for review. Returns the candidate lead ids. */
export async function flagDuplicates(lead, conn) {
  const matches = await findContactMatches({ excludeLeadId: lead.id, phoneN: lead.phone_normalized, emailN: lead.email_normalized, websiteId: lead.website_id }, conn);
  for (const m of matches) {
    await conn.query('INSERT IGNORE INTO lead_duplicates (lead_id, candidate_lead_id, match_reasons) VALUES (?, ?, ?)', [lead.id, m.id, JSON.stringify(m.reasons)]);
  }
  if (matches.length) await conn.query('UPDATE leads SET is_duplicate_suspect = 1 WHERE id = ?', [lead.id]);
  return matches.map((m) => m.id);
}
