"use strict";

// MongoDB is the only operational identity store for Component 4. It contains
// companies, company users, sessions and audit events—not academic records.
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { hashPassword, comparePassword } = require('./password-hasher');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const policy = { minLength: 10, upper: /[A-Z]/, lower: /[a-z]/, digit: /[0-9]/, symbol: /[^A-Za-z0-9]/ };
let models;

const companyId = (value) => String(value || '').trim().toUpperCase();
const email = (value) => String(value || '').trim().toLowerCase();
const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');
function passwordError(value) {
  const password = String(value || '');
  if (password.length < policy.minLength) return 'Password must be at least 10 characters long.';
  if (!policy.upper.test(password)) return 'Password must include an uppercase letter.';
  if (!policy.lower.test(password)) return 'Password must include a lowercase letter.';
  if (!policy.digit.test(password)) return 'Password must include a number.';
  if (!policy.symbol.test(password)) return 'Password must include a symbol.';
  return null;
}

function getModels() {
  if (models) return models;
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB is not connected');
  const { Schema } = mongoose;
  const Company = mongoose.models.Component4Company || mongoose.model('Component4Company', new Schema({ companyId: { type: String, unique: true, required: true }, companyName: { type: String, required: true }, status: { type: String, default: 'active' } }, { timestamps: true, versionKey: false }));
  const User = mongoose.models.Component4User || mongoose.model('Component4User', new Schema({ userId: { type: String, unique: true, required: true }, companyId: { type: String, index: true, required: true }, companyName: { type: String, required: true }, name: { type: String, required: true }, email: { type: String, unique: true, required: true }, role: { type: String, enum: ['admin', 'verifier', 'auditor'], default: 'verifier' }, status: { type: String, enum: ['active', 'inactive'], default: 'active' }, passwordHash: { type: String, required: true }, failedLoginAttempts: { type: Number, default: 0 }, lockedUntil: Date, lastFailedAt: Date, lastLoginAt: Date, mustChangePassword: { type: Boolean, default: false }, passwordChangedAt: Date, refreshTokenVersion: { type: Number, default: 0 }, passwordResetTokenHash: String, passwordResetExpiresAt: Date }, { timestamps: true, versionKey: false }));
  const Audit = mongoose.models.Component4Audit || mongoose.model('Component4Audit', new Schema({ eventType: { type: String, required: true }, actorEmail: String, companyId: { type: String, index: true }, details: { type: Schema.Types.Mixed, default: {} } }, { timestamps: true, versionKey: false }));
  // Refresh tokens are persisted as server-side sessions.  The token value is
  // never stored; only its signed JWT id (jti) is retained for rotation/revocation.
  const Session = mongoose.models.Component4Session || mongoose.model('Component4Session', new Schema({ jti: { type: String, unique: true, required: true }, userId: { type: String, index: true, required: true }, companyId: { type: String, index: true, required: true }, version: { type: Number, required: true }, expiresAt: { type: Date, required: true }, revokedAt: Date, replacedBy: String }, { timestamps: true, versionKey: false }));
  Session.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  models = { Company, User, Audit, Session };
  return models;
}

function publicCompany(value) { return { id: value.companyId, name: value.companyName, companyId: value.companyId, companyName: value.companyName, createdAt: value.createdAt }; }
function publicUser(value) { return { userId: value.userId, companyId: value.companyId, companyName: value.companyName, name: value.name, email: value.email, role: value.role, status: value.status, mustChangePassword: Boolean(value.mustChangePassword), emailVerified: true, lastLoginAt: value.lastLoginAt || null, createdAt: value.createdAt, updatedAt: value.updatedAt }; }
async function addAuditEvent(eventType, actorEmail, ownerCompanyId, details = {}) { const { Audit } = getModels(); await Audit.create({ eventType, actorEmail: email(actorEmail), companyId: companyId(ownerCompanyId), details }); }

async function listCompanies() { const { Company } = getModels(); return (await Company.find({ status: 'active' }).sort({ companyName: 1 }).lean()).map(publicCompany); }
function getPasswordPolicySummary() { return { minLength: policy.minLength, requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true }; }

async function registerCompanyAdmin(input) {
  const id = companyId(input.companyId); const name = String(input.companyName || '').trim(); const adminEmail = email(input.adminEmail); const adminName = String(input.adminName || '').trim();
  if (!id || !name || !adminEmail || !adminName || !input.adminPassword) return { success: false, status: 400, error: 'All company and administrator fields are required.' };
  const error = passwordError(input.adminPassword); if (error) return { success: false, status: 400, error };
  const { Company, User } = getModels();
  if (await Company.exists({ companyId: id })) return { success: false, status: 409, error: 'Company ID is already registered.' };
  if (await User.exists({ email: adminEmail })) return { success: false, status: 409, error: 'Email is already registered.' };
  const company = await Company.create({ companyId: id, companyName: name });
  const user = await User.create({ userId: `usr_${new mongoose.Types.ObjectId()}`, companyId: id, companyName: name, name: adminName, email: adminEmail, role: 'admin', passwordHash: await hashPassword(input.adminPassword, BCRYPT_ROUNDS), passwordChangedAt: new Date() });
  await addAuditEvent('company_signup', adminEmail, id, { userId: user.userId });
  return { success: true, status: 201, company: publicCompany(company), user: publicUser(user) };
}

async function authenticateCompanyUser(input) {
  const id = companyId(input.companyId); const userEmail = email(input.email); const { User } = getModels(); const user = await User.findOne({ companyId: id, email: userEmail });
  if (!user || user.status !== 'active') { await addAuditEvent('login_failed', userEmail, id, { reason: 'invalid_credentials' }); return { success: false, status: 401, error: 'Invalid company credentials.' }; }
  const now = Date.now();
  if (user.lockedUntil?.getTime() > now) return { success: false, status: 423, error: `Account locked. Try again in ${Math.ceil((user.lockedUntil.getTime() - now) / 60000)} minute(s).` };
  if (user.lastFailedAt && now - user.lastFailedAt.getTime() > LOCKOUT_MS) { user.failedLoginAttempts = 0; user.lockedUntil = null; }
  if (!(await comparePassword(String(input.password || ''), user.passwordHash))) { user.failedLoginAttempts += 1; user.lastFailedAt = new Date(); if (user.failedLoginAttempts >= MAX_FAILURES) user.lockedUntil = new Date(now + LOCKOUT_MS); await user.save(); await addAuditEvent('login_failed', userEmail, id, { attempts: user.failedLoginAttempts }); return { success: false, status: 401, error: 'Invalid company credentials.' }; }
  user.failedLoginAttempts = 0; user.lastFailedAt = null; user.lockedUntil = null; user.lastLoginAt = new Date(); await user.save(); await addAuditEvent('login_success', userEmail, id, { userId: user.userId, role: user.role });
  return { success: true, user: publicUser(user) };
}

async function createCompanyUser(actor, input) {
  const id = companyId(actor.companyId); const userEmail = email(input.email); const name = String(input.name || '').trim(); const role = ['admin', 'verifier', 'auditor'].includes(input.role) ? input.role : null;
  if (!name || !userEmail || !role || !input.password) return { success: false, status: 400, error: 'Name, email, role and password are required.' };
  const error = passwordError(input.password); if (error) return { success: false, status: 400, error };
  const { Company, User } = getModels(); const company = await Company.findOne({ companyId: id }); if (!company) return { success: false, status: 404, error: 'Company not found.' }; if (await User.exists({ email: userEmail })) return { success: false, status: 409, error: 'Email is already registered.' };
  const user = await User.create({ userId: `usr_${new mongoose.Types.ObjectId()}`, companyId: id, companyName: company.companyName, name, email: userEmail, role, status: input.status === 'inactive' ? 'inactive' : 'active', passwordHash: await hashPassword(input.password, BCRYPT_ROUNDS), passwordChangedAt: new Date(), mustChangePassword: Boolean(input.mustChangePassword) });
  await addAuditEvent('admin_user_created', actor.userEmail, id, { userId: user.userId, email: userEmail, role }); return { success: true, status: 201, user: publicUser(user) };
}

async function updateCompanyUser(actor, targetEmail, updates) { const { User } = getModels(); const user = await User.findOne({ companyId: companyId(actor.companyId), email: email(targetEmail) }); if (!user) return { success: false, status: 404, error: 'User not found.' }; if (updates.name?.trim()) user.name = updates.name.trim(); if (['admin','verifier','auditor'].includes(updates.role)) user.role = updates.role; if (['active','inactive'].includes(updates.status)) user.status = updates.status; if (updates.password) { const error = passwordError(updates.password); if (error) return { success:false,status:400,error }; user.passwordHash = await hashPassword(updates.password, BCRYPT_ROUNDS); user.passwordChangedAt = new Date(); user.refreshTokenVersion += 1; } await user.save(); await addAuditEvent('admin_user_updated', actor.userEmail, user.companyId, { userId: user.userId, email: user.email }); return { success: true, status: 200, user: publicUser(user) }; }
async function listCompanyUsers(value) { const { User } = getModels(); return (await User.find({ companyId: companyId(value) }).sort({ createdAt: -1 }).lean()).map(publicUser); }
async function listAuditEvents({ companyId: value, limit }) { const { Audit } = getModels(); return Audit.find({ companyId: companyId(value) }).sort({ createdAt: -1 }).limit(Math.min(Math.max(Number(limit) || 40, 1), 200)).lean(); }
async function getUserByEmail(value) { return getModels().User.findOne({ email: email(value) }); }
async function getUserById(userId) { return getModels().User.findOne({ userId }); }
async function bumpRefreshTokenVersion(userId) { const user = await getModels().User.findOneAndUpdate({ userId }, { $inc: { refreshTokenVersion: 1 } }, { new: true }); return user?.refreshTokenVersion || null; }
async function createRefreshSession(input) { const { Session } = getModels(); return Session.create({ jti: input.jti, userId: input.userId, companyId: input.companyId, version: input.version, expiresAt: input.expiresAt }); }
async function getRefreshSession(jti) { return getModels().Session.findOne({ jti }); }
async function revokeRefreshSession(jti, replacedBy = null) { return getModels().Session.findOneAndUpdate({ jti, revokedAt: null }, { revokedAt: new Date(), ...(replacedBy ? { replacedBy } : {}) }, { new: true }); }
async function revokeUserRefreshSessions(userId) { return getModels().Session.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() }); }
async function ensureEmailVerificationToken(value) { const user = await getUserByEmail(value); return user ? { success: true, token: null, expiresAt: null, user: publicUser(user) } : { success: false, error: 'User not found.' }; }
async function verifyEmailWithToken() { return { success: false, error: 'Email verification is not configured.' }; }
async function ensurePasswordResetToken(value) { const user = await getUserByEmail(value); if (!user) return { success: false, error: 'User not found.' }; const token = randomToken(); user.passwordResetTokenHash = hashToken(token); user.passwordResetExpiresAt = new Date(Date.now() + 3600000); await user.save(); return { success: true, token, expiresAt: user.passwordResetExpiresAt, user: publicUser(user) }; }
async function resetPasswordWithToken(token, password) { const error = passwordError(password); if (error) return { success: false, error }; const user = await getModels().User.findOne({ passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: { $gt: new Date() } }); if (!user) return { success: false, error: 'Invalid or expired reset token.' }; user.passwordHash = await hashPassword(password,BCRYPT_ROUNDS); user.passwordResetTokenHash = undefined; user.passwordResetExpiresAt = undefined; user.refreshTokenVersion += 1; user.failedLoginAttempts = 0; user.lockedUntil = null; await user.save(); await addAuditEvent('password_reset_completed', user.email, user.companyId, { userId: user.userId }); return { success: true, user: publicUser(user) }; }

module.exports = { listCompanies, registerCompanyAdmin, authenticateCompanyUser, createCompanyUser, updateCompanyUser, listCompanyUsers, listAuditEvents, getPasswordPolicySummary, addAuditEvent, getUserByEmail, getUserById, bumpRefreshTokenVersion, createRefreshSession, getRefreshSession, revokeRefreshSession, revokeUserRefreshSessions, ensureEmailVerificationToken, verifyEmailWithToken, ensurePasswordResetToken, resetPasswordWithToken, hashToken };
