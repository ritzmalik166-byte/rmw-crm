import { Server } from 'socket.io';
import cookie from 'cookie';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { getRedis } from '../config/redis.js';
import { env, corsOrigins } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sessionRepo } from '../repositories/authRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { sha256 } from '../utils/crypto.js';
import { setPresenceNotifier, socketConnected, socketDisconnected, socketUpdate } from './presence.js';

let io = null;
let emitter = null;

/** Target for emits: the local server in the API process, or a Redis emitter in the worker process. */
function target() {
  if (io) return io;
  if (!emitter) {
    const redis = getRedis();
    if (redis) emitter = new Emitter(redis);
  }
  return emitter;
}

export const EVENTS = {
  NEW_LEAD: 'NEW_LEAD',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_REASSIGNED: 'LEAD_REASSIGNED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_UPDATED: 'LEAD_UPDATED',
  NEW_NOTIFICATION: 'NEW_NOTIFICATION',
  FOLLOWUP_UPDATED: 'FOLLOWUP_UPDATED',
  FORCE_LOGOUT: 'FORCE_LOGOUT',
  ASSIGNMENT_REMINDER: 'ASSIGNMENT_REMINDER',
  ASSIGNMENT_ACKNOWLEDGED: 'ASSIGNMENT_ACKNOWLEDGED',
  PRESENCE_CHANGED: 'PRESENCE_CHANGED',
  PERMISSIONS_CHANGED: 'PERMISSIONS_CHANGED',
};

const OWNER_ROOM = 'owners';

/**
 * Rooms:
 *  user:<id>              personal events (assignments, notifications)
 *  session:<id>           forced logout of a revoked session
 *  website:<id>:all       lead-wide events, joined only by users with lead.view_all for that website
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
    serveClient: false,
  });
  const redis = getRedis();
  if (redis) io.adapter(createAdapter(redis, redis.duplicate()));

  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !corsOrigins.includes(origin)) return next(new Error('origin_not_allowed'));
      const token = cookie.parse(socket.handshake.headers.cookie || '')[env.SESSION_COOKIE_NAME];
      if (!token) return next(new Error('unauthorized'));
      const session = await sessionRepo.findActiveByToken(sha256(token));
      if (!session || session.user_status !== 'ACTIVE') return next(new Error('unauthorized'));
      const ctx = await userRepo.loadAuthContext(session.user_id);
      socket.data = { userId: session.user_id, sessionId: session.id, ctx };
      return next();
    } catch (err) {
      logger.error({ err: err.message }, 'Socket auth failed');
      return next(new Error('unauthorized'));
    }
  });

  // Presence changes go only to Owner sockets (the "Live users" page refetches on this event).
  setPresenceNotifier((userId) => io?.to(OWNER_ROOM).emit(EVENTS.PRESENCE_CHANGED, { userId }));

  io.on('connection', (socket) => {
    const { userId, sessionId, ctx } = socket.data;
    socket.join(`user:${userId}`);
    socket.join(`session:${sessionId}`);
    if (ctx.permissions.has('lead.view_all')) ctx.websiteIds.forEach((w) => socket.join(`website:${w}:all`));
    if (ctx.isOwner) socket.join(OWNER_ROOM);

    socketConnected(socket.id, {
      userId,
      sessionId,
      ip: socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
    });
    socket.on('presence:update', (payload) => socketUpdate(socket.id, payload && typeof payload === 'object' ? payload : {}));
    socket.on('disconnect', () => socketDisconnected(socket.id));
  });

  return io;
}

export function emitToUser(userId, event, payload) {
  target()?.to(`user:${userId}`).emit(event, payload);
}

export function emitToWebsite(websiteId, event, payload) {
  target()?.to(`website:${websiteId}:all`).emit(event, payload);
}

export function emitToSession(sessionId, event, payload) {
  const t = target();
  t?.to(`session:${sessionId}`).emit(event, payload);
  t?.in(`session:${sessionId}`).disconnectSockets(true);
}
