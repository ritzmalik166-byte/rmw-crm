/**
 * Creates (or promotes) the single Owner account: the role above Super Admin that can block or unblock any account.
 *
 *   npm run create-owner
 *
 * Reads OWNER_NAME, OWNER_EMAIL, OWNER_MOBILE and OWNER_PASSWORD from the environment, and prompts for anything missing.
 * If a user with that email already exists, it gets the Owner role, is set ACTIVE, and has its password replaced.
 * Run `npm run migrate` first so the OWNER role and BLOCKED status exist.
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool, transaction } from '../config/db.js';
import { normalizePhone, normalizeEmail } from '../utils/normalize.js';
import { validatePasswordStrength } from '../validators/common.js';

async function ask(rl, envKey, label) {
  return process.env[envKey] || (await rl.question(label));
}

async function main() {
  const rl = readline.createInterface({ input, output });
  const fullName = (await ask(rl, 'OWNER_NAME', 'Full name: ')).trim();
  const email = normalizeEmail(await ask(rl, 'OWNER_EMAIL', 'Email: '));
  const mobile = normalizePhone(await ask(rl, 'OWNER_MOBILE', 'Mobile (10 digits): '));
  const password = await ask(rl, 'OWNER_PASSWORD', 'Password (min 10 chars, upper/lower/digit): ');
  rl.close();

  if (!fullName || !email || !mobile || mobile.length < 10) throw new Error('Name, valid email and mobile are required');
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);

  const hash = await bcrypt.hash(password, 12);
  const { id, created } = await transaction(async (conn) => {
    const [[role]] = await conn.query("SELECT id FROM roles WHERE code = 'OWNER'");
    if (!role) throw new Error('OWNER role not found. Run `npm run migrate` first.');

    const [[byEmail]] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    const [[byMobile]] = await conn.query('SELECT id, email FROM users WHERE mobile = ?', [mobile]);
    if (byMobile && (!byEmail || byMobile.id !== byEmail.id)) throw new Error(`Mobile ${mobile} already belongs to ${byMobile.email}`);

    let userId = byEmail?.id;
    if (userId) {
      await conn.query(
        "UPDATE users SET full_name = ?, mobile = ?, password_hash = ?, status = 'ACTIVE', password_changed_at = NOW(3) WHERE id = ?",
        [fullName, mobile, hash, userId],
      );
    } else {
      const [res] = await conn.query(
        "INSERT INTO users (full_name, email, mobile, password_hash, status, password_changed_at) VALUES (?, ?, ?, ?, 'ACTIVE', NOW(3))",
        [fullName, email, mobile, hash],
      );
      userId = res.insertId;
    }
    await conn.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, role.id]);
    await conn.query('INSERT IGNORE INTO user_website_access (user_id, website_id) SELECT ?, id FROM websites', [userId]);
    await conn.query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta) VALUES (NULL, ?, 'user', ?, ?)",
      [byEmail ? 'ROLE_CHANGED' : 'USER_CREATED', String(userId), JSON.stringify({ via: 'create-owner script', role: 'OWNER' })],
    );
    return { id: userId, created: !byEmail };
  });
  console.log(`Owner ${email} ${created ? 'created' : 'promoted'} (user #${id}). The first login will require mobile OTP.`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
