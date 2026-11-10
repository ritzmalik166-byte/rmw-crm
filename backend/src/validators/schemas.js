import { z } from 'zod';
import { passwordSchema, mobileSchema, emailSchema, avatarSchema } from './common.js';

const id = z.coerce.number().int().positive();
const optId = id.optional().nullable();
const str = (max = 255) => z.string().trim().max(max);
const optStr = (max = 255) => z.string().trim().max(max).optional().nullable().transform((v) => (v === '' ? null : v));
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

export const auth = {
  register: z.object({
    fullName: str(150).min(2, 'Enter your full name'),
    mobile: mobileSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    departmentId: optId,
    teamId: optId,
    websiteIds: z.array(id).max(10).default([]),
    notes: optStr(1000),
  }).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] }),
  login: z.object({ email: emailSchema, password: z.string().min(1).max(128) }),
  otpSend: z.object({ mobile: mobileSchema }),
  otpVerify: z.object({
    otp: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received'),
    trustDevice: z.boolean().default(false),
    trustDays: z.coerce.number().int().optional(),
  }),
  trust: z.object({ days: z.coerce.number().int() }),
  forgot: z.object({ email: emailSchema }),
  reset: z.object({ token: z.string().min(20).max(200), password: passwordSchema, confirmPassword: z.string() })
    .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] }),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }),
  profile: z.object({ fullName: str(150).min(2) }),
  avatar: z.object({ avatar: avatarSchema }),
  mobileChangeRequest: z.object({ mobile: mobileSchema, currentPassword: z.string().min(1).max(128) }),
  mobileChangeVerify: z.object({ otp: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received') }),
};

export const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });

export const leads = {
  listQuery: pagination.extend({
    search: optStr(100), websiteId: optId, statusId: optId, source: optStr(), campaign: optStr(),
    assignedUserId: z.union([z.literal('me'), z.literal('unassigned'), id]).optional(),
    from: optStr(40).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date'),
    to: optStr(40).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date'),
    duplicates: bool.optional(),
    junk: z.enum(['hide', 'only', 'all']).optional(),
    pipeline: z.enum(['mpf', 'ct', 'rmw', 'career', 'general']).optional(),
    formType: optStr(80),
    interest: optStr(100),
    sort: z.enum(['created_at', 'received_at', 'updated_at', 'name', 'status', 'website']).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
  }),
  create: z.object({
    websiteId: id, name: str(150).min(1), phone: optStr(40), email: z.string().trim().email().max(190).optional().nullable().or(z.literal('').transform(() => null)),
    location: optStr(), interest: optStr(), message: optStr(20000), source: optStr(100), medium: optStr(100), campaign: optStr(),
  }),
  update: z.object({
    name: optStr(150), phone: optStr(40), email: z.string().trim().email().max(190).optional().nullable(), location: optStr(), interest: optStr(),
    message: optStr(20000), statusId: optId,
  }),
  assign: z.object({ userId: id.nullable(), reason: optStr(255) }),
  bulk: z.object({
    ids: z.array(id).min(1).max(200), action: z.enum(['assign', 'status']), userId: id.nullable().optional(), statusId: optId,
  }),
  note: z.object({ body: str(5000).min(1, 'Note cannot be empty') }),
  followup: z.object({
    dueAt: z.string().datetime({ offset: true }), notes: optStr(5000), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), userId: optId,
  }),
  followupUpdate: z.object({
    dueAt: z.string().datetime({ offset: true }).optional(), notes: optStr(5000), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    status: z.enum(['UPCOMING', 'COMPLETED', 'CANCELLED']).optional(),
  }),
  followupQuery: pagination.extend({ scope: z.enum(['mine', 'all']).default('mine'), status: z.enum(['UPCOMING', 'COMPLETED', 'OVERDUE', 'today']).optional() }),
  duplicate: z.object({ action: z.enum(['MERGE', 'KEEP_SEPARATE']), primaryLeadId: optId }),
};

export const admin = {
  approve: z.object({ roleId: id, departmentId: optId, teamIds: z.array(id).default([]), websiteIds: z.array(id).min(1, 'Grant access to at least one website') }),
  reject: z.object({ reason: optStr(500) }),
  userQuery: pagination.extend({ search: optStr(100), status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'SUSPENDED', 'REJECTED']).optional(), roleCode: optStr(50), websiteId: optId }),
  userCreate: z.object({
    fullName: str(150).min(2), email: emailSchema, mobile: mobileSchema, password: passwordSchema, roleId: id,
    departmentId: optId, teamIds: z.array(id).default([]), websiteIds: z.array(id).default([]),
  }),
  userUpdate: z.object({
    fullName: str(150).min(2).optional(), email: emailSchema.optional(), mobile: mobileSchema.optional(), avatar: avatarSchema.optional(), roleId: id.optional(),
    departmentId: optId, teamIds: z.array(id).optional(), websiteIds: z.array(id).optional(),
  }),
  userStatus: z.object({ status: z.enum(['ACTIVE', 'DISABLED', 'SUSPENDED']), reason: optStr(500) }),
  department: z.object({ name: str(100).min(2), description: optStr(), isActive: z.boolean().optional() }),
  departmentUpdate: z.object({ name: str(100).min(2).optional(), description: optStr(), isActive: z.boolean().optional() }),
  team: z.object({ name: str(100).min(2), departmentId: id, websiteId: optId, description: optStr() }),
  teamUpdate: z.object({ name: str(100).min(2).optional(), departmentId: id.optional(), websiteId: optId, description: optStr(), isActive: z.boolean().optional() }),
  teamMembers: z.object({ members: z.array(z.object({ userId: id, isLead: z.boolean().default(false) })).max(500) }),
  website: z.object({ name: str(100).optional(), domain: optStr(), isActive: z.boolean().optional() }),
  status: z.object({
    code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use UPPER_SNAKE_CASE'), name: str(80).min(1), color: optStr(20),
    sortOrder: z.coerce.number().int().optional(), isConversion: z.boolean().optional(), isClosed: z.boolean().optional(),
  }),
  statusUpdate: z.object({
    name: str(80).optional(), color: optStr(20), sortOrder: z.coerce.number().int().optional(), isConversion: z.boolean().optional(),
    isClosed: z.boolean().optional(), isActive: z.boolean().optional(), isDefault: z.boolean().optional(),
  }),
  role: z.object({
    code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,49}$/, 'Use UPPER_SNAKE_CASE'), name: str(100).min(2), description: optStr(),
    level: z.coerce.number().int().min(1).max(99), permissionCodes: z.array(z.string()).default([]),
  }),
  rolePermissions: z.object({ permissionCodes: z.array(z.string().max(80)) }),
  settings: z.object({ settings: z.record(z.any()) }),
  integration: z.object({ isActive: z.boolean().optional(), requireSignature: z.boolean().optional() }),
  rotateKey: z.object({ requireSignature: z.boolean().default(false) }),
  auditQuery: pagination.extend({ action: optStr(60), actorId: optId, entityType: optStr(50), entityId: optStr(64), from: optStr(40), to: optStr(40) }),
  analyticsQuery: z.object({ websiteId: optId, from: optStr(40), to: optStr(40) }),
  broadcast: z.object({ title: str(200).min(1), body: optStr(1000), roleCode: optStr(50) }),
};

export const notifications = {
  listQuery: pagination.extend({ unreadOnly: bool.optional() }),
  prefs: z.object({ preferences: z.array(z.object({ type: z.string(), inApp: z.boolean(), push: z.boolean(), email: z.boolean() })) }),
  subscribe: z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(255), auth: z.string().max(255) }) }),
  unsubscribe: z.object({ endpoint: z.string().url().max(2000) }),
};
