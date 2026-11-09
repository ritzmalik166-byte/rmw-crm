import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool, transaction } from '../config/db.js';
import { normalizePhone, normalizeEmail } from '../utils/normalize.js';
import { validatePasswordStrength } from '../validators/common.js';

async function main() {
  const rl = readline.createInterface({ input, output });
  const fullName = (await rl.question('Full name: ')).trim();
  const email = normalizeEmail(await rl.question('Email: '));
  const mobile = normalizePhone(await rl.question('Mobile (10 digits): '));
  const password = await rl.question('Password (min 10 chars, upper/lower/digit): ');
  rl.close();

  if (!fullName || !email || !mobile || mobile.length < 10) throw new Error('Name, valid email and mobile are required');
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);

  const hash = await bcrypt.hash(password, 12);
  await transaction(async (conn) => {
    const [res] = await conn.query(
      "INSERT INTO users (full_name, email, mobile, password_hash, status, password_changed_at) VALUES (?, ?, ?, ?, 'ACTIVE', NOW(3))",
      [fullName, email, mobile, hash],
    );
    await conn.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'SUPER_ADMIN'", [res.insertId]);
    await conn.query('INSERT INTO user_website_access (user_id, website_id) SELECT ?, id FROM websites', [res.insertId]);
    await conn.query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta) VALUES (NULL, 'USER_CREATED', 'user', ?, ?)",
      [String(res.insertId), JSON.stringify({ via: 'create-super-admin script', role: 'SUPER_ADMIN' })],
    );
  });
  console.log(`Super Admin ${email} created. Log in at the CRM; the first login will require mobile OTP.`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
