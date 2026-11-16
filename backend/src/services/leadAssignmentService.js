/**
 * Picks the owner for an incoming lead (any source). Round robin = the active member with the fewest open leads,
 * ties broken by most recent login. Members must have access to the lead's website.
 *
 *  teamId given          -> round robin inside that team (e.g. the team set on the Meta connection)
 *  mode ROUND_ROBIN_TEAM -> round robin across every active team linked to the website (system setting leads.auto_assign)
 *  otherwise             -> null (lead stays unassigned; users with lead.assign are notified)
 */
const OPEN_LEADS = `(SELECT COUNT(*) FROM leads l JOIN lead_statuses s ON s.id = l.status_id
                     WHERE l.assigned_user_id = u.id AND s.is_closed = 0)`;

async function fromTeam(teamId, websiteId, conn) {
  const [rows] = await conn.query(
    `SELECT u.id, ${OPEN_LEADS} AS open_leads
     FROM team_members tm JOIN teams t ON t.id = tm.team_id JOIN users u ON u.id = tm.user_id
     JOIN user_website_access x ON x.user_id = u.id AND x.website_id = ?
     WHERE tm.team_id = ? AND t.is_active = 1 AND u.status = 'ACTIVE'
     ORDER BY open_leads ASC, u.last_login_at DESC LIMIT 1`, [websiteId, teamId],
  );
  return rows[0]?.id || null;
}

async function fromWebsiteTeams(websiteId, conn) {
  const [rows] = await conn.query(
    `SELECT u.id, ${OPEN_LEADS} AS open_leads
     FROM teams t JOIN team_members tm ON tm.team_id = t.id JOIN users u ON u.id = tm.user_id
     JOIN user_website_access x ON x.user_id = u.id AND x.website_id = t.website_id
     WHERE t.website_id = ? AND t.is_active = 1 AND u.status = 'ACTIVE'
     ORDER BY open_leads ASC, u.last_login_at DESC LIMIT 1`, [websiteId],
  );
  return rows[0]?.id || null;
}

export async function pickAssignee({ websiteId, teamId = null, mode = 'NONE' }, conn) {
  if (teamId) return { userId: await fromTeam(teamId, websiteId, conn), reason: 'auto_team_round_robin' };
  if (mode === 'ROUND_ROBIN_TEAM') return { userId: await fromWebsiteTeams(websiteId, conn), reason: 'auto_round_robin' };
  return { userId: null, reason: null };
}
