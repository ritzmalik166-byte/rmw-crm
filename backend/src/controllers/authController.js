import { authService } from '../services/auth/authService.js';
import { userRepo } from '../repositories/userRepo.js';
import { audit } from '../services/auditService.js';
import { settingsService } from '../services/settingsService.js';
import { isOtpProviderConfigured } from '../services/auth/otpService.js';
import { query } from '../config/db.js';
import { ok } from '../utils/http.js';

export const authController = {
  async registerRequest(req, res) {
    const r = await authService.registerRequest(req, req.body);
    ok(res, r, 'Your request has been submitted. You can sign in once a Super Admin approves it.', 201);
  },
  async login(req, res) { ok(res, await authService.loginWithPassword(req, res, req.body)); },
  async sendOtp(req, res) { ok(res, await authService.requestLoginOtp(req, res, req.body), 'If this number is registered, a code has been sent.'); },
  async resendOtp(req, res) { ok(res, await authService.resendOtp(req)); },
  async verifyOtp(req, res) { ok(res, await authService.verifyOtp(req, res, req.body)); },
  async trustDevice(req, res) { await authService.trustCurrentDevice(req, req.body); ok(res, null, 'This device is now trusted'); },
  async sessions(req, res) { ok(res, await authService.listSessions(req)); },
  async revokeSession(req, res) { await authService.revokeOwnSession(req, Number(req.params.id)); ok(res, null, 'Device signed out'); },
  async logoutAll(req, res) { ok(res, await authService.logoutAllOthers(req), 'Signed out of all other devices'); },
  async logout(req, res) { await authService.logout(req, res); ok(res, null, 'Signed out'); },
  async forgot(req, res) {
    await authService.forgotPassword(req, req.body);
    ok(res, null, 'If an account exists for this email, a reset link has been sent.');
  },
  async reset(req, res) { await authService.resetPassword(req, req.body); ok(res, null, 'Password updated. Please sign in.'); },
  async changePassword(req, res) { await authService.changePassword(req, req.body); ok(res, null, 'Password changed'); },

  async me(req, res) {
    const { user, ctx, session } = req.auth;
    ok(res, {
      user,
      roles: ctx.roles,
      permissions: [...ctx.permissions],
      websites: ctx.websites,
      teams: ctx.teams,
      areas: { crm: ctx.permissions.has('area.crm'), admin: ctx.permissions.has('area.admin'), superAdmin: ctx.permissions.has('area.super_admin') },
      session: { id: session.id, authMethod: session.auth_method, otpVerifiedAt: session.otp_verified_at },
    });
  },

  async updateProfile(req, res) {
    await userRepo.update(req.auth.user.id, { fullName: req.body.fullName });
    await audit('USER_UPDATED', { actorId: req.auth.user.id, entityType: 'user', entityId: req.auth.user.id, req, meta: { fields: ['fullName'], self: true } });
    ok(res, null, 'Profile updated');
  },

  /** Public data needed by the registration and login screens. */
  async publicConfig(_req, res) {
    const [departments, teams, websites] = await Promise.all([
      query('SELECT id, name FROM departments WHERE is_active = 1 ORDER BY name'),
      query('SELECT id, name, department_id FROM teams WHERE is_active = 1 ORDER BY name'),
      query('SELECT id, code, name FROM websites WHERE is_active = 1 ORDER BY id'),
    ]);
    ok(res, {
      departments, teams, websites,
      otpEnabled: isOtpProviderConfigured(),
      trustedDeviceDays: await settingsService.get('auth.trusted_device_days_options'),
      trustedDeviceDefault: await settingsService.get('auth.trusted_device_default_days'),
    });
  },
};
