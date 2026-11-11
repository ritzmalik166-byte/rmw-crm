import { Router } from 'express';
import { authController as c } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { limiters } from '../middleware/security.js';
import { validate } from '../validators/common.js';
import { auth as s } from '../validators/schemas.js';
import { asyncHandler as h } from '../utils/http.js';

const r = Router();

r.get('/public-config', h(c.publicConfig));
r.post('/register-request', limiters.register, validate(s.register), h(c.registerRequest));
r.post('/login', limiters.login, validate(s.login), h(c.login));
r.post('/otp/send', limiters.otpSend, validate(s.otpSend), h(c.sendOtp));
r.post('/otp/resend', limiters.otpSend, h(c.resendOtp));
r.post('/otp/verify', limiters.otpVerify, validate(s.otpVerify), h(c.verifyOtp));
r.post('/device/verify', limiters.otpVerify, validate(s.otpVerify), h(c.verifyOtp)); // alias: new-device verification
r.post('/forgot-password', limiters.forgot, validate(s.forgot), h(c.forgot));
r.post('/reset-password', limiters.forgot, validate(s.reset), h(c.reset));

r.use(authenticate);
r.get('/me', h(c.me));
r.patch('/me', validate(s.profile), h(c.updateProfile));
r.post('/change-password', validate(s.changePassword), h(c.changePassword));
r.put('/me/avatar', validate(s.avatar), h(c.updateAvatar));
r.post('/me/mobile/request', limiters.otpSend, validate(s.mobileChangeRequest), h(c.requestMobileChange));
r.post('/me/mobile/verify', limiters.otpVerify, validate(s.mobileChangeVerify), h(c.verifyMobileChange));
r.post('/me/email/request', limiters.otpSend, validate(s.emailChangeRequest), h(c.requestEmailChange));
r.post('/me/email/verify', limiters.otpVerify, validate(s.emailChangeVerify), h(c.verifyEmailChange));
r.post('/device/trust', validate(s.trust), h(c.trustDevice));
r.get('/sessions', h(c.sessions));
r.delete('/sessions/:id', h(c.revokeSession));
r.post('/sessions/logout-all', h(c.logoutAll));
r.post('/logout', h(c.logout));

export default r;
