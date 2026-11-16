import 'dotenv/config'; // loads DROPLET_HOST / DB_PORT from backend/.env
import { spawn } from 'node:child_process';

const host = process.env.DROPLET_HOST;
if (!host) {
  console.error('DROPLET_HOST is not set in backend/.env (the droplet IP that runs the CRM).');
  process.exit(1);
}
const user = process.env.DROPLET_SSH_USER || 'root';
const localPort = process.env.DB_PORT || '3310';

const args = [
  '-N',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-L', `${localPort}:127.0.0.1:3306`,
];
if (process.env.DROPLET_SSH_KEY) args.push('-i', process.env.DROPLET_SSH_KEY);
args.push(`${user}@${host}`);

console.log(`Tunnel: localhost:${localPort} -> ${host}:3306 (Ctrl+C to stop)`);
const ssh = spawn('ssh', args, { stdio: 'inherit' });
ssh.on('exit', (code) => process.exit(code ?? 0));
